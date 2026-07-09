import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendFacebookPrivateReply,
  replyToFacebookComment,
} from "@/lib/facebook";

// Webhooks must run on Node (crypto) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow time for the anti-spam delay below without the function timing out.
export const maxDuration = 60;

/* -------------------------------------------------------------------------- */
/* Anti-spam safeguards (same tuning knobs as the Instagram webhook)          */
/* -------------------------------------------------------------------------- */
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

  if (mode === "subscribe" && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/* -------------------------------------------------------------------------- */
/* Webhook payload types (Page "feed" field)                                  */
/* -------------------------------------------------------------------------- */
interface FeedValue {
  item?: string; // "comment", "post", "reaction", ...
  verb?: string; // "add", "edited", "remove", ...
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  from?: { id: string; name?: string };
  message?: string;
  created_time?: number;
}
interface WebhookEntry {
  id: string; // the Page id that owns the post
  time: number;
  changes?: { field: string; value: FeedValue }[];
}
interface WebhookBody {
  object: string;
  entry: WebhookEntry[];
}

/* -------------------------------------------------------------------------- */
/* POST — incoming feed events                                                */
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

  if (body.object !== "page") {
    return NextResponse.json({ ok: true });
  }

  // Always 200 fast; do the work but don't let one failure 500 the whole batch.
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;
      const value = change.value;
      // Only newly added comments trigger automations.
      if (value?.item !== "comment" || value?.verb !== "add") continue;
      try {
        await handleComment(entry.id, value);
      } catch (e) {
        console.error("[fb-webhook] handleComment error", e);
      }
    }
  }

  return NextResponse.json({ received: true });
}

/* -------------------------------------------------------------------------- */
/* Core logic: comment -> matching automation -> Messenger private reply     */
/* -------------------------------------------------------------------------- */
async function handleComment(pageId: string, value: FeedValue) {
  const commentId = value.comment_id;
  const postId = value.post_id;
  if (!commentId || !postId) return;

  // Ignore the Page's own comments (avoid replying to ourselves).
  if (value.from?.id && value.from.id === pageId) return;

  // Ignore replies inside comment threads — only top-level comments trigger
  // automations. On feed webhooks a top-level comment has parent_id equal to
  // the post id; replies point at their parent comment instead.
  if (value.parent_id && value.parent_id !== postId) return;

  const admin = createAdminClient();

  // Find the connected Page (and its token) by Facebook Page id.
  const { data: page } = await admin
    .from("facebook_pages")
    .select("id, user_id, page_id, page_access_token")
    .eq("page_id", pageId)
    .single();
  if (!page) return;

  // Find an active automation for this exact post.
  // (ig_media_id stores the Facebook post id for platform='facebook' rows.)
  const { data: automation } = await admin
    .from("automations")
    .select("id, keyword, dm_message, public_reply, is_active, sent_count")
    .eq("fb_page_id", page.id)
    .eq("ig_media_id", postId)
    .eq("is_active", true)
    .maybeSingle();
  if (!automation) return;

  // Optional keyword gate. Users can enter multiple triggers separated by
  // commas, semicolons, pipes, or new lines, e.g. "pm, dm, price".
  const keywords = parseKeywords(automation.keyword);
  const text = (value.message ?? "").toLowerCase();
  if (keywords.length > 0 && !keywords.some((keyword) => text.includes(keyword))) {
    await admin.from("automation_logs").insert({
      automation_id: automation.id,
      fb_page_id: page.id,
      user_id: page.user_id,
      comment_id: commentId,
      commenter_id: value.from?.id ?? null,
      commenter_username: value.from?.name ?? null,
      comment_text: value.message ?? null,
      status: "skipped",
      error: `keywords "${keywords.join(", ")}" not matched`,
    });
    return;
  }

  // Idempotency: have we already messaged this comment?
  const { data: existing } = await admin
    .from("automation_logs")
    .select("id")
    .eq("comment_id", commentId)
    .eq("status", "sent")
    .maybeSingle();
  if (existing) return;

  // One DM per person per post: if we already messaged this commenter for
  // this automation, don't DM (or public-reply) them again.
  if (value.from?.id) {
    const { data: alreadyMessaged } = await admin
      .from("automation_logs")
      .select("id")
      .eq("automation_id", automation.id)
      .eq("commenter_id", value.from.id)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();

    if (alreadyMessaged) {
      await admin.from("automation_logs").insert({
        automation_id: automation.id,
        fb_page_id: page.id,
        user_id: page.user_id,
        comment_id: commentId,
        commenter_id: value.from.id,
        commenter_username: value.from.name ?? null,
        comment_text: value.message ?? null,
        status: "skipped",
        error: "already messaged this user for this post",
      });
      return;
    }
  }

  // Anti-spam rate limit: cap DMs per Page over the last rolling hour so a
  // viral post can't trigger a burst that Meta reads as spam.
  if (HOURLY_SEND_LIMIT > 0) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentSends } = await admin
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("fb_page_id", page.id)
      .eq("status", "sent")
      .gte("created_at", since);

    if ((recentSends ?? 0) >= HOURLY_SEND_LIMIT) {
      await admin.from("automation_logs").insert({
        automation_id: automation.id,
        fb_page_id: page.id,
        user_id: page.user_id,
        comment_id: commentId,
        commenter_id: value.from?.id ?? null,
        commenter_username: value.from?.name ?? null,
        comment_text: value.message ?? null,
        status: "skipped",
        error: `hourly send limit (${HOURLY_SEND_LIMIT}) reached — skipped to avoid spam flags`,
      });
      return;
    }
  }

  // Human-like pause before replying so we don't fire instantly on every
  // comment (a common spam signal).
  await sleep(randomDelayMs());

  const message = personalize(automation.dm_message, value);

  const result = await sendFacebookPrivateReply(
    page.page_id,
    commentId,
    message,
    page.page_access_token,
  );

  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    fb_page_id: page.id,
    user_id: page.user_id,
    comment_id: commentId,
    commenter_id: value.from?.id ?? null,
    commenter_username: value.from?.name ?? null,
    comment_text: value.message ?? null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });

  if (result.ok) {
    await admin
      .from("automations")
      .update({ sent_count: (automation.sent_count ?? 0) + 1 })
      .eq("id", automation.id);

    // Optional public reply under the comment.
    if (automation.public_reply?.trim()) {
      await replyToFacebookComment(
        commentId,
        personalize(automation.public_reply, value),
        page.page_access_token,
      ).catch(() => {});
    }
  }
}

/**
 * Replace simple tokens in templates. Facebook exposes the commenter's
 * display name (not an @handle), so {{username}} becomes their name.
 */
function personalize(template: string, value: FeedValue): string {
  const name = value.from?.name ?? "there";
  return template.replaceAll("{{username}}", name);
}

function parseKeywords(input: string | null | undefined): string[] {
  return (input ?? "")
    .split(/[,;\n|]+/)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret || !header) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
