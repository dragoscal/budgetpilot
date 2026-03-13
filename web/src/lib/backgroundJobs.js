// ─── Background AI Processing ────────────────────────────
// Holds in-flight AI jobs so they survive component unmounts.
// When a user uploads a bank statement and navigates away,
// the processing continues here and saves results as a draft.

import { processBankStatement, processDocument } from './ai';
import { saveDraft } from './storage';
import { addNotification } from './notificationStore';
import { generateId, formatDateISO } from './helpers';

let activeJob = null;

/**
 * Get the currently active background job (if any).
 */
export function getActiveJob() {
  return activeJob;
}

/**
 * Start a bank statement processing job in the background.
 * Returns { promise, controller } so the calling component can await & cancel.
 */
export function startBankStatementJob(base64Data, { userId, fileName, onProgress }) {
  // Cancel any previously running job
  if (activeJob?.controller) {
    activeJob.controller.abort();
  }

  const controller = new AbortController();
  const promise = processBankStatement(base64Data, { userId, signal: controller.signal, onProgress });

  activeJob = {
    type: 'bank_statement',
    status: 'processing',
    fileName,
    userId,
    controller,
    promise,
    handled: false,  // Set to true when the component handles the result inline
    startedAt: Date.now(),
  };

  // Attach background completion handler — only fires if component didn't handle it
  promise
    .then(async (results) => {
      if (!activeJob || activeJob.handled) return;

      // Component was unmounted — save result as draft + notify
      const txCount = results.transactions?.length || 0;
      const bankName = results.bankInfo?.bankName || 'Bank Statement';
      const currency = results.bankInfo?.currency || 'RON';

      const enrichedTx = results.transactions.map(tx => ({
        ...tx,
        _duplicate: null,
        _dismissed: false,
      }));

      const totalExpenses = enrichedTx
        .filter(tx => tx.type === 'expense')
        .reduce((s, tx) => s + (tx.amount || 0), 0);

      const draft = {
        id: generateId(),
        savedAt: new Date().toISOString(),
        label: `${bankName} — ${fileName}`,
        merchant: bankName,
        date: formatDateISO(new Date()),
        totalAmount: totalExpenses,
        currency,
        transactionCount: txCount,
        transactions: enrichedTx,
        receiptMeta: {
          receipt: {
            store: bankName,
            date: results.bankInfo?.period
              ? `${results.bankInfo.period.from} to ${results.bankInfo.period.to}`
              : 'Unknown period',
            currency,
          },
          warnings: results.warnings || [],
          summary: results.summary || `${txCount} transactions extracted`,
          hasItemsToReview: results.hasItemsToReview,
        },
        _autoSaved: true,
        _background: true,
      };

      await saveDraft(draft);

      // Add persistent notification
      await addNotification({
        type: 'info',
        title: `${bankName} processed`,
        message: `${txCount} transactions ready to review`,
        actionUrl: '/add',
      });

      activeJob = null;

      // Dispatch event so BackgroundJobNotifier can show a toast
      window.dispatchEvent(new CustomEvent('bg-job-complete', {
        detail: { txCount, bankName, draftId: draft.id },
      }));
    })
    .catch((err) => {
      if (!activeJob || activeJob.handled) return;
      if (err.name === 'AbortError') {
        activeJob = null;
        return;
      }

      activeJob = null;

      // Dispatch error event for toast
      window.dispatchEvent(new CustomEvent('bg-job-error', {
        detail: { error: err.message },
      }));
    });

  return { promise, controller };
}

/**
 * Start a document processing job in the background.
 * Works like startBankStatementJob but calls processDocument() instead.
 */
export function startDocumentJob(base64Data, mediaType, { userId, fileName, onProgress }) {
  if (activeJob?.controller) {
    activeJob.controller.abort();
  }

  const controller = new AbortController();
  const promise = processDocument(base64Data, mediaType, { userId, signal: controller.signal, onProgress });

  activeJob = {
    type: 'document',
    status: 'processing',
    fileName,
    userId,
    controller,
    promise,
    handled: false,
    startedAt: Date.now(),
  };

  promise
    .then(async (results) => {
      if (!activeJob || activeJob.handled) return;

      const txCount = results.transactions?.length || 0;
      const issuer = results.documentInfo?.issuer || 'Document';
      const currency = results.documentInfo?.currency || 'RON';

      const enrichedTx = results.transactions.map(tx => ({
        ...tx,
        _duplicate: null,
        _dismissed: false,
      }));

      const totalExpenses = enrichedTx
        .filter(tx => tx.type === 'expense')
        .reduce((s, tx) => s + (tx.amount || 0), 0);

      const draft = {
        id: generateId(),
        savedAt: new Date().toISOString(),
        label: `${issuer} — ${fileName}`,
        merchant: issuer,
        date: formatDateISO(new Date()),
        totalAmount: totalExpenses,
        currency,
        transactionCount: txCount,
        transactions: enrichedTx,
        receiptMeta: {
          receipt: results.receipt || {
            store: issuer,
            date: results.documentInfo?.date || 'Unknown date',
            currency,
          },
          warnings: results.warnings || [],
          summary: results.summary || `${txCount} transactions extracted`,
          hasItemsToReview: results.hasItemsToReview,
        },
        _autoSaved: true,
        _background: true,
      };

      await saveDraft(draft);

      await addNotification({
        type: 'info',
        title: `${issuer} processed`,
        message: `${txCount} transaction(s) ready to review`,
        actionUrl: '/add',
      });

      activeJob = null;

      window.dispatchEvent(new CustomEvent('bg-job-complete', {
        detail: { txCount, bankName: issuer, draftId: draft.id },
      }));
    })
    .catch((err) => {
      if (!activeJob || activeJob.handled) return;
      if (err.name === 'AbortError') { activeJob = null; return; }
      activeJob = null;
      window.dispatchEvent(new CustomEvent('bg-job-error', {
        detail: { error: err.message },
      }));
    });

  return { promise, controller };
}

/**
 * Mark the active job as "handled" by the component.
 * Prevents the background handler from double-saving.
 */
export function markJobHandled() {
  if (activeJob) activeJob.handled = true;
}

/**
 * Cancel the active job (user clicked Cancel).
 */
export function cancelJob() {
  if (activeJob?.controller) {
    activeJob.controller.abort();
  }
  activeJob = null;
}

/**
 * Clear the job reference without aborting (job already finished).
 */
export function clearJob() {
  activeJob = null;
}
