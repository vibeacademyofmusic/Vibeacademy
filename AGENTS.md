<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vibe-design-consistency -->

# VIBE design consistency

All future UI work must follow the approved VIBE design language. Use the approved Công tác phí implementation as the current reference and reuse shared design tokens and components.

Apply this to new features, fixes, redesigns, parent and child pages, navigation, tabs, forms, dialogs, cards, tables, filters, buttons, badges, and loading, empty, error, and success states.

Maintain consistent typography, colors, spacing, borders, radii, sizing, and interaction patterns. Use the established warm background, navy typography, restrained gold accents, and white cards through existing tokens.

Extend shared components where needed instead of creating divergent local copies. Use clear Vietnamese wording and accessible desktop and mobile layouts.

Bring affected UI into alignment without unrelated redesigns. Preserve business behavior and permissions.

A UI task is not complete if it works functionally but deviates from the approved design. Compilation and automated tests alone do not establish visual acceptance. Every UI implementation report must include rendered design-consistency verification.

<!-- END:vibe-design-consistency -->
