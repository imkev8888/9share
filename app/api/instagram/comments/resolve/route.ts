import { NextResponse, type NextRequest } from "next/server";
import { getCommentReplies } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve our public reply under an inbound comment and persist public_reply_id.
 * Used for older Activity rows created before we stored reply ids.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { accountId?: string; logId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accountId, logId } = body;
  if (!accountId || !logId) {
    return NextResponse.json(
      { error: "Missing accountId or logId" },
      { status: 400 },
    );
  }

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("access_token, username, ig_user_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: log } = await supabase
    .from("automation_logs")
    .select(
      "id, comment_id, public_reply_id, public_reply_text, commenter_username, automation_id",
    )
    .eq("id", logId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!log?.comment_id) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  if (log.public_reply_id) {
    return NextResponse.json({
      ok: true,
      public_reply_id: log.public_reply_id,
      public_reply_text: log.public_reply_text,
    });
  }

  let replies;
  try {
    replies = await getCommentReplies(log.comment_id, account.access_token);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load replies";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const norm = (s: string) => s.trim().toLowerCase();
  const ourUsername = norm(account.username ?? "");

  let templateTexts: string[] = [];
  if (log.public_reply_text?.trim()) {
    templateTexts.push(log.public_reply_text.trim());
  }
  if (log.automation_id) {
    const { data: automation } = await supabase
      .from("automations")
      .select("public_reply")
      .eq("id", log.automation_id)
      .maybeSingle();
    const tmpl = automation?.public_reply?.trim();
    if (tmpl) {
      templateTexts.push(tmpl);
      templateTexts.push(
        tmpl.replaceAll(
          "{{username}}",
          log.commenter_username ? `@${log.commenter_username}` : "@there",
        ),
      );
    }
  }
  templateTexts = [...new Set(templateTexts.map(norm))];

  let ours = replies.filter((r) => {
    const u = norm(r.username || r.from?.username || "");
    if (ourUsername && u === ourUsername) return true;
    if (account.ig_user_id && r.from?.id === account.ig_user_id) return true;
    return false;
  });

  // Fallback: match reply text to our template (case-insensitive).
  if (!ours.length && templateTexts.length) {
    ours = replies.filter((r) => templateTexts.includes(norm(r.text ?? "")));
  }

  // Last resort: single reply under the comment when we expected a public reply.
  if (!ours.length && replies.length === 1 && templateTexts.length) {
    ours = replies;
  }

  const pick = ours[0];
  if (!pick?.id) {
    return NextResponse.json(
      {
        error: "No public reply from your account found under this comment",
        repliesFound: replies.length,
      },
      { status: 404 },
    );
  }

  const publicReplyText = pick.text ?? log.public_reply_text ?? null;
  await supabase
    .from("automation_logs")
    .update({
      public_reply_id: pick.id,
      public_reply_text: publicReplyText,
    })
    .eq("id", log.id)
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    public_reply_id: pick.id,
    public_reply_text: publicReplyText,
  });
}
