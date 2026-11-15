<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Icon source and licensing

- Flaticon / UIcons are banned across all projects because of licensing. Do not
  add their packages, fonts, glyphs, assets, CDN links, or icon classes.
- Reuse existing icons and the existing Lucide component for the same action.
  A layout or consistency request does not authorize replacing the icon family.
- Interface and topic icons use Lucide's 24px canvas, 2-unit rounded outline.
  Topic mappings live in `components/card-icon.tsx`; shared stroke styling lives
  in `app/globals.css`. Preserve game artwork and official brand/platform logos.
- Canonical rule: `../paladinscat-wiki/documents/06-reference/design/frontend-design-system.md`,
  "Typography and iconography". Feature cards use `docs/card-icon-design.md`.
