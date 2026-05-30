# AGENTS.md

DeepSeek API usage monitor — Windows desktop tray app built with Electron + TypeScript.

## Commands

```
npm run build      # tsc then copy-renderer.cjs (both steps required)
npm test           # vitest run (single pass)
npm run test:watch # vitest watch mode
npm run smoke      # build + electron --smoke-test (headless CI, exits cleanly)
npm run start      # build + electron . (launches app)
```

No lint, typecheck, or formatter commands exist — `tsc` is the only static check.

## Build quirk

Build is **two-phase**: `tsc` compiles TS → JS into `dist/`, then `scripts/copy-renderer.cjs` copies `src/renderer/` (HTML/CSS/JS, not TypeScript) verbatim into `dist/src/renderer/`. Missing either step = broken app. Renderer files are plain JS — they are not compiled by tsc.

## Module system

CommonJS (`"type": "commonjs"` in package.json). No ESM imports in source. `rootDir` is `"."` so test imports use `"../src/…"` prefix.

## Conventions

- Explicit vitest imports: `import { describe, expect, it } from "vitest"` (despite `globals: true`)
- Node builtins as `"node:*"`: `import { readFile } from "node:fs/promises"`
- Type-only imports: `import type { Foo } from "./bar"`
- Named exports only — no default exports
- `camelCase` vars/functions, `PascalCase` interfaces/types, lowercase-dash filenames
- No comments unless necessary

## Architecture

- `src/main/main.ts` — Electron entrypoint (`dist/src/main/main.js` after build)
- `src/main/core/` — config store, usage store, pricing, monitor stats, startup, window lock
- `src/main/proxy/proxy-server.ts` — HTTP proxy that intercepts DeepSeek API calls
- `src/main/preload.ts` — context bridge exposing IPC to renderer
- `src/renderer/` — plain HTML/JS/CSS (index.html + monitor.html + their scripts/styles)
- `tests/` — one test file per module

## Smoke test mode

`process.argv.includes("--smoke-test")` guards startup. In smoke mode: proxy port set to 0, notifications disabled, auto-start proxy enabled, then app exits after proxy cycle. Use `npm run smoke` for headless verification.

## No external runtime dependencies

Only devDependencies: `electron`, `typescript`, `vitest`, `@types/node`.
