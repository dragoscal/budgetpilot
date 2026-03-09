export function SkeletonCard({ className = '' }) {
  return <div className={`card shimmer h-32 ${className}`} />;
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div className="w-10 h-10 rounded-xl shimmer shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded shimmer" />
        <div className="h-2.5 w-24 rounded shimmer" />
      </div>
      <div className="h-4 w-20 rounded shimmer" />
    </div>
  );
}

export function SkeletonChart({ className = '' }) {
  return <div className={`card shimmer h-64 ${className}`} />;
}

export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded shimmer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart />
      {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
    </div>
  );
}
