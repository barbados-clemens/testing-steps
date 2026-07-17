// GENERATED FILE — do not edit by hand.
// Built by build/build.mjs from nrwl/ocean
//   libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/
//   ocean commit: d924386db2
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// shims/nx-imports.ts
var nx_imports_exports = {};
__export(nx_imports_exports, {
  cacheDirectory: () => cacheDirectory
});
var cacheDirectory;
var init_nx_imports = __esm({
  "shims/nx-imports.ts"() {
    cacheDirectory = "/tmp/nx-cache";
  }
});

// env-defaults.ts
process.env.NX_CLOUD_ENABLE_CONTAINER_METRICS ||= "true";
process.env.NX_CLOUD_VERSION ||= "container-observer-poc";
process.env.NX_CLOUD_VERBOSE_LOGGING ||= "true";
process.env.NX_CLOUD_METRICS_DIRECTORY ||= "/var/upload/metrics";

// entry.ts
var import_child_process = require("child_process");
var import_fs2 = require("fs");
var os = __toESM(require("os"));
var import_crypto = require("crypto");

// ../../../../../../../Users/caleb/.superset/worktrees/eb82205c-d98f-4d3f-bb0b-4effa0e79939/quark-lantana/libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/container-observer.ts
var import_fs = require("fs");
var import_path = require("path");

// shims/environment.ts
var NX_CLOUD_DISABLE_METRICS_COLLECTION = process.env.NX_CLOUD_DISABLE_METRICS_COLLECTION === "true";
var VERBOSE_LOGGING = process.env.NX_VERBOSE_LOGGING === "true" || process.env.NX_CLOUD_VERBOSE_LOGGING === "true";

// shims/get-vcs-context.ts
function detectNxCloud(env) {
  return env.NX_CLOUD_VERSION != null && env.NX_CLOUD_VERSION !== "";
}

// ../../../../../../../Users/caleb/.superset/worktrees/eb82205c-d98f-4d3f-bb0b-4effa0e79939/quark-lantana/libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/attribution.ts
var BUILDX_CONTAINER_PREFIX = "buildx_buildkit_";
function attributeContainer(labels, env, containerName) {
  const l = labels ?? {};
  if (l["cloud.nx.task.project"]) {
    return {
      kind: "task",
      detail: taskId(
        l["cloud.nx.task.project"],
        l["cloud.nx.task.target"],
        l["cloud.nx.task.configuration"]
      ),
      via: "labels"
    };
  }
  let project;
  let target;
  let configuration;
  for (const kv of env ?? []) {
    const eq = kv.indexOf("=");
    if (eq < 0)
      continue;
    const key = kv.slice(0, eq);
    const value = kv.slice(eq + 1);
    if (key === "NX_TASK_TARGET_PROJECT")
      project = value;
    else if (key === "NX_TASK_TARGET_TARGET")
      target = value;
    else if (key === "NX_TASK_TARGET_CONFIGURATION")
      configuration = value;
  }
  if (project) {
    return {
      kind: "task",
      detail: taskId(project, target, configuration),
      via: "env"
    };
  }
  if (l["org.testcontainers.sessionId"]) {
    return {
      kind: "testcontainers-session",
      detail: l["org.testcontainers.sessionId"]
    };
  }
  if (l["com.docker.compose.project"]) {
    return { kind: "compose-project", detail: l["com.docker.compose.project"] };
  }
  if (containerName.startsWith(BUILDX_CONTAINER_PREFIX) && containerName.length > BUILDX_CONTAINER_PREFIX.length) {
    return {
      kind: "buildx-builder",
      detail: containerName.slice(BUILDX_CONTAINER_PREFIX.length)
    };
  }
  return { kind: "unattributed", detail: "" };
}
function taskId(project, target, configuration) {
  let id = project;
  if (target)
    id += `:${target}`;
  if (configuration)
    id += `:${configuration}`;
  return id;
}

// ../../../../../../../Users/caleb/.superset/worktrees/eb82205c-d98f-4d3f-bb0b-4effa0e79939/quark-lantana/libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/docker-api-client.ts
var http = __toESM(require("http"));
var MAX_UNARY_RESPONSE_BYTES = 4 * 1024 * 1024;
var DockerApiError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
};
function isNotFound(e) {
  return e instanceof DockerApiError && e.statusCode === 404;
}
var DockerApiClient = class {
  constructor(socketPath, unaryTimeoutMs) {
    this.socketPath = socketPath;
    this.unaryTimeoutMs = unaryTimeoutMs;
  }
  get(path) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { socketPath: this.socketPath, path, method: "GET" },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_UNARY_RESPONSE_BYTES) {
              req.destroy(new Error(`GET ${path}: response too large`));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode !== 200) {
              reject(
                new DockerApiError(
                  res.statusCode ?? 0,
                  `GET ${path}: status ${res.statusCode}: ${body.slice(0, 512)}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.setTimeout(
        this.unaryTimeoutMs,
        () => req.destroy(new Error(`GET ${path}: timed out`))
      );
      req.on("error", reject);
      req.on("socket", (socket) => socket.unref());
      req.end();
    });
  }
  async ping() {
    await this.get("/_ping").catch((e) => {
      if (e instanceof DockerApiError)
        throw e;
      if (e instanceof SyntaxError)
        return;
      throw e;
    });
  }
  listContainers() {
    return this.get("/containers/json");
  }
  inspectContainer(id) {
    return this.get(
      `/containers/${encodeURIComponent(id)}/json`
    );
  }
  /**
   * one-shot (API ≥ 1.41) skips the daemon's internal 1s pre-sample; CPU% is
   * computed from deltas across our own ticks, so the missing precpu window
   * is irrelevant.
   */
  statsOneShot(id) {
    return this.get(
      `/containers/${encodeURIComponent(id)}/stats?stream=false&one-shot=true`
    );
  }
  /**
   * Opens the container-event stream and invokes onEvent per parsed event.
   * No timeout: the stream is expected to stay open indefinitely; end it via
   * close() or let the daemon drop it — `done` resolves either way.
   */
  streamEvents(onEvent) {
    let closeFn = () => {
    };
    const done = new Promise((resolve) => {
      const filters = encodeURIComponent('{"type":["container"]}');
      const req = http.request(
        {
          socketPath: this.socketPath,
          path: `/events?filters=${filters}`,
          method: "GET"
        },
        (res) => {
          if (res.statusCode !== 200) {
            req.destroy();
            resolve();
            return;
          }
          let buffer = "";
          res.on("data", (chunk) => {
            buffer += chunk.toString("utf8");
            let newline;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              if (!line)
                continue;
              try {
                onEvent(JSON.parse(line));
              } catch {
              }
            }
          });
          res.on("end", () => resolve());
          res.on("error", () => resolve());
        }
      );
      req.on("error", () => resolve());
      req.on("socket", (socket) => socket.unref());
      req.end();
      closeFn = () => req.destroy();
    });
    return { done, close: closeFn };
  }
};

// ../../../../../../../Users/caleb/.superset/worktrees/eb82205c-d98f-4d3f-bb0b-4effa0e79939/quark-lantana/libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/container-observer.ts
function defaultWriteDirectory() {
  if (process.env.NX_CLOUD_METRICS_DIRECTORY) {
    return process.env.NX_CLOUD_METRICS_DIRECTORY;
  }
  const { cacheDirectory: cacheDirectory2 } = (init_nx_imports(), __toCommonJS(nx_imports_exports));
  return `${cacheDirectory2}/metrics`;
}
var DEFAULT_SOCKET_PATH = "/var/run/docker.sock";
var ENABLE_ENV_VAR = "NX_CLOUD_ENABLE_CONTAINER_METRICS";
var DEFAULT_OPTIONS = {
  socketPath: DEFAULT_SOCKET_PATH,
  tickIntervalMs: 1e3,
  unaryTimeoutMs: 3e3,
  maxTracked: 256,
  maxSamples: 21600,
  statsConcurrency: 4,
  eventReconnectBaseDelayMs: 1e3,
  eventReconnectMaxDelayMs: 3e4,
  eventMaxConsecutiveFailures: 10
};
function startContainerObserver(artifactId, overrides) {
  try {
    const enabled = process.env[ENABLE_ENV_VAR];
    if (NX_CLOUD_DISABLE_METRICS_COLLECTION || enabled !== "true" && enabled !== "1") {
      return null;
    }
    const opts = {
      ...DEFAULT_OPTIONS,
      writeDirectory: overrides?.writeDirectory ?? defaultWriteDirectory(),
      ...overrides
    };
    if (!(0, import_fs.existsSync)(opts.socketPath)) {
      return null;
    }
    (0, import_fs.mkdirSync)(opts.writeDirectory, { recursive: true });
    const observer = new ContainerObserver(artifactId, opts);
    observer.init();
    return observer;
  } catch (e) {
    debugLog("container observer failed to start", e);
    return null;
  }
}
var ContainerObserver = class {
  constructor(artifactId, opts) {
    this.artifactId = artifactId;
    this.opts = opts;
    this.artifactFilePath = (0, import_path.join)(opts.writeDirectory, artifactId);
    this.client = new DockerApiClient(opts.socketPath, opts.unaryTimeoutMs);
    this.stream = (0, import_fs.createWriteStream)(this.artifactFilePath, {
      flags: "a",
      encoding: "utf8"
    });
    this.stream.on("error", (e) => {
      this.writeFailed = true;
      debugLog("artifact write failed; container metrics stopped", e);
    });
  }
  artifactFilePath;
  client;
  tracked = /* @__PURE__ */ new Map();
  stream;
  stopped = false;
  stopPromise = null;
  tickTimer = null;
  tickInFlight = false;
  eventsHandle = null;
  samplesWritten = 0;
  wroteAnything = false;
  writeFailed = false;
  maxTrackedNoted = false;
  /** Fire-and-forget startup; any failure quietly disables the observer. */
  init() {
    void (async () => {
      try {
        await this.client.ping();
      } catch (e) {
        debugLog("docker daemon not reachable; container metrics off", e);
        this.stopped = true;
        return;
      }
      try {
        const existing = await this.client.listContainers();
        for (const c of existing) {
          await this.track(c.Id, true);
        }
      } catch (e) {
        debugLog("listing pre-existing containers failed", e);
      }
      if (this.stopped)
        return;
      void this.eventsLoop();
      this.tickTimer = setInterval(
        () => void this.tick(),
        this.opts.tickIntervalMs
      );
      this.tickTimer.unref();
      debugLog(`container observer started, artifact ${this.artifactId}`);
    })().catch((e) => debugLog("container observer init failed", e));
  }
  /**
   * Stops observing, writes spans for containers still running, and
   * finalizes the artifact (marker on Nx Cloud agents; deleted when empty).
   * Idempotent; always resolves.
   */
  stop() {
    if (!this.stopPromise) {
      this.stopPromise = this.doStop().catch((e) => {
        debugLog("container observer stop failed", e);
      });
    }
    return this.stopPromise;
  }
  async doStop() {
    this.stopped = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.eventsHandle?.close();
    for (const t of this.tracked.values()) {
      this.writeSpan(t, "observer-shutdown");
    }
    this.tracked.clear();
    await new Promise((resolve) => this.stream.end(() => resolve()));
    try {
      if (!this.wroteAnything) {
        (0, import_fs.unlinkSync)(this.artifactFilePath);
        return;
      }
      if (detectNxCloud(process.env)) {
        (0, import_fs.writeFileSync)(`${this.artifactFilePath}.complete`, "");
      }
    } catch (e) {
      debugLog("finalizing container metrics artifact failed", e);
    }
  }
  async eventsLoop() {
    let failures = 0;
    let delay = this.opts.eventReconnectBaseDelayMs;
    while (!this.stopped) {
      let gotEvent = false;
      const handle = this.client.streamEvents((ev) => {
        gotEvent = true;
        failures = 0;
        delay = this.opts.eventReconnectBaseDelayMs;
        const id = ev.Actor?.ID;
        if (!id)
          return;
        if (ev.Action === "start") {
          void this.track(id, false);
        } else if (ev.Action === "die") {
          this.untrack(id, "died");
        }
      });
      this.eventsHandle = handle;
      await handle.done;
      if (this.stopped)
        return;
      if (!gotEvent) {
        failures++;
        if (failures >= this.opts.eventMaxConsecutiveFailures) {
          debugLog(
            `events stream failed ${failures} times; giving up on event-driven tracking`
          );
          return;
        }
      }
      await sleep(delay);
      delay = Math.min(delay * 2, this.opts.eventReconnectMaxDelayMs);
    }
  }
  /**
   * Inspects a container and adds it to the sampled set. Inspecting at
   * start-event time (not create) absorbs the race between dockerd emitting
   * `create` and the creator's API call returning.
   */
  async track(id, preExisting) {
    if (this.stopped || !id || this.tracked.has(id))
      return;
    if (this.tracked.size >= this.opts.maxTracked) {
      if (!this.maxTrackedNoted) {
        this.maxTrackedNoted = true;
        debugLog(
          `container tracking limit (${this.opts.maxTracked}) reached; further containers are not sampled`
        );
      }
      return;
    }
    let info;
    try {
      info = await this.client.inspectContainer(id);
    } catch {
      return;
    }
    if (this.stopped || this.tracked.has(id))
      return;
    const name = (info.Name ?? "").replace(/^\//, "");
    let attr = attributeContainer(info.Config?.Labels, info.Config?.Env, name);
    if (preExisting && attr.kind === "unattributed") {
      attr = { kind: "pre-existing", detail: "" };
    }
    const startedAtMs = Date.parse(info.State?.StartedAt ?? "") || Date.now();
    this.tracked.set(id, {
      id,
      name,
      image: info.Config?.Image ?? "",
      pid: info.State?.Pid ?? 0,
      startedAtMs,
      startedAtIso: new Date(startedAtMs).toISOString(),
      attr,
      prevTotal: 0,
      prevSystem: 0
    });
  }
  untrack(id, endReason) {
    const t = this.tracked.get(id);
    if (!t)
      return;
    this.tracked.delete(id);
    this.writeSpan(t, endReason);
  }
  async tick() {
    if (this.tickInFlight || this.stopped || this.tracked.size === 0)
      return;
    this.tickInFlight = true;
    try {
      const snapshot = [...this.tracked.values()];
      const samples = [];
      for (let i = 0; i < snapshot.length; i += this.opts.statsConcurrency) {
        const batch = snapshot.slice(i, i + this.opts.statsConcurrency);
        const results = await Promise.all(
          batch.map(async (t) => {
            try {
              return { t, stats: await this.client.statsOneShot(t.id) };
            } catch (e) {
              if (isNotFound(e)) {
                this.untrack(t.id, "died");
              }
              return null;
            }
          })
        );
        for (const r of results) {
          if (r)
            samples.push(r);
        }
        if (this.stopped)
          return;
      }
      this.writeSampleLine(samples);
    } finally {
      this.tickInFlight = false;
    }
  }
  writeSampleLine(samples) {
    const processes = [];
    const groups = {};
    const processMeta = {};
    for (const { t, stats } of samples) {
      const totalUsage = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
      const memoryUsage = stats.memory_stats?.usage ?? 0;
      if (totalUsage === 0 && memoryUsage === 0)
        continue;
      const groupId = `container:${t.id.slice(0, 12)}`;
      processes.push({
        pid: t.pid,
        cpu: cpuPercent(t, stats),
        memory: workingSetBytes(stats)
      });
      groups[groupId] = {
        groupType: "Container",
        id: groupId,
        displayName: `${t.image} (${t.name})`,
        taskIds: t.attr.kind === "task" ? [t.attr.detail] : [],
        attribution: t.attr,
        containerId: t.id,
        startedAt: t.startedAtIso
      };
      processMeta[String(t.pid)] = {
        groupId,
        name: t.name,
        command: t.image,
        exePath: "",
        cwd: "",
        isRoot: true
      };
    }
    if (processes.length === 0)
      return;
    if (this.samplesWritten >= this.opts.maxSamples)
      return;
    this.writeLine({
      timestamp: Date.now(),
      processes,
      metadata: { groups, processes: processMeta }
    });
    this.samplesWritten++;
    if (this.samplesWritten === this.opts.maxSamples) {
      debugLog(
        `sample cap (${this.opts.maxSamples}) reached; further container samples are dropped`
      );
    }
  }
  /**
   * Span lines deliberately do not parse as MetricsUpdate, so readers that
   * predate them skip them.
   */
  writeSpan(t, endReason) {
    const endedAtMs = Date.now();
    this.writeLine({
      type: "containerSpan",
      timestamp: endedAtMs,
      span: {
        containerId: t.id,
        name: t.name,
        image: t.image,
        attribution: t.attr,
        startedAt: t.startedAtIso,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - t.startedAtMs,
        endReason
      }
    });
  }
  writeLine(line) {
    if (this.writeFailed)
      return;
    this.stream.write(`${JSON.stringify(line)}
`);
    this.wroteAnything = true;
  }
};
function cpuPercent(t, stats) {
  const total = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
  const system = stats.cpu_stats?.system_cpu_usage ?? 0;
  const onlineCPUs = stats.cpu_stats?.online_cpus || 1;
  let cpu = 0;
  if (t.prevSystem > 0 && system > t.prevSystem && total >= t.prevTotal) {
    cpu = (total - t.prevTotal) / (system - t.prevSystem) * onlineCPUs * 100;
  }
  t.prevTotal = total;
  t.prevSystem = system;
  return cpu < 0 ? 0 : Math.round(cpu * 100) / 100;
}
function workingSetBytes(stats) {
  const usage = stats.memory_stats?.usage ?? 0;
  const inactiveFile = stats.memory_stats?.stats?.["inactive_file"] ?? stats.memory_stats?.stats?.["total_inactive_file"] ?? 0;
  return inactiveFile < usage ? usage - inactiveFile : usage;
}
function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}
function debugLog(message, error) {
  if (VERBOSE_LOGGING) {
    console.log(`[Nx Cloud Debug]: ${message}`, error ?? "");
  }
}

// entry.ts
var STATE_FILE = "/tmp/container-observer-poc.state.json";
var DAEMON_SCRIPT = "/tmp/container-observer-daemon.cjs";
var DAEMON_LOG = "/tmp/container-observer-poc.log";
if (process.argv[2] === "--daemon") {
  runDaemon();
} else {
  launchDaemon();
}
function launchDaemon() {
  (0, import_fs2.copyFileSync)(__filename, DAEMON_SCRIPT);
  const out = (0, import_fs2.openSync)(DAEMON_LOG, "a");
  const child = (0, import_child_process.spawn)(process.execPath, [DAEMON_SCRIPT, "--daemon"], {
    detached: true,
    stdio: ["ignore", out, out]
  });
  (0, import_fs2.writeFileSync)(STATE_FILE, JSON.stringify({ pid: child.pid }));
  child.unref();
  console.log(
    `[container-observer] daemon started (pid ${child.pid}), log ${DAEMON_LOG}`
  );
  console.log(
    `[container-observer] metrics dir ${process.env.NX_CLOUD_METRICS_DIRECTORY}`
  );
}
function runDaemon() {
  const agent = (process.env.NX_AGENT_NAME || os.hostname()).replace(
    /[^\w.-]/g,
    "_"
  );
  const artifactId = `container-metrics-${agent}-${(0, import_crypto.randomUUID)()}`;
  const observer = startContainerObserver(artifactId);
  if (!observer) {
    console.log(
      "[container-observer] not started (no docker socket, or metrics disabled)"
    );
    return;
  }
  (0, import_fs2.writeFileSync)(
    STATE_FILE,
    JSON.stringify({
      pid: process.pid,
      artifactFilePath: observer.artifactFilePath
    })
  );
  console.log(`[container-observer] observing; artifact ${observer.artifactFilePath}`);
  const keepAlive = setInterval(() => {
  }, 6e4);
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping)
      return;
    stopping = true;
    console.log(`[container-observer] ${signal} received; finalizing artifact`);
    await observer.stop();
    clearInterval(keepAlive);
    console.log("[container-observer] artifact finalized");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
