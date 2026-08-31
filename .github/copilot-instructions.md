# Copilot Instructions

## Project and commands

- This is a Next.js 16 App Router application using React 19, TypeScript (strict mode), Tailwind CSS 4, and `@xyflow/react`. The package lockfile makes npm the project package manager.
- Run `npm run dev` to serve the app locally at `http://localhost:3000`.
- Run `npm run lint` for ESLint, which uses the Next.js Core Web Vitals and TypeScript configurations.
- Run `npm run build` for the production build. The GitHub Pages workflow runs this command on pushes to `main` under Node 20 and deploys the generated `out` artifact.
- Run `npm test` for the unit suite or `npx vitest run lib/json-tree.test.ts` for its single model test file.
- Run `npm run test:e2e` for the Chromium browser suite or `npx playwright test e2e/graph.spec.ts` for its single graph-rendering regression test.

## Architecture

- `app/layout.tsx` provides the root document, Geist font variables, global stylesheet, and site metadata. `app/page.tsx` is the only application route and is a `"use client"` component because it relies on React state, React Flow, the Clipboard API, and text selection.
- The page is a JSON editor and graph viewer. `lib/json-tree.ts` parses textarea content into a `TreeNode` hierarchy while retaining each value's character range in the original text. `app/json-graph.tsx` turns its visible hierarchy into `@xyflow/react` nodes and edges with worker-backed ELK layered layout; `JsonNode` renders the custom graph node UI.
- Keep the text/tree/graph synchronization intact:
  - Text edits parse into a normalized tree and clear saved node positions.
  - Graph add/delete edits immutably update the tree, normalize array keys, serialize it with `JSON.stringify(..., null, 2)`, reparse it to calculate current source spans, and then copy those spans onto the edited tree.
  - Drag positions remain separate in `positions` and are pruned after structural changes, so layout updates do not discard valid user placements.
- Node hover/click uses `sourceStart` and `sourceEnd` to select the matching textarea range. A graph node click also copies its `tooltip` value. Deletion is intentionally two-step: first click marks `pendingDeleteId`; the second click removes the subtree.

## Repository conventions

- JSON node IDs use the `node_<counter>` format. Preserve stable existing IDs during graph edits; the source-span copy relies on depth-first child ordering to match reparsed nodes with their edited counterparts.
- Array child keys are display indices and must be renumbered through `normalizeTree` after mutations. Object children receive collision-free `new_key`, `new_key_2`, etc. keys when added.
- Keep React Flow types and components imported from `@xyflow/react`; `reactflow` is also installed but is not the API used by the page.
- Memoize the `nodeTypes` map and retain callback-based custom-node actions so React Flow receives stable node-type definitions.
- Keep graph rendering within `MAX_RENDERED_NODES` and raw JSON within `MAX_JSON_BYTES`; collapsed subtrees are the primary safeguard for interactive performance.
- Use the `@/*` TypeScript path alias for root-relative imports when adding cross-file imports.
- Follow `AGENTS.md`: this repository uses a version of Next.js with breaking changes. Before changing Next.js-specific code, read the relevant guide in `node_modules/next/dist/docs/` and heed its deprecation notices.
