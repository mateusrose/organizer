# Semestre

A single-page study planner for one university student: courses, syllabus themes,
assessments, classes, tasks and auto-generated study blocks, scoped by semester.
React 19 + TypeScript + Vite + Tailwind, no backend — the whole database lives in
`localStorage` and syncs through a private GitHub repo.

## Commands

```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

`npm run build` is the real check — `tsc -b` fails the build on any type error.

## After pushing to main

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. **Always check that the run succeeded before calling a
push done** — a green push with a red deploy means the live site is still stale.

`gh` is not installed here. The repo is public, so the API answers unauthenticated.
Match on the pushed commit rather than reading the newest run — for the first few
seconds after a push the newest run is still the *previous* one, which already says
`completed`:

```bash
TARGET=$(git rev-parse HEAD)
curl -s "https://api.github.com/repos/mateusrose/organizer/actions/runs?per_page=5" \
  | python3 -c "
import json,sys
runs = json.load(sys.stdin)['workflow_runs']
hit = next((r for r in runs if r['head_sha'] == '$TARGET'), None)
print(hit and (hit['status'], hit['conclusion'], hit['html_url']) or 'no run yet')
"
```

A run goes `queued` → `in_progress` → `completed`, and takes roughly a minute; only
`conclusion == 'success'` counts as published. Poll every ~20s while it is running,
and report the conclusion, with the run URL if it failed.

## Architecture

- `src/types/index.ts` — the whole domain model plus `DB_VERSION`. Everything else
  reads its shapes from here.
- `src/lib/db.ts` — `migrate()` brings any partial payload up to the current
  shape, whether it came from `localStorage` or the sync remote. A breaking change
  to a persisted type still bumps `DB_VERSION`, but **the app is not in use by
  anyone else yet, so old formats are dropped rather than converted** — replace the
  shape and let stale fields fall away. `migrate()` still has to leave every
  collection present and every field a sane default, since that is what stops a
  partial or older payload from crashing the app.
- `src/store/useStore.ts` — the single Zustand store. Mutations go through
  `commit()`, which bumps `revision` and persists.
- `src/store/useSync.ts` + `src/lib/github/` — sync through a private GitHub repo.
  `revision` is a per-device edit counter, not a clock, so when both sides hold
  real data the app raises a `SyncConflict` and asks rather than picking a winner.
- `src/lib/scheduler.ts` — generates study blocks from availability windows and
  assessment estimates. Generated blocks carry `auto: true` and are safe to discard.
- `src/pages/` — one file per route; `src/components/ui/` is the shared kit
  (`Button`, `Field`, `Input`, `Select`, `Modal`, …). Reuse it rather than hand-rolling
  controls or raw Tailwind form markup.

## Conventions

- Dates are ISO strings. Whole-day values (`startsOn`, `endsOn`) are local midnight;
  timed values (`dueAt`, `startsAt`) are real instants. Helpers live in `src/lib/date.ts`.
- Colors come from `data-course={course.color}` plus the CSS variables in
  `index.css` — never hard-code a course color in a component.
- Comments explain *why*, not what. Match the existing density; do not narrate code.
