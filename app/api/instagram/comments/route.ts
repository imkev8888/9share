import { NextResponse, type NextRequest } from "next/server";
import {
  createMediaComment,
  deleteComment,
  replaceCommentReply,
  replaceMediaComment,
} from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

async function getOwnedAccount(
  accountId: string,
  userId: string,
): Promise<{ access_token: string; username: string | null } | null> {
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("access_token, username")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return account ?? null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * POST — create a comment (mediaId + message) or replace one (commentId + message).
 * Instagram cannot edit comment text in place; we post a new one and delete the old.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    accountId?: string;
    mediaId?: string;
    commentId?: string;
    message?: string;
    automationId?: string | null;
    logId?: string;
    /** Which field owns this comment id: inbound manual comment vs public reply */
    target?: "comment" | "public_reply";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = body.accountId;
  const message = body.message?.trim();
  if (!accountId || !message) {
    return NextResponse.json(
      { error: "Missing accountId or message" },
      { status: 400 },
    );
  }

  const account = await getOwnedAccount(accountId, user.id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Replace existing comment (IG has no true edit)
  if (body.commentId) {
    const target = body.target ?? "comment";
    let newId: string | undefined;

    if (target === "public_reply") {
      if (!body.logId) {
        return NextResponse.json(
          { error: "Missing logId for public reply edit" },
          { status: 400 },
        );
      }
      const { data: log } = await supabase
        .from("automation_logs")
        .select("comment_id")
        .eq("id", body.logId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!log?.comment_id) {
        return NextResponse.json(
          { error: "Parent comment not found for this reply" },
          { status: 404 },
        );
      }

      const result = await replaceCommentReply(
        log.comment_id,
        body.commentId,
        message,
        account.access_token,
      );
      if (!result.ok || !result.id) {
        return NextResponse.json(
          { error: result.error || "Failed to update reply" },
          { status: 502 },
        );
      }
      newId = result.id;

      await supabase
        .from("automation_logs")
        .update({ public_reply_text: message, public_reply_id: newId })
        .eq("id", body.logId)
        .eq("user_id", user.id);
    } else {
      let mediaId = body.mediaId ?? null;
      if (!mediaId && body.logId) {
        const { data: log } = await supabase
          .from("automation_logs")
          .select("automation_id")
          .eq("id", body.logId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (log?.automation_id) {
          const { data: auto } = await supabase
            .from("automations")
            .select("ig_media_id")
            .eq("id", log.automation_id)
            .eq("user_id", user.id)
            .maybeSingle();
          mediaId = auto?.ig_media_id ?? null;
        }
      }
      if (!mediaId) {
        return NextResponse.json(
          { error: "Missing mediaId to update comment" },
          { status: 400 },
        );
      }

      const result = await replaceMediaComment(
        mediaId,
        body.commentId,
        message,
        account.access_token,
      );
      if (!result.ok || !result.id) {
        return NextResponse.json(
          { error: result.error || "Failed to update comment" },
          { status: 502 },
        );
      }
      newId = result.id;

      if (body.logId) {
        await supabase
          .from("automation_logs")
          .update({ comment_text: message, comment_id: newId })
          .eq("id", body.logId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("automation_logs")
          .update({ comment_text: message, comment_id: newId })
          .eq("comment_id", body.commentId)
          .eq("user_id", user.id)
          .eq("source", "manual");
      }
    }

    return NextResponse.json({ ok: true, commentId: newId });
  }

  // Create new top-level comment
  if (!body.mediaId) {
    return NextResponse.json(
      { error: "Missing mediaId or commentId" },
      { status: 400 },
    );
  }

  const result = await createMediaComment(
    body.mediaId,
    message,
    account.access_token,
  );
  if (!result.ok || !result.id) {
    return NextResponse.json(
      { error: result.error || "Failed to post comment" },
      { status: 502 },
    );
  }

  const { data: log, error: logError } = await supabase
    .from("automation_logs")
    .insert({
      automation_id: body.automationId ?? null,
      account_id: accountId,
      user_id: user.id,
      comment_id: result.id,
      commenter_id: null,
      commenter_username: account.username,
      comment_text: message,
      status: "sent",
      source: "manual",
    })
    .select(
      "id, automation_id, account_id, comment_id, commenter_username, comment_text, dm_text, public_reply_text, public_reply_id, status, error, source, created_at, fb_page_id",
    )
    .single();

  if (logError) {
    console.error("[comments] failed to log manual comment", logError);
  }

  return NextResponse.json({ ok: true, id: result.id, log: log ?? null });
}

/** DELETE — remove our comment and update the Activity log. */
export async function DELETE(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  const commentId = request.nextUrl.searchParams.get("commentId");
  const logId = request.nextUrl.searchParams.get("logId");
  const target =
    request.nextUrl.searchParams.get("target") === "public_reply"
      ? "public_reply"
      : "comment";

  if (!accountId || !commentId) {
    return NextResponse.json(
      { error: "Missing accountId or commentId" },
      { status: 400 },
    );
  }

  const account = await getOwnedAccount(accountId, user.id);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const result = await deleteComment(commentId, account.access_token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Failed to delete comment" },
      { status: 502 },
    );
  }

  if (target === "public_reply") {
    const q = supabase
      .from("automation_logs")
      .update({ public_reply_text: null, public_reply_id: null })
      .eq("user_id", user.id);
    if (logId) {
      await q.eq("id", logId);
    } else {
      await q.eq("public_reply_id", commentId);
    }
  } else if (logId) {
    await supabase
      .from("automation_logs")
      .delete()
      .eq("id", logId)
      .eq("user_id", user.id)
      .eq("source", "manual");
  } else {
    await supabase
      .from("automation_logs")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", user.id)
      .eq("source", "manual");
  }

  return NextResponse.json({ ok: true });
}
