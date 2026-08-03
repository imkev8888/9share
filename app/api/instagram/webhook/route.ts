import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPrivateReply, replyToComment } from "@/lib/instagram";

// Webhooks must run on Node (crypto) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow time for the anti-spam delay below without the function timing out.
export const maxDuration = 60;

/* -------------------------------------------------------------------------- */
/* Anti-spam safeguards                                                       */
/* -------------------------------------------------------------------------- */
// Instagram/Meta flag accounts that fire identical replies instantly, in big
// bursts. To look human we wait a small randomized amount before each reply,
// and cap how many DMs a single account sends per rolling hour. Both are
// configurable via env so they can be tuned without a redeploy.
const REPLY_DELAY_MIN_MS = Number(process.env.REPLY_DELAY_MIN_MS ?? 4000);
const REPLY_DELAY_MAX_MS = Number(process.env.REPLY_DELAY_MAX_MS ?? 12000);
const HOURLY_SEND_LIMIT = Number(process.env.HOURLY_SEND_LIMIT ?? 80);

function randomDelayMs() {
  const min = Math.max(0, REPLY_DELAY_MIN_MS);
  const max = Math.max(min, REPLY_DELAY_MAX_MS);
  return Math.round(min + Math.random() * (max - min));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/* GET — Meta's webhook verification handshake                                */
/* -------------------------------------------------------------------------- */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/* -------------------------------------------------------------------------- */
/* Webhook payload types                                                      */
/* -------------------------------------------------------------------------- */
interface CommentValue {
  id: string;
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  parent_id?: string;
}
interface WebhookEntry {
  id: string; // the IG account id that owns the media
  time: number;
  changes?: { field: string; value: CommentValue }[];
}
interface WebhookBody {
  object: string;
  entry: WebhookEntry[];
}

/* -------------------------------------------------------------------------- */
/* POST — incoming comment events                                             */
/* -------------------------------------------------------------------------- */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verify the X-Hub-Signature-256 header (HMAC-SHA256 of the body).
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  if (body.object !== "instagram") {
    return NextResponse.json({ ok: true });
  }

  // Always 200 fast; do the work but don't let one failure 500 the whole batch.
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      try {
        await handleComment(entry.id, change.value);
      } catch (e) {
        console.error("[webhook] handleComment error", e);
      }
    }
  }

  return NextResponse.json({ received: true });
}

/* -------------------------------------------------------------------------- */
/* Core logic: comment -> matching automation -> DM                           */
/* -------------------------------------------------------------------------- */
async function handleComment(igAccountId: string, comment: CommentValue) {
  const admin = createAdminClient();

  // Find the connected account (and its token) by IG user id.
  const { data: account } = await admin
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, access_token")
    .eq("ig_user_id", igAccountId)
    .single();
  if (!account) return;

  // Ignore the account's own comments (avoid replying to ourselves).
  if (comment.from?.id && comment.from.id === account.ig_user_id) return;

  // Ignore replies inside comment threads — only top-level comments trigger
  // automations. Otherwise every message in a back-and-forth conversation
  // under a comment would fire another DM.
  if (comment.parent_id) return;

  const mediaId = comment.media?.id;
  if (!mediaId) return;

  // Find an active automation for this exact post/reel.
  const { data: automation } = await admin
    .from("automations")
    .select("id, keyword, dm_message, public_reply, is_active, sent_count")
    .eq("account_id", account.id)
    .eq("ig_media_id", mediaId)
    .eq("is_active", true)
    .maybeSingle();
  if (!automation) return;

  // Optional keyword gate. Users can enter multiple triggers separated by
  // commas, semicolons, pipes, or new lines, e.g. "pm, dm, price".
  const keywords = parseKeywords(automation.keyword);
  const text = (comment.text ?? "").toLowerCase();
  if (keywords.length > 0 && !keywords.some((keyword) => text.includes(keyword))) {
    await admin.from("automation_logs").insert({
      automation_id: automation.id,
      account_id: account.id,
      user_id: account.user_id,
      comment_id: comment.id,
      commenter_id: comment.from?.id ?? null,
      commenter_username: comment.from?.username ?? null,
      comment_text: comment.text ?? null,
      status: "skipped",
      error: `keywords "${keywords.join(", ")}" not matched`,
    });
    return;
  }

  // Idempotency: have we already DMed this comment?
  const { data: existing } = await admin
    .from("automation_logs")
    .select("id")
    .eq("comment_id", comment.id)
    .eq("status", "sent")
    .maybeSingle();
  if (existing) return;

  // One DM per person per post: if we already messaged this commenter for
  // this automation, don't DM (or public-reply) them again.
  if (comment.from?.id) {
    const { data: alreadyMessaged } = await admin
      .from("automation_logs")
      .select("id")
      .eq("automation_id", automation.id)
      .eq("commenter_id", comment.from.id)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();

    if (alreadyMessaged) {
      await admin.from("automation_logs").insert({
        automation_id: automation.id,
        account_id: account.id,
        user_id: account.user_id,
        comment_id: comment.id,
        commenter_id: comment.from.id,
        commenter_username: comment.from.username ?? null,
        comment_text: comment.text ?? null,
        status: "skipped",
        error: "already messaged this user for this post",
      });
      return;
    }
  }

  // Anti-spam rate limit: cap DMs per account over the last rolling hour so a
  // viral post can't trigger a burst that Instagram reads as spam.
  if (HOURLY_SEND_LIMIT > 0) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentSends } = await admin
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("status", "sent")
      .gte("created_at", since);

    if ((recentSends ?? 0) >= HOURLY_SEND_LIMIT) {
      await admin.from("automation_logs").insert({
        automation_id: automation.id,
        account_id: account.id,
        user_id: account.user_id,
        comment_id: comment.id,
        commenter_id: comment.from?.id ?? null,
        commenter_username: comment.from?.username ?? null,
        comment_text: comment.text ?? null,
        status: "skipped",
        error: `hourly send limit (${HOURLY_SEND_LIMIT}) reached — skipped to avoid spam flags`,
      });
      return;
    }
  }

  // Human-like pause before replying so we don't fire instantly on every
  // comment (a common spam signal).
  await sleep(randomDelayMs());

  const message = personalize(automation.dm_message, comment);

  const result = await sendPrivateReply(
    account.ig_user_id,
    comment.id,
    message,
    account.access_token,
  );

  let publicReplyText: string | null = null;
  let publicReplyId: string | null = null;

  if (result.ok) {
    await admin
      .from("automations")
      .update({ sent_count: (automation.sent_count ?? 0) + 1 })
      .eq("id", automation.id);

    // Optional public reply under the comment.
    if (automation.public_reply?.trim()) {
      publicReplyText = personalize(automation.public_reply, comment);
      const reply = await replyToComment(
        comment.id,
        publicReplyText,
        account.access_token,
      ).catch(() => ({ ok: false as const, id: undefined, error: "reply failed" }));
      if (reply.ok && reply.id) {
        publicReplyId = reply.id;
      } else if (!reply.ok) {
        publicReplyText = null;
      }
    }
  }

  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    account_id: account.id,
    user_id: account.user_id,
    comment_id: comment.id,
    commenter_id: comment.from?.id ?? null,
    commenter_username: comment.from?.username ?? null,
    comment_text: comment.text ?? null,
    dm_text: result.ok ? message : null,
    public_reply_text: publicReplyText,
    public_reply_id: publicReplyId,
    source: "automation",
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });
}

/** Replace simple tokens in templates. */
function personalize(template: string, comment: CommentValue): string {
  const username = comment.from?.username ?? "there";
  return template.replaceAll("{{username}}", `@${username}`);
}

function parseKeywords(input: string | null | undefined): string[] {
  return (input ?? "")
    .split(/[,;\n|]+/)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret || !header) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
