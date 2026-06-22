export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-cyan-100 text-cyan-700",
    failed: "bg-red-100 text-red-700",
    skipped: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
        map[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}
