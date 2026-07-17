// Bundles the production container observer from an nrwl/ocean checkout into
// the single-file step script ci-step/main.js.
//
//   node build.mjs /path/to/ocean [outfile]
//
// Ocean-internal utility imports are replaced with the shims in ./shims so
// the bundle stays self-contained (no nx-imports workspace check, no wider
// client-bundle graph).
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const oceanDir = process.argv[2];
if (!oceanDir) {
  console.error('usage: node build.mjs /path/to/ocean [outfile]');
  process.exit(1);
}
// esbuild comes from the ocean checkout's node_modules
const esbuild = createRequire(join(resolve(oceanDir), 'package.json'))(
  'esbuild',
);
const observerDir = resolve(
  oceanDir,
  'libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer',
);
const outfile = process.argv[3] ?? join(here, 'main.js');

let oceanCommit = 'unknown';
try {
  oceanCommit = execSync('git rev-parse --short HEAD', { cwd: oceanDir })
    .toString()
    .trim();
} catch {}

const shimPlugin = {
  name: 'ocean-shims',
  setup(build) {
    build.onResolve({ filter: /^ocean-container-observer$/ }, () => ({
      path: join(observerDir, 'container-observer.ts'),
    }));
    build.onResolve(
      { filter: /utilities\/(environment|get-vcs-context|nx-imports)$/ },
      (args) => ({
        path: join(here, 'shims', `${args.path.split('/').pop()}.ts`),
      }),
    );
  },
};

await esbuild.build({
  entryPoints: [join(here, 'entry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  plugins: [shimPlugin],
  banner: {
    js: [
      '// GENERATED FILE — do not edit by hand.',
      '// Built by build/build.mjs from nrwl/ocean',
      '//   libs/nx-packages/client-bundle/src/lib/core/metrics/container-observer/',
      `//   ocean commit: ${oceanCommit}`,
    ].join('\n'),
  },
});
console.log(`wrote ${outfile} (ocean ${oceanCommit})`);
