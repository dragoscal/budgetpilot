# BudgetPilot — Complete Application Reference Document

> **Purpose**: This document contains every detail about the BudgetPilot application — architecture, implementation, data flow, UI/UX patterns, features, and current state. Use this to perform a deep analysis and generate a comprehensive improvement plan covering: feature gaps, UX/UI redesign suggestions, logic issues, family implementation review, performance optimizations, and new feature ideas.

---

## 1. PROJECT OVERVIEW

**BudgetPilot** is a full-stack personal finance management Progressive Web App (PWA) built for Romanian users (default currency RON, Romanian merchants, bilingual RO/EN).

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 6 + React Router v6 |
| Styling | Tailwind CSS v3 (class-based dark mode) |
| Charts | Recharts |
| Icons | Lucide React (~50 icons used) |
| Fonts | Fraunces (serif headings) + Outfit (sans body) |
| Offline Storage | IndexedDB via `idb` library |
| Backend | Cloudflare Worker (single JS file) |
| Database | Cloudflare D1 (SQLite) |
| Auth | Custom JWT (HMAC-SHA256) via Web Crypto API |
| AI | Anthropic Claude API (direct + proxy), OpenAI, OpenRouter |
| Bot | Telegram webhook (expense tracking via chat) |
| i18n | Custom lightweight engine (no library), RO + EN |
| PWA | Custom service worker, manifest.json |

### Design Philosophy
- **Offline-first**: All data stored in IndexedDB. Works fully without internet.
- **Sync optional**: Backend sync is available but not required.
- **AI-enhanced**: Receipt scanning, NLP input, bank statement parsing, spending insights.
- **Romanian-focused**: Default language RO, currency RON, Romanian merchant recognition.

---

## 2. ARCHITECTURE OVERVIEW

### Data Flow (Layered)
```
User Interaction (Pages/Components)
        |
Context Providers (Auth, Sync, Theme, Language, Settings, Family, Toast)
        |
API Abstraction Layer (api.js) — unified CRUD interface
        |
    +---+---+
    |       |
storage.js  sync.js
(IndexedDB)  (Background sync to CF Worker)
    |       |
    +---+---+
        |
   D1 Database (Cloudflare)
```

### Key Architectural Pattern
Every CRUD operation follows this flow:
1. **Write to IndexedDB first** (instant, offline-capable)
2. **Try immediate API push** (if backend configured + online)
3. **Fall back to sync queue** (if push fails or offline)
4. **Background sync** picks up queued items when connectivity returns

### Context Provider Nesting (main.jsx)
```
BrowserRouter
  ThemeProvider          — dark/light mode
    LanguageProvider     — i18n (RO/EN)
      ToastProvider      — notification system
        AuthProvider     — user session, login/register
          SettingsProvider — hide amounts privacy
            SyncProvider    — cloud sync state
              FamilyProvider  — family/group management
                App           — routes + layout
```

---

## 3. DATABASE SCHEMA (D1 / IndexedDB)

### Tables (22 total)

#### Core Tables
| Table | Key Fields | Purpose |
|-------|-----------|---------|
| **users** | id, email (unique), name, passwordHash, salt, defaultCurrency, onboardingComplete, role, suspended | User accounts |
| **transactions** | id, userId, type (expense/income/transfer), merchant, amount, currency, category, subcategory, date, description, tags (JSON), source, items (JSON), splitFrom, deletedAt | All financial transactions (soft-delete) |
| **budgets** | id, userId, category, amount, currency, month, rollover | Monthly category budgets |
| **goals** | id, userId, name, type (save_up/pay_down), targetAmount, currentAmount, currency, targetDate, interestRate, color | Savings/paydown goals |
| **accounts** | id, userId, name, type, balance, currency, color, isLiability | Bank accounts, wallets, credit cards |
| **recurring** | id, userId, name, merchant, amount, currency, category, frequency, billingDay, endDate, active, autoDetected | Recurring bills/subscriptions |

#### People & Debts
| Table | Key Fields | Purpose |
|-------|-----------|---------|
| **people** | id, userId, name, emoji, phone, notes | People you track debts with |
| **debts** | id, userId, personId (FK), type (lent/borrowed), amount, remaining, currency, description, date, settled | Individual debt records |
| **debt_payments** | id, userId, debtId (FK), amount, date, note | Payments against debts |

#### Family/Group
| Table | Key Fields | Purpose |
|-------|-----------|---------|
| **families** | id, name, createdBy (FK), emoji | Family/group accounts |
| **family_members** | id, familyId (FK), userId (FK), role (admin/member), joinedAt | Members of families |
| **shared_expenses** | id, familyId (FK), paidByUserId (FK), amount, currency, description, category, date, splitMethod (equal/custom), settled | Shared family expenses |

#### Additional Features
| Table | Key Fields | Purpose |
|-------|-----------|---------|
| **wishlist** | id, userId, name, estimatedPrice, currency, category, priority (1-5), url, notes, purchased | Purchase wishlist |
| **loans** | id, userId, name, type (8 types), lender, principalAmount, remainingBalance, interestRate, interestType, monthlyPayment, currency, startDate, endDate, paymentDay, status, notes | Bank/personal loans |
| **loan_payments** | id, userId, loanId (FK), amount, principalPortion, interestPortion, date, note | Loan payment records |
| **challenges** | id, userId, name, type, targetAmount, category, startDate, endDate, status (active/completed/failed), progress | Gamified spending challenges |
| **receipts** | id, userId, merchant, total, currency, category, transactionId, processedAt | Scanned receipt archive |

#### System Tables
| Table | Key Fields | Purpose |
|-------|-----------|---------|
| **settings** | userId + key (composite PK), value | Key-value user settings |
| **sync_log** | id, userId, tableName, recordId, action, timestamp | Sync audit trail |
| **api_logs** | id, userId, method, path, status, responseTime, error, userAgent, ip, timestamp | API request logs |
| **activity_log** | id, userId, action, metadata (JSON), timestamp | Feature usage tracking |
| **feedback** | id, userId, type (bug/suggestion/other), title, description, screenshot, status, adminNote, page, userAgent | User feedback system |

### IndexedDB Stores (20 stores, version 8)
Same as D1 tables plus: `syncQueue` (pending sync items), `receiptDrafts` (saved receipt scan drafts).

### Indexes
35+ indexes on commonly queried columns (userId, date, category, status, type, personId, familyId, loanId, debtId).

---

## 4. CATEGORIES SYSTEM

### 19 Main Categories
| ID | Name | Icon | Color |
|----|------|------|-------|
| groceries | Groceries | shopping cart | #059669 |
| dining | Dining | plate | #d97706 |
| transport | Transport | car | #6366f1 |
| shopping | Shopping | bag | #9b59b6 |
| health | Health | pill | #e74c3c |
| subscriptions | Subscriptions | TV | #8e44ad |
| utilities | Utilities | lightbulb | #f39c12 |
| entertainment | Entertainment | film | #e67e22 |
| education | Education | book | #2980b9 |
| travel | Travel | plane | #1abc9c |
| housing | Housing | house | #34495e |
| personal | Personal | person | #7f8c8d |
| gifts | Gifts | gift | #e91e63 |
| insurance | Insurance | shield | #607d8b |
| pets | Pets | paw | #795548 |
| savings | Savings | bank | #059669 |
| income | Income | money | #059669 |
| transfer | Transfer | arrows | #6366f1 |
| other | Other | box | #95a5a6 |

### 60+ Subcategories
Each main category has 3-8 subcategories (e.g., groceries: Produce, Dairy, Meat & Fish, Bakery, Snacks, Beverages, Frozen, Pantry).

### Merchant Auto-Categorization
~60 hardcoded merchant keywords mapped to categories. Romanian-specific: Lidl, Kaufland, Mega Image, Profi, Carrefour (groceries), Bolt, Uber (transport), OMV, Petrom, Rompetrol (fuel), eMAG (shopping), Netflix, HBO, Spotify (subscriptions), etc.

Plus a **learning system**: tracks user manual category corrections, and after 2+ corrections for the same merchant, auto-suggests the learned category.

---

## 5. ALL PAGES (25 pages)

### 5.1 Dashboard (/)
**The main hub. Shows financial overview for selected month.**

Sections:
- Month picker navigation (left/right arrows)
- **Quick Stats row**: 4 StatCards — Total Expenses, Total Income, Net, Transaction Count. Each with month-over-month trend arrows.
- **Financial Health Score**: 0-100 circular SVG donut chart. Weighted from: budget adherence (30%), savings rate (25%), spending consistency (20%), goal progress (15%), expense diversity (10%).
- **Spending Chart**: Daily spending AreaChart for the month.
- **Top Categories**: Horizontal bars showing top 5 spending categories.
- **Budget Overview**: Top budget bars with spent/limit percentages.
- **Predictions card**: Predicted end-of-month spending based on moving averages. Shows daily rate, days left, trend arrow. Lists spending anomalies (categories >50% above average).
- **Bill Suggestions card**: Unused subscriptions, duplicate services, price increases, annual billing suggestions. Each dismissible.
- **Recurring Due Today banner**: Shows bills due today that haven't been auto-created yet.
- **Recent Transactions**: Last 5 transactions with expand option.

All widgets are **customizable** — users can show/hide and reorder via a gear icon settings dropdown. Config saved in localStorage.

### 5.2 Add Transaction (/add)
**Multi-method transaction entry.**

4 tabs:
1. **Quick Add (NLP)**: Type natural language like "45 lei Bolt taxi" — AI parses it. Shows example chips. Requires internet.
2. **Receipt Scan**: Upload photo or capture with camera. AI extracts merchant, items, totals. Shows confidence scores per item. Items can be inline-edited.
3. **Bank Statement**: Upload PDF. AI extracts all transactions. Supports Romanian banks (BRD, BCR, ING, Raiffeisen, BT, CEC, etc.). Max 20MB, up to 16000 AI tokens.
4. **CSV Import**: Upload CSV/TSV. Auto-detects delimiter (comma/semicolon/tab). Auto-maps columns by header patterns (supports RO headers). European number format support. Preview table.

Plus a **Manual Form** (always available below tabs):
- Type toggle (expense/income/transfer)
- Merchant field with debounced autocomplete from transaction history
- Amount + currency selector
- CategoryPicker (hierarchical with subcategories, search, recent picks)
- Date picker
- Description textarea
- TagInput with hashtag autocomplete
- Account dropdown (from accounts in IndexedDB)
- Draft save/load system

**AI result review**: After any AI processing, results appear as review cards. Each field (merchant, category, amount, date) is inline-editable. Confidence scores shown as colored badges. Items can be expanded, added, deleted.

**Duplicate detection**: Before saving, checks for potential duplicates (same date+amount+merchant). Shows warning with confidence score.

### 5.3 Transactions (/transactions)
**Full transaction list with search, filters, and bulk operations.**

Features:
- Text search across merchant, description, tags
- Filter panel: category dropdown, type filter, tag chips, date range, amount range (min/max)
- Sort: date (newest/oldest), amount (high/low), merchant (A-Z)
- Pagination (20 per page)
- Checkbox selection for bulk operations
- Bulk actions: delete selected, re-categorize selected
- CSV export button
- Per-row actions: edit (opens TransactionEditModal), delete (with 5-second undo via toast), split
- Transaction rows show: category icon, merchant, source badge, subcategory, date, tags, account badge, amount (color-coded), multi-currency display

### 5.4 Budgets (/budgets)
**Monthly budget management with rollover support.**

Features:
- Month picker
- Personal/Family toggle (when family exists)
- Overall progress bar (total spent vs total budgeted)
- Per-category budget cards: category icon, name, spent/limit, percentage bar (green <80%, yellow 80-99%, red >=100%)
- **Rollover**: If enabled per budget, unused amount from previous month carries forward. Shows rollover amount.
- Add/Edit modal: category picker, amount input, rollover toggle
- Delete confirmation

### 5.5 Goals (/goals)
**Savings targets and debt paydown tracking.**

Two goal types:
1. **Save Up**: Track progress toward a savings target
2. **Pay Down**: Track debt reduction with interest rate and minimum payment

Features:
- Goal cards with progress bars and percentage
- Add funds button (increments currentAmount)
- Color picker per goal
- Target date with days remaining display

### 5.6 Recurring (/recurring)
**Subscription and bill management.**

Features:
- Summary cards: monthly total, annual total, active count
- **Auto-detection**: Scans transaction history for recurring patterns (same merchant, similar amount, 2+ consecutive months). Shows suggestions with accept/dismiss.
- Active items list with: name, amount, frequency badge, category, next billing date
- Paused items section
- **Subscription audit**: Analyzes all subscriptions for price increases, unused items, high-cost items. Shows total monthly/annual cost.
- Add/Edit modal: name, amount, frequency selector (9 options from daily to biannual), category, billing day, auto-pay toggle, notes

### 5.7 Calendar (/calendar)
**Calendar grid showing daily spending.**

Features:
- Monthly grid view (Monday-Sunday columns)
- Each day cell shows: total expense amount, colored dots for recurring bill due dates
- Click a day to see detail modal: bills due that day + transactions list
- Month navigation

### 5.8 Cash Flow (/cashflow)
**Income vs expenses analysis and forecasting.**

Two tabs:
1. **Overview**: 6-month income vs expenses BarChart, net cash flow LineChart, stat cards (avg monthly income/expenses/net/savings rate), income sources breakdown, expense breakdown, next month projection
2. **Forecast**: Day-by-day projected balance AreaChart with green/red gradient fill, danger zones (consecutive negative balance periods) highlighted, forecast period selector (30/60/90/180 days), upcoming bills/income lists

Forecast algorithm: Uses current account balances, recurring items schedule, and day-of-week average spending patterns from last 90 days.

### 5.9 Net Worth (/networth)
**Account and balance tracking.**

Features:
- Large net worth number (assets - liabilities)
- Assets section: accounts with positive nature (checking, savings, cash, investment, crypto, property)
- Liabilities section: credit cards and loans
- Account cards: icon, name, type badge, balance, edit/delete/update buttons
- Add/Edit account modal: name, type, balance, currency, icon, color
- Quick balance update modal

### 5.10 Analytics (/analytics)
**Monthly spending deep-dive.**

Features:
- Month picker
- Summary row: total spent, daily average, projected month total
- **Category vs Budget chart**: Horizontal BarChart showing actual vs budgeted per category
- **Subcategory drill-down**: Click a category bar to see breakdown by subcategory with proportion bars
- **Daily spending BarChart**: Day-by-day bars for the month
- **Smart insights**: AI-generated observations about spending patterns
- **Top merchants**: Ranked list with amounts
- **Spending by tag**: Tags with total amounts and progress bars

### 5.11 Settings (/settings)
**Comprehensive app configuration.**

Sections:
1. **Display**: Theme toggle, language selector (RO/EN), hide amounts option (none/all/income-only)
2. **Profile**: Name, default currency (RON/EUR/USD/GBP)
3. **Change Password**: Current + new + confirm (min 8 chars)
4. **AI Configuration**: Provider selector (Anthropic/OpenAI/OpenRouter), model dropdown (3-9 models per provider), API key input, test connection button
5. **Backend API**: URL (pre-filled with production URL), API key, test connection, sync buttons
6. **Data Management**: Export JSON, import JSON, clear all data (double confirmation)
7. **Telegram Bot**: Bot token, chat ID, webhook URL, test button, set webhook button
8. **Exchange Rates**: Fetch from frankfurter.app, manual override table per currency
9. **Danger Zone**: Delete account with typed confirmation

### 5.12 People & Debts (/people)
**Debt tracking between people.**

Features:
- Summary cards: total owed to you, total you owe, net position
- Filter tabs: all, owes me, I owe, settled
- People cards with debt balances
- Person detail: debt list, payment history
- Add person/debt/payment modals
- **Settlement calculator**: Balance netting algorithm minimizes payments. Shows optimal payment plan. "Mark as Settled" creates offsetting transactions.

### 5.13 Wishlist (/wishlist)
Features: Priority-ranked (1-5) desired purchases with price, category, URL, notes. Toggle purchased status.

### 5.14 Challenges (/challenges)
**Gamified spending challenges.**

6 preset challenges: No-spend weekend, No-spend week, Grocery budget, Dining budget, Savings sprint, No coffee.
Custom challenge creation with: type (no-spend/budget-cap/savings), target, category, duration.
Progress tracking with streaks. Active/Completed/Failed sections.

### 5.15 Receipts (/receipts)
Gallery view of scanned receipt images with search, date filter (all/week/month). Detail modal shows full image, metadata, extracted items, linked transaction.

### 5.16 Loans (/loans)
**Bank loan tracking.**

8 loan types: Mortgage, Auto, Personal, Student, Credit Card, Business, Medical, Other.
Features: Payment recording with principal/interest split, progress bars, payment history, status tracking (active/paid_off/defaulted/refinanced), monthly total, filter by status.

### 5.17 Family (/family)
**Shared budgeting groups.**

Features:
- Create family (name + emoji)
- Join via invite code
- Family switcher (when multiple families)
- 4 tabs: Dashboard (summary, settlement suggestions), Expenses (add/view shared expenses), Members (list, remove), Settings (name edit, invite code regenerate, leave)
- Split expense modal: equal or custom splits among members

### 5.18 Reports (/reports)
3 report types:
1. **Spending Summary**: Stat cards, category PieChart, category breakdown
2. **Tax Report**: Filter by tax tags (business/medical/charity/education/work), filtered transactions table
3. **Monthly Trends**: 6-month income vs expenses BarChart

Date range picker. CSV export. Print support.

### 5.19 Monthly Review (/review)
Month summary: income/expenses/net/savings rate with month-over-month comparison, budget performance per category, top 5 merchants, goal progress, recurring total.

### 5.20 Login (/login)
Email/password login with remember-me checkbox, show/hide password, error display.

### 5.21 Register (/register)
Name, email, password (with 4-rule strength indicator), confirm password, default currency selector.

### 5.22 Onboarding (/onboarding)
4-step wizard: (0) Name + language + currency, (1) First account, (2) Initial budgets for 5 categories, (3) Optional AI API key.

### 5.23 Admin (/admin)
7-tab admin panel: Overview (stats, API calls chart, feature usage), Users (management, suspend, reset password, AI access), AI Costs (token usage per user), Activity (audit log), Errors, Performance (response times, hourly traffic), Feedback (status workflow, admin notes).

### 5.24 Feedback (/feedback)
Bug report/suggestion form with screenshot upload (client-side compression), submission history with admin response viewing.

### 5.25 Not Found (*)
Simple 404 page with "Go Home" link.

---

## 6. SHARED COMPONENTS (27 components)

| Component | Purpose |
|-----------|---------|
| **Sidebar** | Desktop sidebar + mobile bottom tab bar + slide-up menu. Collapsible. Shows nav sections, user info, family picker, sync indicator, theme toggle. |
| **ManualForm** | Full transaction form with merchant autocomplete, auto-category, CategoryPicker, TagInput, account selector, validation |
| **QuickAdd** | NLP text input with AI parsing, example chips, date override |
| **ReceiptScanner** | Image upload/camera capture + AI receipt processing with progress bar |
| **BankStatementUpload** | PDF upload + AI bank statement parsing, supports Romanian banks |
| **CSVImport** | CSV/TSV import with auto-delimiter detection, column mapping, European numbers |
| **TransactionRow** | Single transaction list item with category icon, amount, tags, account badge, multi-currency, actions |
| **TransactionEditModal** | Edit modal for merchant, amount, type, category, date, description |
| **CommandPalette** | Ctrl+K spotlight search for quick page navigation, full ARIA combobox |
| **CategoryPicker** | Hierarchical category/subcategory picker with search, recent picks, drill-down |
| **Modal** | Reusable dialog with backdrop, escape close, focus trap, ARIA compliance |
| **EmptyState** | Placeholder for empty lists (icon + title + description + optional action) |
| **ErrorBoundary** | React error boundary with retry/home recovery UI |
| **SyncIndicator** | 5-state sync display: local-only, syncing, error, pending, synced |
| **OfflineBanner** | Fixed banner shown when browser goes offline |
| **InstallPrompt** | PWA install prompt with dismiss cooldown (7 days, max 3 dismissals) |
| **KeyboardShortcuts** | 9 global shortcuts (n/s/d/t/b/r/a/?//) with help overlay |
| **Toast** | Notification container with 5 types (success/error/warning/info/undo), auto-dismiss |
| **ProtectedRoute** | Auth guard: redirects to login or onboarding if needed |
| **LoadingSkeleton** | Shimmer skeletons: SkeletonCard, SkeletonRow, SkeletonChart, SkeletonPage |
| **FamilyPicker** | Sidebar dropdown to switch between personal and family modes |
| **SplitExpenseModal** | Split transaction among family members (equal/custom), duplicate detection |
| **SearchFilter** | Combined search bar + category dropdown + type filter |
| **StatCard** | Dashboard metric card with trend indicator, accent bar, hide-amounts support |
| **BudgetBar** | Category budget progress bar with color coding (green/yellow/red) |
| **TagInput** | Chip-style tag input with hashtag autocomplete from history |
| **MonthPicker** | Simple month navigation with left/right arrows |

---

## 7. BACKEND API (Cloudflare Worker)

### Auth Routes
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/register | Create account (rate-limited) |
| POST | /api/auth/login | Login, returns JWT (7-day expiry) |
| GET | /api/auth/me | Get current user profile |
| PUT | /api/auth/profile | Update name/currency |
| PUT | /api/auth/password | Change password |
| DELETE | /api/auth/account | Delete account (cascading) |

### Generic CRUD
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/:table | List records (supports date range, category filter, pagination max 500) |
| GET | /api/:table/:id | Get single record |
| POST | /api/:table | Create record |
| PUT | /api/:table/:id | Update record (ownership check) |
| DELETE | /api/:table/:id | Delete (soft for transactions, hard for others) |

Supported tables: transactions, budgets, goals, accounts, recurring, people, debts, debt_payments, wishlist, loans, loan_payments, families, family_members, shared_expenses, challenges, receipts.

### Sync Routes
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/sync/push | Bulk upsert/delete with conflict resolution |
| GET | /api/sync/pull?since= | Pull changes since timestamp (paginated, max 5000) |
| GET | /api/data/export | Full user data export |
| GET/PUT | /api/settings | User settings key-value store |

### Other Routes
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/health | Health check |
| POST | /api/ai/process | AI proxy to Anthropic (permission-gated) |
| POST | /api/feedback | Submit feedback |
| GET | /api/feedback | List user's feedback |
| POST | /telegram/webhook | Telegram bot webhook |
| POST | /api/telegram/test | Test bot token |
| POST | /api/telegram/set-webhook | Set webhook URL |

### Admin Routes (role-gated)
Stats, user management (suspend/unsuspend/delete/reset password/toggle AI access), activity logs, error logs, AI cost tracking, performance metrics, feedback management.

### Security
- D1-backed rate limiter (IP + path, 10 req/60s default)
- JWT auth with 7-day expiry
- API key alternative auth via x-api-key header
- Telegram webhook secret validation
- Client-side AI key encryption (PBKDF2 + AES-256-GCM) before server sync
- Column validation on all CRUD operations (strips unknown fields)
- Sync conflict resolution: server wins if updatedAt >= local

---

## 8. AI FEATURES

### Receipt Scanning
- Sends image (base64) to Claude with detailed system prompt
- Extracts: store name, date, items (name, quantity, unit price, total, category), payment method, subtotals
- Romanian-specific: handles utility bills, Romanian store names
- Generates 200px JPEG thumbnail for gallery
- Confidence scoring per item
- Cross-validates item total vs sum of items (2% tolerance)

### NLP Transaction Input
- Extracts #hashtags before AI processing
- Parses natural language like "45 lei Bolt taxi" into structured transaction
- Supports Romanian and English input

### Bank Statement Parsing
- Accepts PDF up to 20MB
- 16000 max tokens for large statements
- Romanian bank-specific handling (BRD, BCR, ING, etc.)
- Revolut-specific parsing rules
- Truncated JSON repair for long responses

### Monthly Summary
- AI-generated friendly financial summary
- Falls back to local math-based summary when offline

### Smart Features (No AI needed)
- **Recurring pattern detection**: Groups transactions by merchant, checks consecutive months, amount variance <15%
- **Duplicate detection**: Same date+amount+merchant = 0.95 confidence
- **Category learning**: Tracks manual corrections, auto-suggests after 2+ corrections
- **Merchant autocomplete**: From transaction history, ranked by frequency
- **Budget alerts**: Warnings at 80% and 100% thresholds
- **Subscription audit**: Detects price increases, unused subscriptions, high-cost items
- **Spending insights**: Day-of-week patterns, top category %, savings rate

### Predictions (Moving averages, no ML library)
- **Monthly spending prediction**: N-month moving average, per-category predictions
- **End-of-month balance**: Extrapolates from daily spend rate, trend detection
- **Spending anomalies**: Categories >50% above historical average

### Bill Suggestions (Rule-based)
- Unused subscriptions (no transactions in 30+ days)
- Duplicate services (multiple streaming, music, cloud subscriptions)
- Price increases (>5% over 3 months)
- Annual billing suggestion (~17% savings)

---

## 9. CURRENT NAVIGATION STRUCTURE

### Desktop Sidebar Sections
```
MAIN
  Dashboard        /
  Add Transaction  /add
  Transactions     /transactions

PLANNING
  Budgets          /budgets
  Goals            /goals
  Recurring        /recurring
  Loans            /loans

INSIGHTS
  Calendar         /calendar
  Cash Flow        /cashflow
  Net Worth        /networth
  Analytics        /analytics
  Reports          /reports

MORE
  Family           /family
  People & Debts   /people
  Wishlist         /wishlist
  Challenges       /challenges
  Receipts         /receipts
  Monthly Review   /review

BOTTOM
  Sync Indicator
  Theme Toggle
  Admin (role-gated)
  Settings
  Sign Out
  Collapse/Expand
```

### Mobile Bottom Tab Bar
```
Home | History | [+Add] | Budgets | More...
```
"More" opens slide-up panel with all other pages.

---

## 10. DESIGN SYSTEM

### Colors (Tailwind custom)
- **cream**: Stone-like neutral palette (50-900) for backgrounds and text
- **accent**: Indigo (#4f46e5 primary) for interactive elements
- **success**: Emerald for positive values
- **warning**: Amber for alerts
- **danger**: Rose for errors/negative values
- **info**: Sky for informational elements
- **income**: Emerald (same as success)
- **dark**: Custom dark mode palette (bg: #1c1917, card: #292524, border: #44403c, text: #e7e5e3)

### Typography
- Headings: Fraunces (serif, variable weight 300-900)
- Body: Outfit (sans-serif, weights 300-700)

### Layout
- Sidebar width: 240px (desktop), collapsible to 64px
- Max content width: 1000px
- Bottom tab bar height: ~56px (mobile)
- Cards: rounded-xl with subtle shadows

### Animations
- fadeUp: translate-y + opacity entrance
- slideIn: translate-x entrance
- slide-up: bottom sheet entrance
- shimmer: skeleton loading gradient
- pulse-add: mobile Add button pulse on first render

---

## 11. I18N SYSTEM

- 1,628 translation keys in both Romanian and English
- 40+ namespaces: nav, common, dashboard, transactions, budgets, goals, recurring, calendar, cashflow, networth, analytics, settings, onboarding, auth, family, people, wishlist, challenges, receipts, reports, loans, review, categories, subcategories, frequencies, accountTypes, loanTypes, loanStatuses, sortOptions, sources, goalTypes, hideOptions, admin, feedback, sync, commandPalette, predictions, etc.
- Default language: Romanian
- Fallback chain: current language -> English -> raw key
- String interpolation: `t('key', { param: value })` -> `{param}` replacement

---

## 12. PWA FEATURES

### Service Worker (sw.js)
- Cache name: `budgetpilot-v2`
- Pre-caches: `/`, `/favicon.svg`, `/manifest.json`
- Navigation: network-first with cache fallback (falls back to cached `/`)
- Hashed assets: cache-first (immutable)
- Static resources: stale-while-revalidate
- Background sync: `sync-transactions` event notifies clients
- SKIP_WAITING message support for update flow

### Manifest
- Standalone display, portrait orientation
- Shortcuts: "Add Transaction", "Scan Receipt"
- Categories: finance, productivity

### Install Prompt
- Shows after 3 seconds, dismissible with 7-day cooldown
- Max 3 total dismissals before permanently hidden

---

## 13. KEYBOARD SHORTCUTS

| Key | Action |
|-----|--------|
| n | Quick Add (navigate to /add) |
| s | Scan Receipt (navigate to /add) |
| d | Dashboard |
| t | Transactions |
| b | Budgets |
| r | Recurring |
| a | Analytics |
| / | Focus search input |
| ? | Toggle shortcut help |
| Ctrl+K | Command Palette |

---

## 14. SYNC ENGINE DETAILS

### Queue-Based Sync
1. Every local CRUD operation adds to `syncQueue` store
2. Each queue item: `{ id, action, store, data, timestamp, retries, synced }`
3. `processSyncQueue()` POSTs batch to `/api/sync/push`
4. Failed items retry up to 5 times, then discarded
5. Auto-sync runs every 60 seconds when backend configured
6. Triggered manually via sync button or automatically on coming back online
7. Background sync via Service Worker when offline

### Conflict Resolution
- Server wins if `updatedAt >= local`
- Settings sync skips local-only keys (AI keys, apiUrl, etc.)
- Sync lock prevents concurrent operations

---

## 15. KNOWN ISSUES & AREAS FOR REVIEW

### Family Implementation
- Family creation and join via invite code exists but the invite code generation/validation may need review
- Shared expenses split equally by default, custom split exists but UX may be rough
- Settlement algorithm works but hasn't been extensively tested with complex multi-party scenarios
- No notification system for family members when expenses are added
- Family budgets vs personal budgets separation may need clearer UX

### UX/UI Concerns
- Dashboard has grown complex with 8+ widget sections
- Mobile navigation: 5 tabs in bottom bar may not be the optimal selection
- Some pages lack proper loading states or error recovery
- Empty states exist but some may need better illustration/guidance
- Dark mode may have contrast issues in some components
- CategoryPicker drill-down on mobile could be more touch-friendly

### Logic Concerns
- Date handling: `parseLocalDate()` was added but may not be used everywhere consistently
- Exchange rate fallback rates are hardcoded and may be stale
- Budget rollover calculation loads previous month's transactions each render
- Recurring auto-create detection may not handle all edge cases
- Sync queue items are retried 5 times then silently discarded
- AI proxy in backend has a default model hardcoded that may need updating

### Performance
- Dashboard loads many data sources on mount (transactions, budgets, goals, recurring, accounts, rates)
- Web worker exists but isn't wired into Dashboard/Analytics yet (computed inline with useMemo)
- translation files are ~35KB each, loaded entirely on startup
- No virtual scrolling for long transaction lists

### Missing Features (Potential)
- No notification system (push or in-app)
- No data backup/restore to cloud storage
- No multi-device session management
- No transaction attachments (beyond receipts)
- No scheduled reports
- No budget templates
- No investment tracking beyond simple account balance
- No bill calendar/reminder notifications
- No spending limits/alerts per merchant

---

## 16. FILE STRUCTURE

```
D:\budget app\
  api/
    src/
      index.js          — Main Cloudflare Worker (auth, routes, middleware)
      router.js         — URL router with CORS
      auth.js           — JWT + password hashing (Web Crypto)
      crud.js           — Generic CRUD for all tables + sync
      telegram.js       — Telegram bot webhook
    schema.sql          — D1 database schema
    wrangler.toml       — Cloudflare config

  web/
    public/
      sw.js             — Service worker
      manifest.json     — PWA manifest
      favicon.svg       — App icon
    src/
      main.jsx          — Entry point, provider tree
      App.jsx           — Routes, layout, code splitting
      components/       — 27 shared components
      contexts/         — 7 context providers
      lib/
        storage.js      — IndexedDB layer (20 stores)
        sync.js         — Bidirectional sync engine
        ai.js           — AI processing (receipt, NLP, bank statement)
        auth.js         — Dual-mode authentication
        api.js          — Unified CRUD abstraction
        constants.js    — Categories, settings, merchants
        helpers.js      — Formatting, date, currency, settlements
        smartFeatures.js — Auto-recurring, duplicates, insights
        predictions.js  — Spending predictions
        billSuggestions.js — Subscription optimization
        exchangeRates.js — Currency conversion
        crypto.js       — AI key encryption
        forecasting.js  — Cash flow forecasting
        migration.js    — Local-to-user data migration
        tagHelpers.js   — Tag management
        adminApi.js     — Admin panel API client
        computeWorker.js — Web worker for heavy computation
        useWorker.js    — React hook for worker
        i18n.js         — Translation engine
        translations/
          en.js         — English (1628 keys)
          ro.js         — Romanian (1628 keys)
      pages/            — 25 page components
    index.html
    tailwind.config.js
    vite.config.js
    package.json
```

---

## 17. INSTRUCTIONS FOR GEMINI

Please analyze this entire application and provide:

### A. Feature Gap Analysis
- What essential personal finance features are missing?
- What would make this app competitive with Revolut, YNAB, Mint, Splitwise?
- What Romanian-specific features should be added?

### B. UX/UI Redesign Suggestions
- Review the navigation structure (sidebar, mobile bottom bar, 25 pages). Is it optimal? Too many pages?
- Dashboard widget overload — should some sections be moved elsewhere?
- Mobile experience improvements
- Onboarding flow improvements
- Visual design consistency review
- Accessibility improvements beyond what exists
- Animation and micro-interaction suggestions
- Information hierarchy and visual density

### C. Logic & Architecture Review
- Is the offline-first + sync architecture sound?
- Review the family/group expense implementation — is it well-designed? What's missing?
- Review the settlement algorithm correctness
- Review the AI integration patterns
- Review the auth flow (local + server dual mode)
- Review the budget rollover logic
- Review the recurring detection algorithm
- Are there race conditions or data consistency issues?

### D. Performance Optimization Plan
- Where are the biggest performance bottlenecks?
- Should the web worker be used more extensively?
- Translation file loading optimization
- Chart rendering optimization
- IndexedDB query optimization opportunities

### E. New Feature Ideas (Prioritized)
- Investment tracking
- Bill reminders and notifications
- Smart savings rules (round-up, auto-save)
- Financial goal advisor
- Social features (family leaderboards, shared goals)
- Advanced analytics (spending patterns by time, location)
- Integration ideas (bank APIs, Open Banking)

### F. Implementation Priority
- Rank all suggestions by: impact (high/medium/low), effort (days), and dependencies
- Create a phased implementation roadmap (Phase 1: Quick wins, Phase 2: Medium effort, Phase 3: Major features)

---

*Generated on 2026-03-10. Contains complete technical reference for BudgetPilot v1.0.*
