// Custom workflow step wrapper around the production container observer
// (nrwl/ocean libs/nx-packages/client-bundle .../container-observer).
//
// One file, two roles, dispatched on argv:
//  - step main (no args): re-spawn this same script detached with --daemon,
//    record its pid, exit so the step completes.
//  - --daemon: run the observer for the whole workflow until the post script
//    sends SIGTERM, then stop() finalizes the artifact + .complete marker for
//    the workflow metrics uploader.
import './env-defaults';
import { spawn } from 'child_process';
import { copyFileSync, openSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { startContainerObserver } from 'ocean-container-observer';

const STATE_FILE = '/tmp/container-observer-poc.state.json';
const DAEMON_SCRIPT = '/tmp/container-observer-daemon.cjs';
const DAEMON_LOG = '/tmp/container-observer-poc.log';

if (process.argv[2] === '--daemon') {
  runDaemon();
} else {
  launchDaemon();
}

function launchDaemon(): void {
  // The executor writes step scripts to throwaway temp files; copy to a
  // stable path so the detached daemon outlives this step.
  copyFileSync(__filename, DAEMON_SCRIPT);
  const out = openSync(DAEMON_LOG, 'a');
  const child = spawn(process.execPath, [DAEMON_SCRIPT, '--daemon'], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  writeFileSync(STATE_FILE, JSON.stringify({ pid: child.pid }));
  child.unref();
  console.log(
    `[container-observer] daemon started (pid ${child.pid}), log ${DAEMON_LOG}`,
  );
  console.log(
    `[container-observer] metrics dir ${process.env.NX_CLOUD_METRICS_DIRECTORY}`,
  );
}

function runDaemon(): void {
  const agent = (process.env.NX_AGENT_NAME || os.hostname()).replace(
    /[^\w.-]/g,
    '_',
  );
  const artifactId = `container-metrics-${agent}-${randomUUID()}`;
  const observer = startContainerObserver(artifactId);
  if (!observer) {
    console.log(
      '[container-observer] not started (no docker socket, or metrics disabled)',
    );
    return;
  }
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      pid: process.pid,
      artifactFilePath: observer.artifactFilePath,
    }),
  );
  console.log(`[container-observer] observing; artifact ${observer.artifactFilePath}`);

  // Observer timers are unref'd by design; keep the daemon alive explicitly.
  const keepAlive = setInterval(() => {}, 60_000);
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[container-observer] ${signal} received; finalizing artifact`);
    await observer.stop();
    clearInterval(keepAlive);
    console.log('[container-observer] artifact finalized');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
