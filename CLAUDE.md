# sequences - AI sequence-diagram generator (port 3002, sequences.localhost)

## Run
- Dev: `npm run dev` (next dev --port 3002)
- Build: `npm run build` / Prod: `npm run prod` (next start -p 3002)
- Lint: `npm run lint`

## Architecture rules
- PAL palette: ef4444, f97316, eab308, 22c55e, 14b8a6, 06b6d4, 3b82f6, 8b5cf6, ec4899, f43f5e, 84cc16, 0891b2
- Themes: light bg #ffffff, dark bg #16161e, monokai bg #272822
- sequenceDiagram uses a custom SVG renderer. All other diagram types use mermaid.js dynamic import + applyColorfulMermaidStyle.
- DB table is `sequences` (column `sequence_type`). A back-compat VIEW `diagrams` still points at it for the automations app.
- `/api/sequences` and `/api/ai/sequences` are canonical; `/api/diagrams*` are thin alias re-exports. `/s/[id]` is canonical; `/d/[id]` 308-redirects.
- detectSequenceType reads the first line keyword to pick the renderer.
- Every programmatic create is logged to `sequence_api_requests` (route, status, sequence_id, key name that matched, IP, geo, user-agent, referer). Owner UI saves are not logged. Table is additive and has no FK, so deleting a sequence keeps its provenance.

## Infra
- Deploy: Vercel (auto-deploys on push; `vercel --prod` for a manual prod deploy)
- Live URL: https://sequences-bheng.vercel.app
- Stack: Bun (`bun run build`, `bun dev`) alongside the npm scripts.

## Test
- `npm run test` (vitest run)
- `npm run test:e2e` (Playwright)
- `npm run test:all` (coverage + e2e)
