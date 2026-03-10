import { getAll, update, getSetting, setSetting } from './storage';

// ─── ONE-TIME userId MIGRATION ──────────────────────────
// When a user first logs into a backend account, all their existing
// 'local' records in IndexedDB need to be re-tagged with their real
// server userId so data isolation works correctly.

const STORES_WITH_USERID = [
  'transactions',
  'budgets',
  'goals',
  'accounts',
  'recurring',
  'people',
  'debts',
  'wishlist',
  'receipts',
  'loans',
  'challenges',
];

/**
 * Migrate all IndexedDB records from userId:'local' to the real server userId.
 * Only runs once per user — stores a flag in settings to prevent re-running.
 *
 * @param {string} realUserId — The authenticated user's server ID
 * @returns {{ migrated: number, stores: string[] }} — Migration stats
 */
export async function migrateLocalToUser(realUserId) {
  if (!realUserId || realUserId === 'local') return { migrated: 0, stores: [] };

  // Check if already migrated for this user
  const flag = await getSetting(`userIdMigrated_${realUserId}`);
  if (flag) return { migrated: 0, stores: [], alreadyDone: true };

  let totalMigrated = 0;
  const migratedStores = [];

  for (const storeName of STORES_WITH_USERID) {
    try {
      const records = await getAll(storeName, { userId: 'local' });
      if (records.length === 0) continue;

      let storeMigrated = 0;
      for (const record of records) {
        try {
          await update(storeName, {
            ...record,
            userId: realUserId,
            updatedAt: new Date().toISOString(),
          });
          storeMigrated++;
        } catch (e) {
          console.warn(`Migration failed for ${storeName}/${record.id}:`, e);
        }
      }

      if (storeMigrated > 0) {
        migratedStores.push(`${storeName} (${storeMigrated})`);
        totalMigrated += storeMigrated;
      }
    } catch (e) {
      console.warn(`Migration failed for store ${storeName}:`, e);
    }
  }

  // Set flag to prevent re-running
  await setSetting(`userIdMigrated_${realUserId}`, new Date().toISOString());

  console.log(`userId migration complete: ${totalMigrated} records across ${migratedStores.length} stores`);
  return { migrated: totalMigrated, stores: migratedStores };
}
