# kingsidharth.com

Is my personal website. Serving as sort of a hub for my content, resources, tools, etc.
Also a design / taste tatement / digital art-piece sort of thing.


# Stack
- typescript. Write typescript like typecript. No as Any
- astro, SSR
- bun for package management, runtime on local - prod if we end there
- tailwind, shadcn
- 3d: three.js via @react-three/fiber + @react-three/drei. Always lazy-load
  the canvas (React.lazy or equivalent) behind a loading state so the three.js
  chunk never lands in the initial bundle of a page that only shows prose.
- make it easy to publish new posts/and -or custom sub-sections/richer experiences
- We want to optimise the website for:
  - Mobile-first, interaction pattern, tap-targets, usability/improvement considerations
  - Fast-content loading speed's. Aim for 95+ score for PageSpeed under constraints
  - Usable & Beautiful / cool for humans, super easy/useful for AI Agents, LLM's

# Gotchas
- NEVER run `astro build` (or `bun run build`) while the dev server is
  running: they share `node_modules/.vite`, and the build clobbers the
  dev server's optimized-dep chunks — every lazy 3D island (three.js)
  then dies with 504s on `/node_modules/.vite/deps/*` and a blank
  canvas. Restart the dev server to recover (delete
  `node_modules/.vite` first if it persists). Build into a worktree,
  or stop dev first.
- "The 3D canvas is black" is almost never the scene code — read the
  checklist in `src/components/instruments/TransformerEngine.tsx`'s
  header before touching anything.
- Instrument chrome (chassis/screen/screws) is themed by DEVICE, not by
  page: `data-instrument` on `<html>` picks `contrast` (default, device
  opposes the page) or `matched`. Never branch hardware styling on
  `.dark` alone — use the selector pairs documented in the "INSTRUMENT
  HARDWARE" block of `src/styles/global.css`. Text on a chassis is safe
  because `.chassis` re-scopes `--foreground`/`--muted-foreground`/
  `--primary` to the panel.
