# Semestre

A personal study planner for an asynchronous semester: everything you have to hand in,
how much it is worth, and when you are actually going to sit down and do it.

It is a static single-page app. There is no backend and no account — the data lives in
your browser, and in a private GitHub repository you own.

## What it does

- **Courses** — name, code, ECTS, instructor, target grade, and a colour used everywhere else in the app.
- **Grade projection** — weighted maths over every assessment: current average, projected final grade,
  best/worst case, and the average you still need on the remaining weight to hit your target.
- **Assessments** — assignments, exams, quizzes, projects, presentations, labs and readings, with due
  date, weight, estimated hours and status.
- **Study planner** — fills your free windows with study blocks, working backwards from due dates and
  respecting your max hours per day, session length and buffer days. Tells you when a deadline does not fit.
- **Calendar** — week and month views of classes, deadlines and study blocks in one place.
- **Tasks** — quick to-dos, optionally attached to a course or an assessment.
- **Google sign-in** — optional, and only for the two features below.
- **Sync** — every change is saved to a private GitHub repo a few seconds later, so laptop and phone stay in step.
- **Calendar sync** — pushes assessment deadlines into a Google Calendar you pick in Settings.
- **Dark mode** — dark by default, light theme in Settings.

## Run it locally

You need Node 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. On GitHub, go to **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**. (Do not pick "Deploy from a branch".)
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the app and publishes it to
   `https://<username>.github.io/<repo>/`.

You can also re-run the deploy by hand from the **Actions** tab (the workflow has a
"Run workflow" button).

The app uses hash routing, so every page is a URL like
`https://<username>.github.io/<repo>/#/planner`. GitHub Pages never sees the part after `#`, which
means deep links and page refreshes work without a `404.html` fallback. The Vite build also uses
`base: './'`, so the same build works at a repo subpath, at a user site root, or on a custom domain
with no changes.

## Google setup

Only needed for Calendar sync. Data sync uses GitHub instead, and everything else works signed out.

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project
   (call it `semestre`, the name does not matter).
2. In **APIs & Services → Library**, enable the **Google Calendar API**.
3. In **APIs & Services → OAuth consent screen**, choose **External**, fill in the app name and your
   email, and under **Test users** add your own Google account. Leave the app in **Testing** mode.
4. In **APIs & Services → Credentials**, click **Create credentials → OAuth client ID** and choose
   **Web application**.
5. Under **Authorised JavaScript origins**, add both:
   - `http://localhost:5173`
   - `https://<username>.github.io`
   (Origins are scheme + host only — no path, no trailing slash, so no `/<repo>/` here.)
6. Copy the client ID (it looks like `1234567890-abcdef.apps.googleusercontent.com`) and paste it into
   **Settings → Google** in the app.

Notes:

- **There is no client secret and no backend.** This is a browser-only OAuth flow, so the client ID is
  the only thing the app needs, and it is not sensitive — it ships inside the published JavaScript by
  design. Never paste a client *secret* anywhere in this app.
- The first time you sign in, Google shows an **"unverified app"** warning. That is expected for a
  personal project that will never be published for other users: click **Advanced → Continue to
  semestre (unsafe)**.
- While the consent screen stays in **Testing** mode, Google expires the authorisation after **7 days**.
  When that happens the app just asks you to sign in again — nothing is lost, your data is local either way.

## Where the data lives

- **Your browser.** Everything is stored in `localStorage` under the key `semestre.db.v1`, saved on
  every change.
- **A private GitHub repo (optional).** With sync on, `semestre.json` is written to a private
  repository you create. Every save is a commit, so the repo doubles as a full version history and
  you can roll back from github.com. A private repo answers 404 to anyone without your token.

  The token is pasted into Settings and stored in that browser only. It is never committed and
  never travels inside the synced file — a new device would otherwise need the token to fetch the
  token. Scope it to that one repository with Contents: read and write, and nothing else.
- **Files.** Settings has **Export** (downloads a JSON snapshot) and **Import** (restores one). Worth
  doing before you try anything drastic.

**Warning:** clearing site data, "clear cookies and site data" for this domain, or using a private
window will wipe the local copy. With sync off and no export, the data is gone.
Local storage is also per-browser and per-origin — `localhost` and the GitHub Pages site are two
separate stores.

## Project layout

```
src/
  components/
    layout/     app shell, top bar, navigation
    ui/         the design system: Button, Card, Modal, Field, Badge, charts…
  lib/          pure logic, no React
                date.ts       date helpers built on date-fns
                db.ts         localStorage load/save + schema migration
                grades.ts     weighted grade projection
                scheduler.ts  the auto study planner
                urgency.ts    due-date scoring, sorting and labels
  pages/        one file per route (Dashboard, Courses, Assessments,
                Planner, CalendarPage, Tasks, SettingsPage)
  store/        zustand stores: useStore (all data), useGoogle, useToast
  types/        the shared TypeScript model
  index.css     Tailwind v4 theme: colour tokens, both themes, course colours
  App.tsx       routes (HashRouter)
  main.tsx      entry point
```

## Scripts

```bash
npm run dev      # dev server with hot reload on http://localhost:5173
npm run build    # typecheck (tsc -b) and build to dist/
npm run preview  # serve the built dist/ locally to check it before deploying
npm run lint     # oxlint
```
