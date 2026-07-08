/**
 * Instant loading skeleton for every dashboard route. Shown while server
 * components fetch data (e.g. the Instagram media list), so navigation feels
 * immediate instead of blocking on external APIs.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-xl bg-white/70" />
        <div className="h-4 w-64 rounded-lg bg-white/50" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass h-28 rounded-3xl" />
        <div className="glass h-28 rounded-3xl" />
        <div className="glass hidden h-28 rounded-3xl lg:block" />
      </div>

      <div className="glass h-64 rounded-3xl" />
    </div>
  );
}
