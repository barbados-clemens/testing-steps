// Main script of the Container Observer PoC step. Starts the observer binary
// in the background and returns immediately; the process survives step
// completion (the executor waits on the step process only and tolerates
// orphans holding the stdio pipes). post.js kills it after the agent is done.
//
// Configure via step env:
//   OBSERVER_BIN_PATH  path to a committed binary in the workspace (checkout
//                      must run before this step), OR
//   OBSERVER_BIN_URL   URL to download the binary from (e.g. a GitHub release
//                      asset; must match the resource-class arch)
//   OBS_OUT_DIR        output dir (default /tmp/nx-container-observer)
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = process.env.OBS_OUT_DIR || '/tmp/nx-container-observer';
fs.mkdirSync(dir, { recursive: true });

let bin = process.env.OBSERVER_BIN_PATH;
if (bin) {
  bin = path.resolve(bin);
} else if (process.env.OBSERVER_BIN_URL) {
  bin = path.join(dir, 'observer');
  execFileSync('curl', ['-fsSL', process.env.OBSERVER_BIN_URL, '-o', bin], {
    stdio: 'inherit',
  });
} else {
  console.error(
    'Set OBSERVER_BIN_PATH (binary committed in the workspace) or OBSERVER_BIN_URL (download).',
  );
  process.exit(1);
}
fs.chmodSync(bin, 0o755);

const log = fs.openSync(path.join(dir, 'observer.log'), 'a');
const child = spawn(bin, [], {
  detached: true,
  stdio: ['ignore', log, log],
  env: { ...process.env, OBS_OUT_DIR: dir },
});
fs.writeFileSync(path.join(dir, 'observer.pid'), String(child.pid));
child.unref();
console.log(`[observer-step] observer running, pid=${child.pid}, output in ${dir}`);
