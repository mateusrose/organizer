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

`gh` is not installed here. The repo is public, so the API answers unauthenticated:

```bash
curl -s "https://api.github.com/repos/mateusrose/organizer/actions/runs?per_page=1" \
  | grep -E '"(head_sha|status|conclusion|html_url)"' | head -4
```

Confirm `head_sha` matches the commit just pushed. A run goes
`queued` → `in_progress` → `completed`; only `"conclusion": "success"` counts as
published. Wait and re-check while it is still running, and report the conclusion,
including the run URL if it failed.

## Architecture

- `src/types/index.ts` — the whole domain model plus `DB_VERSION`. Everything else
  reads its shapes from here.
- `src/lib/db.ts` — `migrate()` brings any older or partial payload up to the
  current shape, whether it came from `localStorage` or the sync remote. **Any
  breaking change to a persisted type needs a `DB_VERSION` bump and a migration
  step here**, because old copies keep arriving from other devices.
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
