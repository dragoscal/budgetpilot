import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Hash } from 'lucide-react';
import { suggestTags } from '../lib/tagHelpers';

/**
 * Chip-style tag input with autocomplete from tag history
 * @param {{ tags: string[], onChange: (tags: string[]) => void, userId?: string }} props
 */
export default function TagInput({ tags = [], onChange, userId }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);

  // Fetch suggestions as user types
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await suggestTags(input, userId);
      // Exclude already-selected tags
      const filtered = results.filter((s) => !tags.includes(s.tag));
      if (!cancelled) {
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setHighlightIdx(-1);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [input, userId, tags]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addTag = useCallback((tag) => {
    const normalized = tag.toLowerCase().trim().replace(/^#/, '');
    if (!normalized || tags.includes(normalized)) return;
    onChange([...tags, normalized]);
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [tags, onChange]);

  const removeTag = useCallback((tagToRemove) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  }, [tags, onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        addTag(suggestions[highlightIdx].tag);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="label">Tags</label>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] px-3 py-1.5 rounded-xl border border-cream-300 dark:border-dark-border bg-white dark:bg-dark-card focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent transition-colors cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 text-xs font-medium"
          >
            <Hash size={10} className="opacity-60" />
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="ml-0.5 p-0.5 rounded-full hover:bg-accent-100 dark:hover:bg-accent-500/30 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-sm placeholder:text-cream-400 dark:placeholder:text-cream-600 p-0"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.tag}
              type="button"
              onClick={() => addTag(s.tag)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                i === highlightIdx
                  ? 'bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300'
                  : 'hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Hash size={12} className="text-cream-400" />
                {s.tag}
              </span>
              <span className="text-[10px] text-cream-400">{s.count}x</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
