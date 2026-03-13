# BudgetPilot — CLAUDE.md

## Project Overview
Full-stack personal finance app. React 18 + Vite 6 frontend, Cloudflare Worker + D1 backend, IndexedDB offline cache.

## Repository Structure
```
./
├── api/          # Cloudflare Worker (D1 database, JWT auth, AI proxy, Telegram bot)
│   ├── src/      # index.js (entry), router.js, auth.js, crud.js, admin.js, telegram.js
│   ├── migrations/   # D1 SQL migrations (manual: wrangler d1 execute)
│   └── wrangler.toml
├── web/          # React SPA (Vite 6, Tailwind CSS v3)
│   ├── src/
│   │   ├── pages/        # 20+ route pages
│   │   ├── components/   # Shared UI (Sidebar, Modal, StatCard, etc.)
│   │   ├── contexts/     # React contexts (Auth, Family, Settings, Language, etc.)
│   │   ├── lib/          # Helpers, API, translations, changelog, storage, forecasting (30+ files)
│   │   └── index.css     # Design system (card tiers, typography, buttons)
│   ├── tailwind.config.js
│   └── vite.config.js
└── .claude/      # Claude Code config (launch.json, plans, memory)
```

## Quick Start (Fresh Clone)
```bash
cd web && npm install      # Frontend dependencies
cd ../api && npm install   # Backend dependencies (wrangler, etc.)
```
Required env: `api/.dev.vars` for local dev, `wrangler.toml` bindings for production.

## Build & Dev

### Dev Server
```bash
# Via launch.json (preferred):
preview_start name="dev"
# Manual:
node web/node_modules/vite/bin/vite.js web --host  # port 5173
```

### Build
```bash
cd web && npm run build   # outputs to web/dist/
```

### Deploy
```bash
# Frontend (CF Pages) — MUST use --branch=master for production!
cd web && npm run build
npx wrangler pages deploy dist --project-name=budgetpilot --branch=master --commit-dirty=true

# Backend (CF Worker)
cd api && npx wrangler deploy
```
**⚠️ Without `--branch=master`, frontend deploys to Preview URL, NOT production.**

### Git Workflow
- Local branch: `feat/initial-app` → pushes to `origin/master`
- `git push` works (upstream already set)

## Critical Gotchas

### 1. Vite CWD Mismatch
Vite runs from the repo root, not `web/`. All configs (`tailwind.config.js`, `postcss.config.js`) MUST use absolute paths:
```js
content: [path.join(__dirname, './src/**/*.{js,jsx}')]  // NOT './src/**'
```

### 2. TABLE_COLUMNS Whitelist (Backend)
`crud.js` defines `TABLE_COLUMNS` for each table. `filterColumns()` silently strips any field not in this map. **If you add a DB column, you MUST also add it to TABLE_COLUMNS or writes will silently drop the field.**

### 3. D1 Migrations Are Manual
No automated migration runner. Run manually:
```bash
npx wrangler d1 execute budgetpilot-db --file=./migrations/NNN_name.sql --remote
```

### 4. Family Data Isolation
`getUserColumn()` maps tables to ownership columns. `families` uses `createdBy`, not `userId`. Generic CRUD GET filters by ownership — cross-user queries (like join-by-invite-code) need dedicated endpoints.

### 5. Dark Mode
`darkMode: 'class'` in Tailwind config. Theme persists via Settings context → server sync. Always test both modes. Use `dark:` prefix for dark variants.

### 6. Sidebar Width
CSS custom property `--sidebar-w: 220px` and Tailwind `margin.sidebar: '220px'` must stay in sync. `ml-sidebar` is a custom utility.

### 7. BrowserRouter (Not Hash)
React Router uses `BrowserRouter`. Preview navigation: use `preview_eval` with `window.location.href = '/path'` or find and click links.

### 8. Soft Deletes
Some tables use `deletedAt` column. Queries should filter `WHERE deletedAt IS NULL` unless showing trash/archive.

### 9. JSON Columns
`JSON_COLUMNS` in crud.js lists fields that get `JSON.parse()`/`JSON.stringify()` automatically. Add new JSON fields here.

## Design System

### Card Tiers (index.css `@layer components`)
- `.card` — Base: subtle shadow, cream border
- `.card-elevated` — Mid: stronger shadow, white top border highlight
- `.card-hero` — Top: gold accent line, float shadow (used for hero stats)

### Typography
- **Headings**: Fraunces (serif) via `font-heading`
- **Body**: Outfit (sans) via `font-sans`
- **Money/Stats**: `.stat-value` — Fraunces, tabular-nums, bold
- **Page titles**: `.page-title` — 3xl heading with gold underline accent

### Colors
- Primary action: teal (`accent-*` scale)
- Luxury accent: gold (`gold-*` scale, 50–900)
- Danger: `danger` token
- Success: `success` token
- Neutral: `cream-*` scale

### Buttons
- `.btn-primary` — Teal gradient with inner glow
- `.btn-secondary` — Outline style
- Bar gradient: `.bar-gradient-warning` — teal-to-gold for budget 80-99%

### Shadows
All card shadows are defined as raw CSS in `@layer components` (not Tailwind utilities). Do NOT add shadow-* tokens to tailwind.config.js unless they're actually referenced as utility classes in JSX.

## Component Patterns

### Layout
- `App.jsx` uses React Router v6 layout routes with `<Outlet />`
- Sidebar renders ONCE, stays mounted during navigation
- Core pages (Dashboard, Transactions, AddTransaction) are eagerly imported
- All other pages use `lazyRetry()` with 3 retries + progressive delays
- `<Suspense>` boundary is INSIDE `AppLayout` (sidebar stays visible during loads)

### Translations (i18n)
- Two locale files: `web/src/lib/translations/en.js` and `ro.js`
- Access via `useTranslation()` → `t('key.path')`
- Supports interpolation: `t('key', { amount: 100 })`
- **Every user-facing string must have keys in BOTH locale files**

### Data Layer
- **Server-first**: API (D1) is single source of truth
- **IndexedDB**: Read cache only (via `idb` library)
- API calls: `web/src/lib/api.js` — `apiFetch()` wrapper with auth headers
- Settings synced to server via `settingsApi.set()`

### Smart Features (`web/src/lib/smartFeatures.js`)
- Auto-recurring detection, duplicate detection, category learning
- Merchant autocomplete, budget alerts, smart insights
- `batchCheckDuplicates()` returns `confidence` per result (≥0.8 = auto-skip)

## Backend API Patterns

### Router (`api/src/router.js`)
Minimal custom router with path params (`:param` → regex capture groups). Methods: `get()`, `post()`, `put()`, `delete()`. Context object: `{ request, env, ctx, url, params, query, body, user }`.

### Auth (`api/src/auth.js`)
JWT with HMAC-SHA256. Token in `Authorization: Bearer <token>` header. Middleware sets `ctx.user`.

### CRUD (`api/src/crud.js`)
Generic CRUD for all tables. Key maps:
- `TABLE_COLUMNS` — field whitelist per table
- `JSON_COLUMNS` — auto JSON parse/stringify
- `TABLE_ALIASES` — URL path → actual table name
- `ADMIN_ONLY_KEYS` — settings keys restricted to admin users

### Adding a New Table
1. Create migration SQL file in `api/migrations/`
2. Add column list to `TABLE_COLUMNS` in `crud.js`
3. Add JSON fields to `JSON_COLUMNS` if applicable
4. Run migration: `npx wrangler d1 execute budgetpilot-db --file=./migrations/NNN_name.sql --remote`
5. Deploy worker: `cd api && npx wrangler deploy`

## Release Checklist — MANDATORY
Every deployment MUST include:
1. **Changelog**: Bump `APP_VERSION` + add entry in `web/src/lib/changelog.js`
2. **WhatsNew icons**: Add new lucide icons to `web/src/components/WhatsNew.jsx` ICONS map
3. **Translations**: Add `changelog.vXYZ*` keys to BOTH `en.js` and `ro.js`
4. **Build + Deploy**: Build frontend, deploy Pages + Worker
5. **Git**: Commit with version in message, push to origin/master

## Environment Variables
Backend (`api/.dev.vars` for local, Workers secrets for production):
- `JWT_SECRET` — HMAC-SHA256 signing key for auth tokens
- `ANTHROPIC_API_KEY` — AI features (receipt scan, NLP, summaries)
- `TELEGRAM_BOT_TOKEN` — Telegram bot webhook
- D1 binding: `DB` (configured in `wrangler.toml`)

## Current Version
`3.1.0` — See `web/src/lib/changelog.js`

## Testing with Preview Tools
After every file change:
1. `preview_console_logs` — zero errors
2. `preview_network(filter: 'failed')` — no failed requests
3. `preview_screenshot` — visual check at desktop
4. `preview_resize(preset: 'mobile')` — mobile check
5. `preview_resize(colorScheme: 'dark')` — dark mode check
