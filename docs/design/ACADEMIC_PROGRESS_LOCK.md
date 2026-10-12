# Academic progress contract

The current active level exposes its subject/component/lesson editors and opens the subject panel by default. Controls must remain reachable without clipping and wrap on narrow layouts. DIRECT_ASSESSMENT components keep their editor even when their parent uses manual assessment; ALL_REQUIRED_ITEMS components expose editors on each lesson.

Server actions require the existing operational-administrator permission and a valid session, use the user's scoped database client, and confirm that an update returned a row. Zero-row RLS-filtered updates must not appear successful.

Keep future levels locked until their scheduled start, completed levels read-only, and inconsistent multiple/current levels blocked. Required lessons/components/subjects still determine grade completion through the database. Never change dates or mark real students passed merely to test a control.

Protected AcademicPrograms, progress helper, actions and regression tests are pinned in the production approved manifest. npm prebuild runs test:academic-progress and the Vercel project pins that manifest hash. An intentional change requires verification and updating both baseline and project pin. This does not prevent a Vercel administrator deliberately overriding settings or promoting an old/prebuilt deployment.
