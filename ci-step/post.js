// Post script of the Container Observer PoC step. Runs after the agent has
// finished all tasks: SIGTERMs the observer (which flushes spans for any
// containers still running), then prints the captured data into this step's
// log so it is visible in the run UI.
//
// Optional: OBSERVER_UPLOAD=true additionally copies metrics.ndjson into
// NX_CLOUD_METRICS_DIRECTORY with a .complete marker so the existing metrics
// uploader ships it to workspace file storage. No registration row exists for
// it yet, so nothing appears in the UI — verify in the storage bucket.
const fs = require('fs');
const path = require('path');

const dir = process.env.OBS_OUT_DIR || '/tmp/nx-container-observer';

function readOr(file, fallback) {
  try {
    return fs.readFileSync(path.join(dir, file), 'utf8');
  } catch {
    return fallback;
  }
}

const pid = Number(readOr('observer.pid', '0'));
if (pid) {
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[observer-step] sent SIGTERM to observer pid=${pid}`);
  } catch {
    console.log(`[observer-step] observer pid=${pid} already gone`);
  }
}

// give the observer a beat to flush open spans and close its files
setTimeout(() => {
  console.log('--- spans.ndjson (one line per container lifetime) ---');
  console.log(readOr('spans.ndjson', '(missing)').trim() || '(no containers observed)');

  const metrics = readOr('metrics.ndjson', '').trim();
  const lines = metrics ? metrics.split('\n') : [];
  console.log(`--- metrics.ndjson: ${lines.length} samples, last 5 ---`);
  console.log(lines.slice(-5).join('\n') || '(no samples)');

  console.log('--- observer.log (tail) ---');
  console.log(readOr('observer.log', '(missing)').split('\n').slice(-40).join('\n'));

  const metricsDir = process.env.NX_CLOUD_METRICS_DIRECTORY;
  if (process.env.OBSERVER_UPLOAD === 'true' && metricsDir && metrics) {
    const artifact = path.join(metricsDir, `container-metrics-poc-${Date.now()}`);
    fs.copyFileSync(path.join(dir, 'metrics.ndjson'), artifact);
    fs.writeFileSync(`${artifact}.complete`, '');
    console.log(`[observer-step] staged ${artifact} for the metrics uploader`);
  }
}, 2500);
