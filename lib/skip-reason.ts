/** Short, human labels for automation_logs.error on skipped rows. */
export function shortSkipReason(error: string | null | undefined): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("already messaged")) return "Already DMed";
  if (e.includes("keyword")) return "No keyword match";
  if (e.includes("hourly send limit") || e.includes("rate")) return "Rate limited";
  // Keep unknown reasons short.
  return error.length > 40 ? `${error.slice(0, 40)}…` : error;
}
