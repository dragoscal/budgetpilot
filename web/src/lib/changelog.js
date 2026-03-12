import { getSetting, setSetting } from './storage';

export const APP_VERSION = '1.6.1';

// Changelog entries — newest first.
// To add a new release: push an entry at the top and bump APP_VERSION.
export const CHANGELOG = [
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
