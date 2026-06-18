# PlanNest

PlanNest is a minimal dark-theme productivity and study planner inspired by common task-planning patterns, with original branding, layout, colors, and icons.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- React Router
- TanStack Query
- Zustand with local persistence
- React Hook Form + Zod
- `@dnd-kit/core` and `@dnd-kit/sortable`
- Supabase Auth + PostgreSQL
- Netlify frontend deployment

## Features

- Email/password auth UI for signup, login, logout, and password reset.
- Demo mode when Supabase env vars are missing.
- Workspaces for personal, family, team, learner, Devz, QA, and PMO style planning.
- Projects/lists with `general` and `study_plan` types.
- Tasks with priority, due dates, tags, assignee, checklist shape, completion, and drag positions.
- Kanban board with add, rename, reorder, archive columns and a configurable completed column.
- List, dashboard, calendar, and daily study views.
- Study learners, subjects, study task details, and reusable template data.
- Sidebar search and filters for workspace, project, status, priority, date, tag, learner, and subject.
- Product name and UI constants are centralized in `src/config/app.ts`.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`.

Without Supabase env vars the app runs with persisted demo data in the browser. Use the reset button in the top bar to restore the demo.

## Supabase Setup

1. Create a Supabase project.
2. Add your frontend URL in Supabase Auth URL configuration.
3. Copy `.env.example` to `.env.local` and set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

4. Apply the migration:

```bash
supabase db push
```

Or paste `supabase/migrations/20260618190000_initial_schema.sql` into the Supabase SQL editor.

5. Create a user through the app or Supabase Auth.
6. Optionally seed demo data after at least one Auth user exists:

```bash
supabase db seed
```

The migration enables RLS on every public table, grants authenticated Data API access explicitly, and restricts rows to workspace owners/members. Helper functions live in `app_private` rather than the exposed `public` schema.

## Netlify Deployment

The project includes `netlify.toml` with:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA catch-all redirect to `index.html`

Set these environment variables in Netlify:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

## Future Backend Work

Render is not required for the current frontend MVP. The migration includes TODO comments for future Render jobs/API services that can expand study templates into dated tasks, send reminders, build digests, or run background scoring.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```
