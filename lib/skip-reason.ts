import { truncateText } from "./truncate";

/** Short, human labels for automation_logs.error on skipped rows. */
export function shortSkipReason(error: string | null | undefined): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("marked as already handled")) return "Handled by you";
  if (e.includes("already messaged")) return "Already DMed";
  if (e.includes("already answered by the automation")) return "Already DMed";
  if (e.includes("you already replied")) return "You replied";
  if (e.includes("keyword")) return "No keyword match";
  if (e.includes("hourly send limit") || e.includes("rate")) return "Rate limited";
  // Keep unknown reasons short.
  return truncateText(error, 40);
}
