import { getSetting, setSetting } from './storage';

export const APP_VERSION = '4.5.1';

// Changelog entries — newest first.
// To add a new release: push an entry at the top and bump APP_VERSION.
export const CHANGELOG = [
  {
    version: '4.5.1',
    date: '2026-03-14',
    items: [
      { icon: 'Shield', textKey: 'changelog.v451security', type: 'improvement' },
      { icon: 'Zap', textKey: 'changelog.v451performance', type: 'improvement' },
      { icon: 'Bug', textKey: 'changelog.v451errorHandling', type: 'fix' },
      { icon: 'Eye', textKey: 'changelog.v451accessibility', type: 'improvement' },
    ],
  },
  {
    version: '4.5.0',
    date: '2026-03-14',
    items: [
      { icon: 'Palette', textKey: 'changelog.v450redesign', type: 'feature' },
      { icon: 'Type', textKey: 'changelog.v450typography', type: 'improvement' },
      { icon: 'Eye', textKey: 'changelog.v450darkMode', type: 'improvement' },
    ],
  },
  {
    version: '4.4.2',
    date: '2026-03-14',
    items: [
      { icon: 'Shield', textKey: 'changelog.v442codeReview', type: 'fix' },
      { icon: 'Bug', textKey: 'changelog.v442auditFix', type: 'fix' },
    ],
  },
  {
    version: '4.4.1',
    date: '2026-03-13',
    items: [
      { icon: 'Shield', textKey: 'changelog.v441suggestionFix', type: 'fix' },
    ],
  },
  {
    version: '4.4.0',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v440multiFreq', type: 'feature' },
      { icon: 'Shield', textKey: 'changelog.v440robustness', type: 'improvement' },
      { icon: 'Globe', textKey: 'changelog.v440persistDismiss', type: 'improvement' },
      { icon: 'Repeat', textKey: 'changelog.v440variableRecurring', type: 'feature' },
    ],
  },
  {
    version: '4.3.8',
    date: '2026-03-13',
    items: [
      { icon: 'Shield', textKey: 'changelog.v438robustness', type: 'fix' },
    ],
  },
  {
    version: '4.3.7',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v437billingSlots', type: 'fix' },
    ],
  },
  {
    version: '4.3.6',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v436distinctSubs', type: 'fix' },
    ],
  },
  {
    version: '4.3.5',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v435dataSource', type: 'fix' },
    ],
  },
  {
    version: '4.3.4',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v434phoneKeep', type: 'fix' },
    ],
  },
  {
    version: '4.3.3',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v433amountSplit', type: 'fix' },
    ],
  },
  {
    version: '4.3.2',
    date: '2026-03-13',
    items: [
      { icon: 'Sparkles', textKey: 'changelog.v432merchantNorm', type: 'improvement' },
    ],
  },
  {
    version: '4.3.1',
    date: '2026-03-13',
    items: [
      { icon: 'Search', textKey: 'changelog.v431scan', type: 'feature' },
    ],
  },
  {
    version: '4.3.0',
    date: '2026-03-13',
    items: [
      { icon: 'Layers', textKey: 'changelog.v430grouping', type: 'feature' },
      { icon: 'Loader', textKey: 'changelog.v430saveProgress', type: 'improvement' },
      { icon: 'Repeat', textKey: 'changelog.v430recurring', type: 'feature' },
      { icon: 'ArrowLeftRight', textKey: 'changelog.v430transfers', type: 'improvement' },
    ],
  },
  {
    version: '4.2.1',
    date: '2026-03-13',
    items: [
      { icon: 'RefreshCw', textKey: 'changelog.v421multiPass', type: 'feature' },
      { icon: 'Bug', textKey: 'changelog.v421truncationFix', type: 'fix' },
    ],
  },
  {
    version: '4.2.0',
    date: '2026-03-13',
    items: [
      { icon: 'FileSearch', textKey: 'changelog.v420documentScanner', type: 'feature' },
      { icon: 'FileText', textKey: 'changelog.v420documentTypes', type: 'feature' },
      { icon: 'Cpu', textKey: 'changelog.v420backgroundPdf', type: 'improvement' },
    ],
  },
  {
    version: '4.1.1',
    date: '2026-03-13',
    items: [
      { icon: 'Bug', textKey: 'changelog.v411fkDeletion', type: 'fix' },
      { icon: 'Shield', textKey: 'changelog.v411adminRace', type: 'fix' },
      { icon: 'Calendar', textKey: 'changelog.v411biannualFix', type: 'fix' },
      { icon: 'Zap', textKey: 'changelog.v411memoization', type: 'improvement' },
      { icon: 'Globe', textKey: 'changelog.v411i18nFixes', type: 'fix' },
    ],
  },
  {
    version: '4.1.0',
    date: '2026-03-13',
    items: [
      { icon: 'Shield', textKey: 'changelog.v410adminOverhaul', type: 'feature' },
      { icon: 'Heart', textKey: 'changelog.v410healthBreakdown', type: 'improvement' },
      { icon: 'BarChart3', textKey: 'changelog.v410analyticsWeekly', type: 'improvement' },
      { icon: 'Copy', textKey: 'changelog.v410budgetsCopy', type: 'feature' },
      { icon: 'Target', textKey: 'changelog.v410goalMilestones', type: 'improvement' },
      { icon: 'RotateCcw', textKey: 'changelog.v410challengeRetry', type: 'improvement' },
      { icon: 'GitCompareArrows', textKey: 'changelog.v410reportsYoY', type: 'feature' },
    ],
  },
  {
    version: '4.0.0',
    date: '2026-03-13',
    items: [
      { icon: 'Palette', textKey: 'changelog.v400nordicClarity', type: 'feature' },
      { icon: 'Type', textKey: 'changelog.v400typography', type: 'feature' },
      { icon: 'Layout', textKey: 'changelog.v400cardSystem', type: 'improvement' },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-03-13',
    items: [
      { icon: 'Shield', textKey: 'changelog.v320securityHardening', type: 'improvement' },
      { icon: 'Users', textKey: 'changelog.v320familyDataIsolation', type: 'fix' },
      { icon: 'Zap', textKey: 'changelog.v320syncPagination', type: 'improvement' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-03-13',
    items: [
      { icon: 'Users', textKey: 'changelog.v310familyInviteFix', type: 'fix' },
      { icon: 'Link', textKey: 'changelog.v310serverJoin', type: 'improvement' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-03-13',
    items: [
      { icon: 'Palette', textKey: 'changelog.v300refinedLuxury', type: 'feature' },
      { icon: 'Layers', textKey: 'changelog.v300designSystem', type: 'feature' },
      { icon: 'LayoutList', textKey: 'changelog.v300sidebarRedesign', type: 'improvement' },
    ],
  },
  {
    version: '2.4.0',
    date: '2026-03-13',
    items: [
      { icon: 'Hash', textKey: 'changelog.v240currencyFormat', type: 'fix' },
      { icon: 'CalendarDays', textKey: 'changelog.v240calendarPolish', type: 'improvement' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-13',
    items: [
      { icon: 'Palette', textKey: 'changelog.v230calendarEditorial', type: 'feature' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-03-13',
    items: [
      { icon: 'Shield',     textKey: 'changelog.v220importConsistency', type: 'feature' },
      { icon: 'CalendarDays', textKey: 'changelog.v220calendarRedesign', type: 'feature' },
    ],
  },
  {
    version: '2.1.1',
    date: '2026-03-13',
    items: [
      { icon: 'Shield',     textKey: 'changelog.v211auditFixes',    type: 'fix' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-03-12',
    items: [
      { icon: 'Tag',        textKey: 'changelog.v210categoryPropagation', type: 'feature' },
      { icon: 'Layers',     textKey: 'changelog.v210batchToolbar',        type: 'feature' },
      { icon: 'CheckSquare', textKey: 'changelog.v210selectAllFiltered',  type: 'feature' },
      { icon: 'Zap',        textKey: 'changelog.v210batchOperations',     type: 'feature' },
    ],
  },
  {
    version: '2.0.1',
    date: '2026-03-12',
    items: [
      { icon: 'RefreshCw',  textKey: 'changelog.v201crossComponentSync',  type: 'fix' },
      { icon: 'Shield',     textKey: 'changelog.v201mutationSafety',      type: 'fix' },
      { icon: 'Sparkles',   textKey: 'changelog.v201categoryLabels',      type: 'fix' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-03-12',
    items: [
      { icon: 'Sparkles',           textKey: 'changelog.v200customCategories',   type: 'feature' },
      { icon: 'Eye',                textKey: 'changelog.v200categoryVisibility', type: 'feature' },
      { icon: 'Bot',                textKey: 'changelog.v200aiLearning',         type: 'feature' },
      { icon: 'Settings',           textKey: 'changelog.v200categoryManagement', type: 'feature' },
    ],
  },
  {
    version: '1.9.1',
    date: '2026-03-12',
    items: [
      { icon: 'Zap',               textKey: 'changelog.v191fabHooksFix',      type: 'fix' },
      { icon: 'Shield',            textKey: 'changelog.v191apiAuthFallback',   type: 'fix' },
      { icon: 'BarChart2',         textKey: 'changelog.v191dashboardScope',    type: 'fix' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-03-12',
    items: [
      { icon: 'MessageSquare',     textKey: 'changelog.v190nlpProductMerchant', type: 'fix' },
      { icon: 'Tag',               textKey: 'changelog.v190subcategoryEdit',    type: 'feature' },
      { icon: 'Layers',            textKey: 'changelog.v190categoryPicker',     type: 'feature' },
      { icon: 'Hash',              textKey: 'changelog.v190tagEditor',          type: 'feature' },
      { icon: 'Globe',             textKey: 'changelog.v190romanianKeywords',   type: 'feature' },
      { icon: 'Zap',               textKey: 'changelog.v190pageLoadingGuards',  type: 'fix' },
      { icon: 'Users',             textKey: 'changelog.v190userIdConsistency',  type: 'fix' },
      { icon: 'Database',          textKey: 'changelog.v190tableMapFix',        type: 'fix' },
    ],
  },
  {
    version: '1.8.4',
    date: '2026-03-12',
    items: [
      { icon: 'Users',            textKey: 'changelog.v184userIdPropagation', type: 'fix' },
      { icon: 'RefreshCw',        textKey: 'changelog.v184cacheServerRecord', type: 'fix' },
      { icon: 'Bot',              textKey: 'changelog.v184telegramCurrency',  type: 'fix' },
      { icon: 'Hash',             textKey: 'changelog.v184paginationTotal',   type: 'fix' },
      { icon: 'Trash2',           textKey: 'changelog.v184accountCleanup',    type: 'fix' },
    ],
  },
  {
    version: '1.8.3',
    date: '2026-03-12',
    items: [
      { icon: 'Database',         textKey: 'changelog.v183idbUpgrade',       type: 'fix' },
      { icon: 'Coins',            textKey: 'changelog.v183reportsCurrency',  type: 'fix' },
      { icon: 'Shield',           textKey: 'changelog.v183importValidation', type: 'fix' },
      { icon: 'Tag',              textKey: 'changelog.v183categoryUndo',     type: 'fix' },
      { icon: 'RotateCcw',        textKey: 'changelog.v183recurringAmount',  type: 'fix' },
      { icon: 'Calendar',         textKey: 'changelog.v183calendarBilling',  type: 'fix' },
      { icon: 'CreditCard',       textKey: 'changelog.v183loanValidation',   type: 'fix' },
    ],
  },
  {
    version: '1.8.2',
    date: '2026-03-12',
    items: [
      { icon: 'Shield',          textKey: 'changelog.v182tokenExpiry',      type: 'fix' },
      { icon: 'Calendar',        textKey: 'changelog.v182invalidDates',     type: 'fix' },
      { icon: 'BarChart3',       textKey: 'changelog.v182velocityFix',      type: 'fix' },
      { icon: 'Zap',             textKey: 'changelog.v182migrationRace',    type: 'fix' },
      { icon: 'Camera',          textKey: 'changelog.v182receiptCalc',      type: 'fix' },
    ],
  },
  {
    version: '1.8.1',
    date: '2026-03-12',
    items: [
      { icon: 'Shield',          textKey: 'changelog.v181schemaFixes',      type: 'fix' },
      { icon: 'RefreshCw',       textKey: 'changelog.v181raceFix',          type: 'fix' },
      { icon: 'Bell',            textKey: 'changelog.v181notifications',    type: 'fix' },
      { icon: 'Globe',           textKey: 'changelog.v181monthLocale',      type: 'fix' },
      { icon: 'LogOut',          textKey: 'changelog.v181logoutSafe',       type: 'fix' },
      { icon: 'Zap',             textKey: 'changelog.v181auditEngine',      type: 'improvement' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-12',
    items: [
      { icon: 'Calendar',        textKey: 'changelog.v180customDateRange',  type: 'feature' },
      { icon: 'Hash',            textKey: 'changelog.v180pagination',       type: 'feature' },
      { icon: 'RefreshCw',       textKey: 'changelog.v180loadingFix',       type: 'fix' },
      { icon: 'RotateCcw',       textKey: 'changelog.v180billingMonth',     type: 'feature' },
      { icon: 'Tag',             textKey: 'changelog.v180categoryRules',    type: 'improvement' },
      { icon: 'Link',            textKey: 'changelog.v180correlation',      type: 'feature' },
      { icon: 'Search',          textKey: 'changelog.v180enhancedAudit',    type: 'improvement' },
      { icon: 'Search',          textKey: 'changelog.v180searchRules',      type: 'improvement' },
    ],
  },
  {
    version: '1.7.1',
    date: '2026-03-12',
    items: [
      { icon: 'Search',          textKey: 'changelog.v171paginationFix',   type: 'fix' },
      { icon: 'RotateCcw',       textKey: 'changelog.v171recurringFix',    type: 'fix' },
      { icon: 'Zap',             textKey: 'changelog.v171quickAddSave',    type: 'improvement' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-12',
    items: [
      { icon: 'RefreshCw',       textKey: 'changelog.v170navFix',           type: 'fix' },
      { icon: 'Copy',            textKey: 'changelog.v170duplicateFix',     type: 'fix' },
      { icon: 'Search',          textKey: 'changelog.v170audit',            type: 'feature' },
      { icon: 'Zap',             textKey: 'changelog.v170familyDebt',       type: 'feature' },
      { icon: 'AlertTriangle',   textKey: 'changelog.v170importWarning',    type: 'improvement' },
    ],
  },
  {
    version: '1.6.1',
    date: '2026-03-12',
    items: [
      { icon: 'RefreshCw',       textKey: 'changelog.v161loadingFix',       type: 'fix' },
      { icon: 'Bell',            textKey: 'changelog.v161notifVisible',     type: 'improvement' },
      { icon: 'Calendar',        textKey: 'changelog.v161calendarMobile',   type: 'improvement' },
      { icon: 'LayoutList',      textKey: 'changelog.v161recurringTotals',  type: 'feature' },
      { icon: 'Hash',            textKey: 'changelog.v161billingDay',       type: 'fix' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-12',
    items: [
      { icon: 'Pencil',          textKey: 'changelog.v160sourceIcon',        type: 'fix' },
      { icon: 'MessageSquare',   textKey: 'changelog.v160feedbackSidebar',   type: 'improvement' },
      { icon: 'CalendarDays',    textKey: 'changelog.v160dateFirst',         type: 'improvement' },
      { icon: 'Trash2',          textKey: 'changelog.v160deleteReliable',    type: 'fix' },
      { icon: 'Bell',            textKey: 'changelog.v160notifications',     type: 'improvement' },
      { icon: 'RotateCcw',       textKey: 'changelog.v160variableRecurring', type: 'feature' },
      { icon: 'LayoutList',      textKey: 'changelog.v160billsSubs',         type: 'feature' },
      { icon: 'Zap',             textKey: 'changelog.v160quickAddTx',        type: 'feature' },
      { icon: 'Shield',          textKey: 'changelog.v160blackPage',         type: 'fix' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-12',
    items: [
      { icon: 'Coins',           textKey: 'changelog.v150multicurrency',   type: 'fix' },
      { icon: 'Globe',           textKey: 'changelog.v150categories',      type: 'fix' },
      { icon: 'CreditCard',      textKey: 'changelog.v150currencyEdit',    type: 'fix' },
      { icon: 'Target',          textKey: 'changelog.v150goalsCurrency',   type: 'fix' },
      { icon: 'Smartphone',      textKey: 'changelog.v150mobileActions',   type: 'fix' },
      { icon: 'Zap',             textKey: 'changelog.v150quickAddGlobal',  type: 'feature' },
      { icon: 'Bell',            textKey: 'changelog.v150notifications',   type: 'improvement' },
      { icon: 'FileSpreadsheet', textKey: 'changelog.v150importSafe',      type: 'improvement' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-12',
    items: [
      { icon: 'Sparkles',   textKey: 'changelog.v140welcome',     type: 'feature' },
      { icon: 'Bell',       textKey: 'changelog.v140manualBills', type: 'feature' },
      { icon: 'Landmark',   textKey: 'changelog.v140autoBills',   type: 'feature' },
      { icon: 'XCircle',    textKey: 'changelog.v140cancelSub',   type: 'feature' },
      { icon: 'BarChart3',  textKey: 'changelog.v140payStats',    type: 'improvement' },
      { icon: 'Calendar',   textKey: 'changelog.v140calBadge',    type: 'improvement' },
    ],
  },
  {
    version: '1.3.2',
    date: '2026-03-12',
    items: [
      { icon: 'Calendar',   textKey: 'changelog.v132calendar',    type: 'feature' },
    ],
  },
  {
    version: '1.3.1',
    date: '2026-03-12',
    items: [
      { icon: 'Landmark',  textKey: 'changelog.v131autodebit',  type: 'feature' },
      { icon: 'Zap',       textKey: 'changelog.v131incomebug',  type: 'fix' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-12',
    items: [
      { icon: 'History',      textKey: 'changelog.v130history',    type: 'feature' },
      { icon: 'Copy',         textKey: 'changelog.v130duplicates', type: 'improvement' },
      { icon: 'Trash2',       textKey: 'changelog.v130cleardata',  type: 'fix' },
      { icon: 'Undo2',        textKey: 'changelog.v130undo',       type: 'feature' },
      { icon: 'CheckSquare',  textKey: 'changelog.v130selectall',  type: 'improvement' },
      { icon: 'RotateCcw',    textKey: 'changelog.v130recurring',  type: 'improvement' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-12',
    items: [
      { icon: 'UserPlus',    textKey: 'changelog.v120virtual',    type: 'feature' },
      { icon: 'FileSpreadsheet', textKey: 'changelog.v120flat',   type: 'feature' },
      { icon: 'Zap',         textKey: 'changelog.v120stream',     type: 'improvement' },
      { icon: 'Shield',      textKey: 'changelog.v120bulletproof', type: 'improvement' },
      { icon: 'Link',        textKey: 'changelog.v120link',       type: 'feature' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-11',
    items: [
      { icon: 'Calendar',   textKey: 'changelog.v110calendar',  type: 'feature' },
      { icon: 'Users',      textKey: 'changelog.v110family',    type: 'improvement' },
      { icon: 'Flame',      textKey: 'changelog.v110streaks',   type: 'feature' },
      { icon: 'BarChart3',  textKey: 'changelog.v110weekly',    type: 'feature' },
      { icon: 'Handshake',  textKey: 'changelog.v110settle',    type: 'improvement' },
    ],
  },
];

function versionToNum(v) {
  const parts = v.split('.').map(Number);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

export async function getUnseenChangelog() {
  const lastSeen = await getSetting('lastSeenVersion');
  if (!lastSeen) return CHANGELOG; // first time → show all
  const lastNum = versionToNum(lastSeen);
  return CHANGELOG.filter((entry) => versionToNum(entry.version) > lastNum);
}

export async function markChangelogSeen() {
  await setSetting('lastSeenVersion', APP_VERSION);
}
