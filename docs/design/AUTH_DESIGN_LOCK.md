# Approved VIBE authentication design

The approved design from 9 October 2026 is the shared warm gradient, ivory brand panel with the VIBE logo and “Hơn 10 năm sự nghiệp giáo dục âm nhạc”, and white form with navy typography and restrained gold accents. Reuse AuthShell for login, forgot password and password updates.

`approved-auth-design.json` records SHA-256 hashes of the approved UI and logo. `scripts/auth-design-lock.cjs` runs before every npm build and in CI. Missing files or changed UI stop the build. Authentication server actions are excluded so permissions and login behavior can evolve independently.

Production Vercel additionally pins the approved manifest and runs the verifier in its project build command, so an older checkout without this protection cannot silently replace production. Keep the same command in vercel.json for this release. Do not deploy historical checkouts or use prebuilt output to bypass these checks.

To change the approved design, obtain explicit user approval, render and verify desktop and mobile, update the manifest, and update the pinned manifest hash in Vercel. Do not automatically regenerate the baseline during builds.

This prevents regression through the configured build path. A Vercel administrator can still override project settings, promote an old deployment or deploy prebuilt output; those release actions must verify this design first.
