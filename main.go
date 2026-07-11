// docker-observer-go — phase-1 prototype of the Nx Cloud container observer.
//
// This is the decided approach from the docker-sidecar-metrics design work:
// a pure OBSERVER, never in the docker data path. Customer traffic hits the
// real socket untouched; we are just another Docker API client. No relay, no
// DOCKER_HOST repointing, no protocol handling — the official SDK does HTTP.
//
// What it does:
//   - classifies containers already running at startup as "pre-existing"
//   - watches container events; on start: inspect (name, image, labels, pid)
//   - resolves attribution: cloud.nx.task.* labels (exact, opt-in)
//     -> org.testcontainers.sessionId (clusters by creating process)
//     -> unattributed (server-side time-overlap would apply here)
//   - polls one-shot stats each tick; CPU%% from deltas across our own ticks,
//     memory = usage - inactive_file (same arithmetic as `docker stats`)
//   - appends MetricsUpdate-shaped NDJSON (same shape as the existing task
//     metrics artifact) to metrics.ndjson, and span records to spans.ndjson
//
// Run (OrbStack on macOS):
//
//	OBS_DOCKER_SOCK=$HOME/.orbstack/run/docker.sock go run .
//
// By default it launches two demo workloads through the plain docker CLI:
// one labeled with cloud.nx.task.* (as a user following our docs would), one
// unlabeled — so you see both attribution outcomes side by side.
// OBS_DEMO=0 disables that; OBS_EXIT_AFTER_DEMO=1 exits after the demo;
// OBS_INCLUDE_PREEXISTING=0 skips containers that predate the run (they are
// sampled by default, attributed "pre-existing" unless labeled).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
)

// ---------------------------------------------------------------------------
// config & output files
// ---------------------------------------------------------------------------

type config struct {
	sock   string
	outDir string
}

func loadConfig() config {
	sock := os.Getenv("OBS_DOCKER_SOCK")
	if sock == "" {
		sock = "/var/run/docker.sock"
	}
	outDir := os.Getenv("OBS_OUT_DIR")
	if outDir == "" {
		outDir = "/tmp/nx-docker-observer"
	}
	return config{sock: sock, outDir: outDir}
}

// ---------------------------------------------------------------------------
// attribution ladder (rungs 1, 2 and 4 — rung 3, time-overlap against task
// windows, happens server-side where task start/end times already live)
// ---------------------------------------------------------------------------

type attribution struct {
	Kind   string `json:"kind"`   // "task" | "testcontainers-session" | "unattributed"
	Detail string `json:"detail"` // task id, session id, or ""
}

func attributeFrom(labels map[string]string) attribution {
	if project, ok := labels["cloud.nx.task.project"]; ok {
		id := project
		if target, ok := labels["cloud.nx.task.target"]; ok {
			id += ":" + target
		}
		if cfg, ok := labels["cloud.nx.task.configuration"]; ok {
			id += ":" + cfg
		}
		return attribution{Kind: "task", Detail: id}
	}
	if session, ok := labels["org.testcontainers.sessionId"]; ok {
		return attribution{Kind: "testcontainers-session", Detail: session}
	}
	return attribution{Kind: "unattributed"}
}

func (a attribution) String() string {
	if a.Detail == "" {
		return a.Kind
	}
	return a.Kind + ":" + a.Detail
}

// ---------------------------------------------------------------------------
// observer
// ---------------------------------------------------------------------------

type trackedContainer struct {
	id         string
	name       string
	image      string
	pid        int
	startedAt  time.Time
	attr       attribution
	prevTotal  uint64 // cpu_stats.cpu_usage.total_usage at previous tick
	prevSystem uint64 // cpu_stats.system_cpu_usage at previous tick
}

// local decode target for /containers/{id}/stats — decoding into our own
// struct sidesteps SDK type-name churn between docker API versions
type statsDoc struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

type observer struct {
	cli     *client.Client
	mu      sync.Mutex
	tracked map[string]*trackedContainer
	metrics *os.File
	spans   *os.File
}

func newObserver(cli *client.Client, outDir string) (*observer, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	metrics, err := os.OpenFile(filepath.Join(outDir, "metrics.ndjson"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	spans, err := os.OpenFile(filepath.Join(outDir, "spans.ndjson"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	return &observer{cli: cli, tracked: map[string]*trackedContainer{}, metrics: metrics, spans: spans}, nil
}

// track inspects the container and starts sampling it. Called on the `start`
// event — inspect at tracking time (not create-event time) absorbs the race
// between dockerd emitting `create` and the creator's create call returning.
// preExisting marks containers already running when the observer started
// (self-hosted runner leftovers): sampled like any other, but bucketed as
// "pre-existing" unless their labels attribute them.
func (o *observer) track(ctx context.Context, id string, preExisting bool) {
	info, err := o.cli.ContainerInspect(ctx, id)
	if err != nil {
		return // died before we could inspect it
	}
	startedAt, _ := time.Parse(time.RFC3339Nano, info.State.StartedAt)
	attr := attributeFrom(info.Config.Labels)
	if preExisting && attr.Kind == "unattributed" {
		attr = attribution{Kind: "pre-existing"}
	}
	t := &trackedContainer{
		id:        id,
		name:      trimSlash(info.Name),
		image:     info.Config.Image,
		pid:       info.State.Pid,
		startedAt: startedAt,
		attr:      attr,
	}
	o.mu.Lock()
	o.tracked[id] = t
	o.mu.Unlock()
	fmt.Printf("[track] %s %s (%s) pid=%d -> %s\n", shortID(id), t.name, t.image, t.pid, t.attr)
}

func (o *observer) untrack(id string) {
	o.finish(id, "died")
}

// finish removes the container from tracking and writes its span record.
// endReason is "died" for real deaths and "observer-shutdown" for spans
// force-flushed at exit, so containers that outlive the observer (killed by
// a CI post step at workflow teardown) still get a record.
func (o *observer) finish(id string, endReason string) {
	o.mu.Lock()
	t, ok := o.tracked[id]
	delete(o.tracked, id)
	o.mu.Unlock()
	if !ok {
		return
	}
	span := map[string]any{
		"containerId": t.id,
		"name":        t.name,
		"image":       t.image,
		"attribution": t.attr,
		"startedAt":   t.startedAt.UTC().Format(time.RFC3339Nano),
		"diedAt":      time.Now().UTC().Format(time.RFC3339Nano),
		"durationMs":  time.Since(t.startedAt).Milliseconds(),
		"endReason":   endReason,
	}
	line, _ := json.Marshal(span)
	fmt.Fprintln(o.spans, string(line))
	fmt.Printf("[span]  %s (%s) lived %.1fs -> %s\n", t.name, t.image, time.Since(t.startedAt).Seconds(), t.attr)
}

func (o *observer) shutdown() {
	o.mu.Lock()
	ids := make([]string, 0, len(o.tracked))
	for id := range o.tracked {
		ids = append(ids, id)
	}
	o.mu.Unlock()
	for _, id := range ids {
		o.finish(id, "observer-shutdown")
	}
	o.metrics.Close()
	o.spans.Close()
}

// tick samples every tracked container once and appends one NDJSON line in
// the MetricsUpdate shape the existing task-metrics artifact uses:
//
//	{ timestamp, processes: [{pid,cpu,memory}], metadata: { groups, processes } }
func (o *observer) tick(ctx context.Context) {
	o.mu.Lock()
	snapshot := make([]*trackedContainer, 0, len(o.tracked))
	for _, t := range o.tracked {
		snapshot = append(snapshot, t)
	}
	o.mu.Unlock()
	if len(snapshot) == 0 {
		return
	}

	type procEntry struct {
		PID    int     `json:"pid"`
		CPU    float64 `json:"cpu"`
		Memory uint64  `json:"memory"`
	}
	processes := []procEntry{}
	groups := map[string]any{}
	procMeta := map[string]any{}
	consoleParts := []string{}

	for _, t := range snapshot {
		resp, err := o.cli.ContainerStatsOneShot(ctx, t.id)
		if err != nil {
			continue // container is gone; the die event will untrack it
		}
		var s statsDoc
		decodeErr := json.NewDecoder(resp.Body).Decode(&s)
		resp.Body.Close()
		if decodeErr != nil {
			continue
		}

		// one-shot stats have no reliable precpu window — compute the CPU%
		// delta across our own ticks instead
		total := s.CPUStats.CPUUsage.TotalUsage
		system := s.CPUStats.SystemUsage
		onlineCPUs := s.CPUStats.OnlineCPUs
		if onlineCPUs == 0 {
			onlineCPUs = 1
		}
		cpu := 0.0
		if t.prevSystem > 0 && system > t.prevSystem {
			cpu = float64(total-t.prevTotal) / float64(system-t.prevSystem) * float64(onlineCPUs) * 100
		}
		t.prevTotal, t.prevSystem = total, system

		// working-set memory, same arithmetic as `docker stats` (v2 then v1)
		inactiveFile := s.MemoryStats.Stats["inactive_file"]
		if inactiveFile == 0 {
			inactiveFile = s.MemoryStats.Stats["total_inactive_file"]
		}
		memory := s.MemoryStats.Usage
		if inactiveFile < memory {
			memory -= inactiveFile
		}

		groupID := "container:" + shortID(t.id)
		processes = append(processes, procEntry{PID: t.pid, CPU: round2(cpu), Memory: memory})
		taskIDs := []string{}
		if t.attr.Kind == "task" {
			taskIDs = append(taskIDs, t.attr.Detail)
		}
		groups[groupID] = map[string]any{
			"groupType":   "Container",
			"id":          groupID,
			"displayName": fmt.Sprintf("%s (%s)", t.image, t.name),
			"taskIds":     taskIDs,
			"attribution": t.attr,
			"containerId": t.id,
			"startedAt":   t.startedAt.UTC().Format(time.RFC3339Nano),
		}
		procMeta[fmt.Sprint(t.pid)] = map[string]any{"groupId": groupID}
		consoleParts = append(consoleParts,
			fmt.Sprintf("%s cpu=%.1f%% mem=%.1fMiB", t.name, cpu, float64(memory)/(1024*1024)))
	}

	if len(processes) == 0 {
		return
	}
	line, _ := json.Marshal(map[string]any{
		"timestamp": time.Now().UnixMilli(),
		"processes": processes,
		"metadata":  map[string]any{"groups": groups, "processes": procMeta},
	})
	fmt.Fprintln(o.metrics, string(line))
	fmt.Printf("[metrics] %s\n", joinParts(consoleParts))
}

// ---------------------------------------------------------------------------
// demo workloads — plain `docker run` through the user's normal environment;
// nothing is intercepted. The labeled one does what our docs would tell users:
// pass NX_TASK_TARGET_* through as cloud.nx.task.* labels.
// ---------------------------------------------------------------------------

const demoScript = `i=0; while [ $i -lt 10 ]; do ` +
	`dd if=/dev/zero of=/dev/shm/ballast.$i bs=1M count=16 2>/dev/null; ` +
	`md5sum /dev/shm/ballast.* >/dev/null; i=$((i+1)); sleep 1; done`

func runDemo(sock string, done chan<- struct{}) {
	// simulate the env nx injects into every task process
	fakeEnv := map[string]string{
		"NX_TASK_TARGET_PROJECT": "my-app",
		"NX_TASK_TARGET_TARGET":  "test",
	}
	labeled := exec.Command("docker", "run", "--rm", "--shm-size=256m",
		"--name", "nx-demo-labeled",
		"--label", "cloud.nx.task.project="+fakeEnv["NX_TASK_TARGET_PROJECT"],
		"--label", "cloud.nx.task.target="+fakeEnv["NX_TASK_TARGET_TARGET"],
		"alpine", "sh", "-c", demoScript)
	unlabeled := exec.Command("docker", "run", "--rm", "--shm-size=128m",
		"--name", "nx-demo-unlabeled",
		"alpine", "sh", "-c",
		`sleep 2; dd if=/dev/zero of=/dev/shm/x bs=1M count=48 2>/dev/null; md5sum /dev/shm/x >/dev/null; sleep 3`)

	// pin the CLI at the same daemon the observer watches
	env := append(os.Environ(), "DOCKER_HOST=unix://"+sock)
	labeled.Env, unlabeled.Env = env, env

	fmt.Println("[demo] starting 2 workloads: labeled (memory staircase + cpu, ~10s) and unlabeled (~6s)")
	_ = unlabeled.Start()
	_ = labeled.Start()
	_ = unlabeled.Wait()
	_ = labeled.Wait()
	fmt.Println("[demo] workloads finished")
	close(done)
}

// ---------------------------------------------------------------------------

func main() {
	cfg := loadConfig()
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+cfg.sock),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		fail("docker client: %v", err)
	}
	if _, err := cli.Ping(ctx); err != nil {
		fail("cannot reach dockerd at %s: %v", cfg.sock, err)
	}

	obs, err := newObserver(cli, cfg.outDir)
	if err != nil {
		fail("observer: %v", err)
	}
	fmt.Printf("[observer] watching %s, writing %s/{metrics,spans}.ndjson\n", cfg.sock, cfg.outDir)

	// containers already running: sample them too (bucketed "pre-existing")
	running, err := cli.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		fail("container list: %v", err)
	}
	for _, c := range running {
		if os.Getenv("OBS_INCLUDE_PREEXISTING") == "0" {
			fmt.Printf("[pre-existing] %s %v (%s) — skipped (OBS_INCLUDE_PREEXISTING=0)\n",
				shortID(c.ID), c.Names, c.Image)
			continue
		}
		obs.track(ctx, c.ID, true)
	}

	// event loop: drives track/untrack
	go func() {
		for {
			msgs, errs := cli.Events(ctx, events.ListOptions{
				Filters: filters.NewArgs(filters.Arg("type", "container")),
			})
			for {
				select {
				case msg := <-msgs:
					action := string(msg.Action)
					switch action {
					case "start":
						fmt.Printf("[event] start %s\n", shortID(msg.Actor.ID))
						obs.track(ctx, msg.Actor.ID, false)
					case "die":
						fmt.Printf("[event] die   %s\n", shortID(msg.Actor.ID))
						obs.untrack(msg.Actor.ID)
					}
				case err := <-errs:
					// metrics-only failure: reconnect after a beat; customer
					// docker traffic is unaffected either way
					fmt.Fprintf(os.Stderr, "[events] stream error (reconnecting): %v\n", err)
					time.Sleep(time.Second)
					goto reconnect
				}
			}
		reconnect:
		}
	}()

	// sampling loop
	go func() {
		for range time.Tick(time.Second) {
			obs.tick(ctx)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	if os.Getenv("OBS_DEMO") != "0" {
		done := make(chan struct{})
		go runDemo(cfg.sock, done)
		if os.Getenv("OBS_EXIT_AFTER_DEMO") == "1" {
			select {
			case <-done:
				time.Sleep(2500 * time.Millisecond) // let die events + last tick flush
			case <-sigCh:
			}
			obs.shutdown()
			return
		}
	}

	// run until SIGTERM/SIGINT (e.g. the CI post step killing us), then
	// flush spans for anything still running so no lifetimes are lost
	<-sigCh
	fmt.Println("[observer] signal received — flushing open spans")
	obs.shutdown()
}

// ---------------------------------------------------------------------------

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func trimSlash(name string) string {
	if len(name) > 0 && name[0] == '/' {
		return name[1:]
	}
	return name
}

func round2(f float64) float64 {
	if f < 0 {
		return 0
	}
	return float64(int(f*100)) / 100
}

func joinParts(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += "  "
		}
		out += p
	}
	return out
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
