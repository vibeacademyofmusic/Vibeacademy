# Local UTF-8 repair — 2026-10-06

Scope: existing app on localhost:3000, served from /Users/macbookair/vibe-academy-system (PID 84332 at inspection). No database changes, deployments or outbound messages.

Cause: app/admin/tuition/reminders/notice.ts contained invalid byte 0x9D at offset 8213 in the phone mask and damaged Vietnamese fallback labels. Turbopack could not parse this imported module.

Repair: restored only two display lines from their verified Git text: “Phụ huynh”, bullet phone masking, and “Chưa có số điện thoại”. Preserved all other pre-existing uncommitted work and did not stage or commit those changes. The original bytes were backed up privately before editing.

Verification:
- Strict UTF-8 validation across 621 source files: no invalid files remain.
- Focused ESLint and git diff --check passed.
- Existing tuition notice/template registry tests: 9 passed, 0 failed; no provider calls.
- Existing authenticated Chrome session reloaded /admin/finance successfully without the Build Error overlay.
- /admin/tuition/reminders loaded; its “Gửi thông báo học phí” dialog opened and displayed the phone masked with bullets. No send confirmation was clicked.
- Returned Chrome to /admin/finance and verified its heading after final navigation.
- Rendered visual check: existing VIBE white cards, navy typography and restrained gold navigation remain intact. See finance-fixed.png. No layout or permissions changes.

The reported parsing error is resolved. The test scope does not certify unrelated pending features or old synchronization notices on the reminders page.
