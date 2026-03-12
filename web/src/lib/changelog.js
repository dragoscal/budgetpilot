import { getSetting, setSetting } from './storage';

export const APP_VERSION = '1.2.0';

// Changelog entries — newest first.
// To add a new release: push an entry at the top and bump APP_VERSION.
export const CHANGELOG = [
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
