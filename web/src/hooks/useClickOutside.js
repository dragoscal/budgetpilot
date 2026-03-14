import { useEffect } from 'react';

/**
 * Shared hook for detecting clicks/touches outside a ref element.
 * Replaces 7 independent implementations across the codebase.
 *
 * @param {React.RefObject} ref - The element to monitor
 * @param {Function} handler - Called when a click outside is detected
 * @param {boolean} active - Whether the listener is active (default: true)
 * @param {Object} options
 * @param {React.RefObject} options.ignoreRef - Optional second ref to also treat as "inside"
 * @param {number} options.delay - Delay in ms before attaching listener (avoids catching trigger click)
 * @param {boolean} options.touch - Also listen for touchstart (default: false)
 */
export function useClickOutside(ref, handler, active = true, { ignoreRef, delay = 0, touch = false } = {}) {
  useEffect(() => {
    if (!active) return;

    const listener = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          (!ignoreRef?.current || !ignoreRef.current.contains(e.target))) {
        handler(e);
      }
    };

    if (delay > 0) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', listener);
        if (touch) document.addEventListener('touchstart', listener, { passive: true });
      }, delay);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', listener);
        if (touch) document.removeEventListener('touchstart', listener);
      };
    }

    document.addEventListener('mousedown', listener);
    if (touch) document.addEventListener('touchstart', listener, { passive: true });
    return () => {
      document.removeEventListener('mousedown', listener);
      if (touch) document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, active, ignoreRef, delay, touch]);
}
