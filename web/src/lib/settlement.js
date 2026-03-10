// ─── SETTLEMENT ENGINE ───────────────────────────────────
// Calculates who owes whom and simplifies debts using a greedy algorithm

/**
 * Calculate net balances from shared expenses
 * Positive = owed money (creditor), Negative = owes money (debtor)
 *
 * @param {Array} sharedExpenses - All shared expenses for a family
 * @returns {Map<string, number>} userId → net balance
 */
export function calculateBalances(sharedExpenses) {
  const balances = new Map();

  for (const expense of sharedExpenses) {
    const { paidByUserId, splits } = expense;
    if (!splits || !Array.isArray(splits)) continue;

    for (const split of splits) {
      if (split.settled) continue; // Already settled — skip
      if (split.userId === paidByUserId) continue; // Don't count the payer's own share

      // The payer is owed this amount
      balances.set(paidByUserId, (balances.get(paidByUserId) || 0) + split.amount);
      // The split member owes this amount
      balances.set(split.userId, (balances.get(split.userId) || 0) - split.amount);
    }
  }

  return balances;
}

/**
 * Simplify debts: minimize the number of transfers needed
 * Uses greedy algorithm: match largest creditor with largest debtor
 *
 * @param {Map<string, number>} balances - userId → net balance
 * @returns {Array<{from: string, to: string, amount: number}>} Simplified transfers
 */
export function simplifyDebts(balances) {
  const creditors = []; // People who are owed money (positive balance)
  const debtors = [];   // People who owe money (negative balance)

  for (const [userId, balance] of balances) {
    if (balance > 0.01) {
      creditors.push({ userId, amount: balance });
    } else if (balance < -0.01) {
      debtors.push({ userId, amount: -balance }); // Make positive
    }
  }

  // Sort descending by amount
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];

    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0.01) {
      transfers.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < 0.01) ci++;
    if (debtor.amount < 0.01) di++;
  }

  return transfers;
}

/**
 * Get per-member spending summary
 * @param {Array} sharedExpenses
 * @returns {Array<{userId: string, totalPaid: number, totalOwed: number, net: number}>}
 */
export function getMemberSummary(sharedExpenses) {
  const summary = new Map();

  for (const expense of sharedExpenses) {
    const { paidByUserId, totalAmount, splits } = expense;

    // Track total paid
    const paidEntry = summary.get(paidByUserId) || { userId: paidByUserId, totalPaid: 0, totalOwed: 0 };
    paidEntry.totalPaid += totalAmount;
    summary.set(paidByUserId, paidEntry);

    // Track what each member owes
    if (splits) {
      for (const split of splits) {
        const entry = summary.get(split.userId) || { userId: split.userId, totalPaid: 0, totalOwed: 0 };
        entry.totalOwed += split.amount;
        summary.set(split.userId, entry);
      }
    }
  }

  return Array.from(summary.values()).map((s) => ({
    ...s,
    net: s.totalPaid - s.totalOwed,
  }));
}
