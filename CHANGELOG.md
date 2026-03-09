# Changelog

All notable changes to BudgetPilot are documented here.

## [Unreleased]

---

## 2026-03-09

### Added
- **Bank Statement PDF Import** — New "Statement" tab in Add Transaction. Upload bank statement PDFs and AI extracts all transactions, categorizes them, and checks for duplicates. Supports BRD, BCR, ING, Raiffeisen, Banca Transilvania, CEC, UniCredit, OTP, Alpha Bank.
- **Bank Loans Tracking** — Full loan management page under Planning > Loans. Track mortgages, auto loans, personal loans, student loans, credit cards, and more. Record payments with principal/interest split, view progress bars, payment history, and estimated months remaining.
- **Loan Payment Quick Fill** — Payment form pre-fills the monthly payment amount for faster recording.
- **Screenshot Upload in Bug Reports** — Attach screenshots when reporting bugs. Images are compressed client-side (JPEG, max 1200px) before submission. Admin panel displays attached screenshots with click-to-zoom.
- **More Recurring Frequencies** — Added Daily, Every 2 months, Every 2 years. Quarterly label clarified to "Quarterly (3 months)". Full range: Daily → Weekly → Biweekly → Monthly → Bimonthly → Quarterly → Semiannual → Annual → Biannual.

### Fixed
- **api.js update() crash** — CRUD `update()` now supports both `update(id, changes)` and `update(fullRecord)` calling conventions. Previously passing a full record object caused "Failed to execute 'get' on IDBObjectStore" error.
- **HMR IndexedDB stability** — Added `import.meta.hot.dispose` handler to close stale DB connections during Vite hot reload, preventing version upgrade blocking. Added `blocked()` callback to auto-reload on conflicts.
- **Mobile touch targets** — Increased touch target sizes for quantity buttons (w-5 h-5 → w-6 h-6), delete buttons (p-1 → p-1.5), and responsive grids on payment forms.

### Infrastructure
- IndexedDB schema upgraded to v6 (loans, loanPayments stores)
- D1 migration: loans and loan_payments tables with indexes
- API CRUD support for loans and loanPayments entities
- LOAN_TYPES and LOAN_STATUSES constants added

---

## 2026-03-08

### Added
- **Bug Report & Suggestion System** — Users can submit feedback directly from the app. Admin panel shows all feedback with status management.
- **Receipt Drafts** — Save partially reviewed receipts for later. Resume editing anytime from the drafts panel.
- **Receipt Review Editing UX** — Clearer visual indicators for editable fields in receipt review.

### Fixed
- Receipt parsing improvements for Romanian utility bills and amount validation.

---

## 2026-03-07

### Added
- **AI Cost Tracking** — Admin panel tracks AI usage costs per user.
- **Encrypted AI Key Sync** — AI keys encrypted client-side before cloud sync.
- **Admin AI Proxy Toggle** — Admins can enable/disable shared AI key proxy.
- **Cloud Sync** — Full data sync via Cloudflare D1. Data accessible from anywhere.

### Fixed
- Whitelisted D1 columns in sync push to prevent 500 errors.
- Client-side AI key used first, falls back to server proxy.

---

## 2026-03-06

### Added
- **Subcategories** — Two-level category hierarchy (e.g., Groceries > Dairy, Dining > Cafe).
- **CategoryPicker Component** — Shared searchable category/subcategory picker replacing plain HTML selects across the app.
- **Receipt Review Overhaul** — Inline editing for merchant, amounts, item names, prices, quantities. Delete/add items with auto-recalculating totals.
- **Recurring Frequencies** — Weekly, biweekly, monthly, quarterly, semiannual, annual. Monthly/annual equivalent calculations.

---

## 2026-03-05

### Added
- **Design Refresh** — New color palette, typography, and component styling.
- **Admin Panel** — User management, system stats, AI proxy configuration.
- **Multi-Provider AI** — Support for different AI model providers.
- **Hide Amounts** — Privacy toggle to hide financial amounts on screen.

---

## 2026-03-04

### Added
- **Initial Release** — Full-stack personal finance manager with 14+ pages.
  - Dashboard with spending trends, category breakdown, savings goals
  - Transaction management (quick add via NLP, receipt scanning, manual entry)
  - Budgets, Goals, Recurring payments, Accounts
  - Calendar view, Cash Flow analysis, Net Worth tracking, Analytics
  - People & Debts, Wishlist, Monthly Review
  - Dark mode, offline-first IndexedDB, Cloudflare Workers backend
  - Telegram bot integration
  - Smart features: auto-categorization, duplicate detection, merchant autocomplete, budget alerts
