import { Search, Filter, X } from 'lucide-react';
import { CATEGORIES } from '../lib/constants';

export default function SearchFilter({ search, onSearch, category, onCategory, type, onType, showFilters = true }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
        <input
          type="text"
          className="input pl-9 pr-8"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 hover:text-cream-600">
            <X size={14} />
          </button>
        )}
      </div>
      {showFilters && (
        <div className="flex gap-2">
          <select className="input w-auto min-w-[130px]" value={category} onChange={(e) => onCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <select className="input w-auto min-w-[110px]" value={type} onChange={(e) => onType(e.target.value)}>
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>
        </div>
      )}
    </div>
  );
}
