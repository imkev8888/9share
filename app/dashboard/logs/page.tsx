import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { MessageIcon } from "@/components/icons";

export default async function LogsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: logs } = await supabase
    .from("automation_logs")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Activity
        </h1>
        <p className="text-sm text-ink-soft">
          Every comment 9share processed — sent, skipped or failed.
        </p>
      </div>

      {logs && logs.length > 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-white/60">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-start justify-between gap-4 p-4 sm:px-6"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink">
                      @{log.commenter_username ?? "someone"}
                    </p>
                    <StatusPill status={log.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {log.comment_text ?? "—"}
                  </p>
                  {log.status === "failed" && log.error && (
                    <p className="mt-1 text-xs text-red-600">{log.error}</p>
                  )}
                </div>
                <time className="shrink-0 text-xs text-ink-soft">
                  {new Date(log.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-500">
            <MessageIcon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">No activity yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Once people start commenting on your automated posts, every DM shows
            up here in real time.
          </p>
        </div>
      )}
    </div>
  );
}
