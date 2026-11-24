/** Placeholder cards while the event list streams in. */
export function CatalogueSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-card border-hairline bg-surface overflow-hidden border">
          <div className="skeleton h-36 rounded-none" />
          <div className="flex flex-col gap-3 p-5">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-6 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}
