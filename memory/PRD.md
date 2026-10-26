# FlipCraft — PRD

## Original problem statement
"Heyzine flipbook which can convert pdf to flipbooks etc. and embed videos. i want to create a free version of the same for my use"

## User choices
- No login for anyone, easy to use, but safe
- Videos: uploaded files + YouTube/Vimeo links; pictures on pages too
- Viewer: share link + embed code, page-flip sound, clickable web links, fullscreen & zoom
- Branding (logo, name, colour, website) saved permanently and shown on all flipbooks

## Architecture
- FastAPI + MongoDB; PyMuPDF renders PDF pages to JPEG (full + thumb) in a background job; Emergent Object Storage for pages/media; /api/files serves files with Range support (video streaming), nosniff
- No-login security: each browser auto-generates a private 48-hex "studio key" (localStorage) sent as X-Owner-Key; only its SHA-256 hash is stored. Viewing is public by flipbook id; editing/deleting/branding require the key. Key can be copied/restored in Branding dialog.
- React: Dashboard (upload, cards, branding), Editor (drag/resize overlays: video, YouTube/Vimeo, picture, link; filmstrip; save), Viewer (/view/:id, StPageFlip 3D flip, Web Audio flip sound, zoom, fullscreen, thumbnails, share), Embed (/embed/:id)

## Implemented (Oct 2026)
- PDF -> flipbook conversion with progress; list/delete
- Overlays with backend validation (link schemes, YouTube/Vimeo hosts, media prefix, file byte sniffing)
- Branding per studio key, shown in viewer header/embed
- Share link + iframe embed code with width/height
- Tested: iteration 1 & 2 (100% after fixes)
- Realistic reading (iteration 3): hover corner curl, drag/click page turning, intro corner peel, spine/paper shading, page-stack edges, flip sound at turn start
- Mobile editor: compact tool row + bottom properties panel; "Edit & add media" button and on-page hint
- Iteration 4: larger mouse-following corner curl, per-video autoplay (muted) when its page opens, hardcover look toggle (linen, spine, rounded corners), reader analytics (opens, unique readers, link vs embed, 30-day chart, most read pages; owner visits excluded)

## Backlog
- P1: Viewer polling while a book is still converting; mobile tool rail in editor
- P1: Reader analytics (views per flipbook)
- P2: Table of contents, search inside flipbook, password-protected flipbooks, custom background per book
- P2: Overlay media ownership check
