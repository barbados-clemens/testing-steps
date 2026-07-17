// Post script for the container-observer step: stops the daemon, waits for
// the artifact + .complete marker, and prints a summary so the step log shows
// what the workflow metrics uploader will pick up. Never fails the step.
const { existsSync, readFileSync } = require('fs');

const STATE_FILE = '/tmp/container-observer-poc.state.json';
const DAEMON_LOG = '/tmp/container-observer-poc.log';
const STOP_TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  if (!existsSync(STATE_FILE)) {
    console.log('[container-observer] no state file; daemon never started');
    return;
  }
  const { pid, artifactFilePath } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  if (!artifactFilePath) {
    console.log(
      '[container-observer] daemon exited before observing (no docker socket?)',
    );
    printDaemonLog();
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[container-observer] sent SIGTERM to daemon (pid ${pid})`);
  } catch {
    console.log(`[container-observer] daemon (pid ${pid}) already exited`);
  }

  const marker = `${artifactFilePath}.complete`;
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline && !existsSync(marker) && isAlive(pid)) {
    await sleep(500);
  }

  if (existsSync(marker)) {
    console.log(`[container-observer] marker written: ${marker}`);
  } else if (!existsSync(artifactFilePath)) {
    console.log(
      '[container-observer] no artifact: nothing was observed (empty artifacts are deleted)',
    );
    printDaemonLog();
    return;
  } else {
    console.log(
      `[container-observer] WARNING: no .complete marker after ${STOP_TIMEOUT_MS}ms; ` +
        'the uploader final sweep should still pick the artifact up',
    );
  }

  summarize(artifactFilePath);
  printDaemonLog();
}

function summarize(artifactFilePath) {
  try {
    const lines = readFileSync(artifactFilePath, 'utf8')
      .split('\n')
      .filter(Boolean);
    const samples = [];
    const spans = [];
    for (const raw of lines) {
      try {
        const line = JSON.parse(raw);
        (line.type === 'containerSpan' ? spans : samples).push(line);
      } catch {}
    }
    const containers = new Map();
    for (const s of samples) {
      for (const g of Object.values(s.metadata?.groups ?? {})) {
        containers.set(g.id, g);
      }
    }
    console.log(`\n[container-observer] artifact: ${artifactFilePath}`);
    console.log(
      `[container-observer] ${samples.length} sample lines, ${spans.length} span lines, ${containers.size} containers`,
    );
    for (const g of containers.values()) {
      const attr = g.attribution
        ? `${g.attribution.kind}${g.attribution.detail ? `:${g.attribution.detail}` : ''}${g.attribution.via ? ` (via ${g.attribution.via})` : ''}`
        : 'n/a';
      console.log(`  - ${g.displayName} -> ${attr}`);
    }
    for (const s of spans) {
      console.log(
        `  span: ${s.span.image} (${s.span.name}) ${s.span.durationMs}ms end=${s.span.endReason}`,
      );
    }
    console.log(
      `\n[container-observer] retrieve as workflow metrics upload artifactId: ${artifactFilePath.split('/').pop()}`,
    );
  } catch (e) {
    console.log(`[container-observer] could not summarize artifact: ${e}`);
  }
}

function printDaemonLog() {
  try {
    const log = readFileSync(DAEMON_LOG, 'utf8').split('\n');
    console.log('\n[container-observer] daemon log (tail):');
    console.log(log.slice(-40).join('\n'));
  } catch {}
}

main().catch((e) => {
  // observation-only step: never fail the workflow
  console.log(`[container-observer] post script error: ${e}`);
});
