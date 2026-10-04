# Building from source (for addons.mozilla.org review)

Requirements: Node.js 20 or newer, npm.

```bash
npm ci
npm run build
```

The extension is written to `dist/`. It must match the submitted package. esbuild bundles
`src/content/index.tsx`, `src/bridge/main.ts` and `src/background.ts` (with Preact) and copies
`static/` (manifest, CSS, Montserrat fonts from @fontsource, icon). See `build.mjs`.

`npm test` runs the parser tests against recorded YouTube responses in `test/fixtures`.
