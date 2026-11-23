/** Shape of a typical page (title, filters, table) while its code and data arrive. */
export function PageSkeleton() {
  return (
    <div className="page-shell space-y-5" aria-busy="true">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2.5">
          <div className="skeleton h-7 w-56" />
          <div className="skeleton h-4 w-80 max-w-full" />
        </div>
        <div className="skeleton hidden h-9 w-32 sm:block" />
      </div>
      <div className="panel flex flex-wrap gap-3 p-5">
        <div className="skeleton h-9 w-48" />
        <div className="skeleton h-9 w-36" />
        <div className="skeleton h-9 w-36" />
      </div>
      <div className="panel divide-y divide-border">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex items-center gap-6 px-5 py-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 flex-1" style={{ maxWidth: `${70 - index * 5}%` }} />
            <div className="skeleton ms-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
