# testing-steps: container observer PoC

PoC for capturing Docker container CPU/memory on Nx Agents and attributing
containers to nx tasks. A pure observer against the DinD sidecar's docker
socket: watches container events, resolves attribution from `cloud.nx.task.*`
labels (falling back to `org.testcontainers.sessionId`, then unattributed),
samples per-container stats each second, and writes:

- `metrics.ndjson` — `MetricsUpdate`-shaped lines (same shape as the existing
  task-metrics artifact, `groupType: "Container"` groups with `taskIds`)
- `spans.ndjson` — one lifetime record per container with attribution and
  `endReason` (`died`, or `observer-shutdown` for containers still running
  when the observer is killed — spans are flushed on SIGTERM)

Runs on Nx Agents with **no executor changes**: `ci-step/` is a custom
workflow step template whose `main` script backgrounds the observer (it
survives step completion — the executor waits on the step process only) and
whose `post` script runs after the agent finishes, SIGTERMs the observer, and
prints the captured data into a visible step log.

## Use in a workspace

Add to `.nx/workflows/agents.yaml`:

```yaml
launch-templates:
  observer-poc:
    resource-class: 'docker_linux_amd64/medium+'
    image: 'ubuntu22.04-node20.11-v10'
    init-steps:
      - name: Checkout
        uses: 'nrwl/nx-cloud-workflows/v5/workflow-steps/checkout/main.yaml'
      - name: Container Observer (PoC)
        uses: 'barbados-clemens/testing-steps/main/ci-step/template.yaml'
        env:
          OBSERVER_BIN_URL: 'https://raw.githubusercontent.com/barbados-clemens/testing-steps/main/bin/observer-linux-amd64'
      - name: Install Node Modules
        uses: 'nrwl/nx-cloud-workflows/v5/workflow-steps/install-node-modules/main.yaml'
```

Then run a CIPE with tasks that spin up containers (TestContainers, compose,
plain `docker run`). The "Container Observer (PoC)" post step's log shows
every container lifetime with attribution, plus the last metrics samples.

For arm resource classes point `OBSERVER_BIN_URL` at
`bin/observer-linux-arm64` instead.

### Step env

| Env var | Effect |
| --- | --- |
| `OBSERVER_BIN_URL` | download the observer binary from this URL |
| `OBSERVER_BIN_PATH` | use a binary committed in the workspace instead (checkout must run first) |
| `OBS_OUT_DIR` | output dir (default `/tmp/nx-container-observer`) |
| `OBSERVER_UPLOAD=true` | post step also stages `metrics.ndjson` into `NX_CLOUD_METRICS_DIRECTORY` with a `.complete` marker so the existing metrics uploader ships it to workspace file storage (bytes only — no registration row, so check the bucket, not the UI) |

## Attributing your containers to tasks

nx sets `NX_TASK_TARGET_PROJECT` / `NX_TASK_TARGET_TARGET` /
`NX_TASK_TARGET_CONFIGURATION` in every task process. Pass them through as
labels on containers you create:

```bash
docker run --label cloud.nx.task.project=$NX_TASK_TARGET_PROJECT \
           --label cloud.nx.task.target=$NX_TASK_TARGET_TARGET ...
```

Compose `labels:` with `${VAR}` interpolation and TestContainers
`withLabels()` work the same way. Unlabeled containers are still captured
(TestContainers session id, or unattributed).

## Building the binary

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o bin/observer-linux-amd64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o bin/observer-linux-arm64 .
```

Pinned to `docker/docker@v27.3.1+incompatible` (the DinD sidecar version on
Nx Agents) with `go-connections@v0.5.0` (newer drops `sockets.DialPipe` and
breaks the v27 client).

## Local run

```bash
# OrbStack on macOS:
OBS_DOCKER_SOCK=$HOME/.orbstack/run/docker.sock ./run.sh
# Docker Desktop / Linux:
./run.sh
```

By default this launches two demo workloads: one labeled with
`cloud.nx.task.*`, one unlabeled, so both attribution outcomes appear side by
side. `OBS_DEMO=0` disables the demo; `OBS_EXIT_AFTER_DEMO=1` self-exits;
`OBS_INCLUDE_PREEXISTING=0` skips containers that predate the run.
