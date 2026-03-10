import { useEffect, useRef, useCallback } from 'react';

/**
 * React hook that creates a compute web worker on mount and terminates it on unmount.
 * Returns { compute(type, data): Promise<result> } for request-response matching.
 */
export function useComputeWorker() {
  const workerRef = useRef(null);
  const pendingRef = useRef(new Map()); // id -> { resolve, reject }
  const idCounter = useRef(0);

  useEffect(() => {
    // Create worker from the computeWorker module
    workerRef.current = new Worker(
      new URL('./computeWorker.js', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.addEventListener('message', (e) => {
      const { id, result, error } = e.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;

      pendingRef.current.delete(id);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    });

    workerRef.current.addEventListener('error', (e) => {
      console.error('Compute worker error:', e);
      // Reject all pending requests
      for (const [id, pending] of pendingRef.current) {
        pending.reject(new Error('Worker error'));
        pendingRef.current.delete(id);
      }
    });

    return () => {
      // Terminate worker on unmount
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Reject any remaining pending requests
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error('Worker terminated'));
      }
      pendingRef.current.clear();
    };
  }, []);

  const compute = useCallback((type, data) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++idCounter.current;
      pendingRef.current.set(id, { resolve, reject });

      workerRef.current.postMessage({ id, type, payload: data });
    });
  }, []);

  return { compute };
}
