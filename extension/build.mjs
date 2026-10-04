import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const watch = process.argv.includes('--watch');
// --dev: the UI as a plain page with a mocked YouTube (dev/), for working on the design.
const dev = process.argv.includes('--dev');
const out = dev ? 'devdist' : 'dist';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('static/fonts', `${out}/fonts`, { recursive: true });
cpSync('static/page.css', `${out}/page.css`);
if (dev) {
  cpSync('dev/index.html', `${out}/index.html`);
  cpSync('test/fixtures', `${out}/fixtures`, { recursive: true });
} else {
  cpSync('static', out, { recursive: true });
}

const mockBridge = {
  name: 'mock-bridge',
  setup(b) {
    b.onResolve({ filter: /(^|\/)bridge$/ }, (args) =>
      args.resolveDir.includes('/src/') ? { path: resolve('dev/mock-bridge.ts') } : undefined,
    );
  },
};

const options = {
  entryPoints: dev
    ? { content: 'dev/main.ts' }
    : { content: 'src/content/index.tsx', bridge: 'src/bridge/main.ts', background: 'src/background.ts' },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'firefox128',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  // Not minified: readable for Mozilla's review and for debugging; the size hardly matters.
  minify: false,
  sourcemap: watch || dev ? 'inline' : false,
  plugins: dev ? [mockBridge] : [],
  logLevel: 'info',
};

if (watch) await (await context(options)).watch();
else await build(options);
