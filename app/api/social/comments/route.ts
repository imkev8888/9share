import { NextResponse, type NextRequest } from "next/server";
import {
  createMediaComment,
  deleteComment,
  replaceMediaComment,
} from "@/lib/instagram";
import {
  createFacebookComment,
  deleteFacebookComment,
  editFacebookComment,
} from "@/lib/facebook";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function loadAutomation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  automationId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("automations")
    .select("id, platform, ig_media_id, account_id, fb_page_id, user_id")
    .eq("id", automationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * POST — create a top-level comment on an IG media or FB Page post.
 * Body: { automationId, message }
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { automationId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!body.automationId || !message) {
    return NextResponse.json(
      { error: "Missing automationId or message" },
      { status: 400 },
    );
  }

  const automation = await loadAutomation(supabase, body.automationId, user.id);
  if (!automation?.ig_media_id) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const platform = automation.platform === "facebook" ? "facebook" : "instagram";

  if (platform === "instagram") {
    if (!automation.account_id) {
      return NextResponse.json({ error: "No Instagram account" }, { status: 400 });
    }
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("access_token, username")
      .eq("id", automation.account_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await createMediaComment(
      automation.ig_media_id,
      message,
      account.access_token,
    );
    if (!result.ok || !result.id) {
      return NextResponse.json(
        { error: result.error || "Failed to post comment" },
        { status: 502 },
      );
    }

    const { data: log } = await supabase
      .from("automation_logs")
      .insert({
        automation_id: automation.id,
        account_id: automation.account_id,
        user_id: user.id,
        comment_id: result.id,
        commenter_username: account.username,
        comment_text: message,
        status: "sent",
        source: "manual",
      })
      .select(
        "id, automation_id, comment_id, commenter_username, comment_text, status, error, source, created_at",
      )
      .single();

    return NextResponse.json({ ok: true, id: result.id, log, platform });
  }

  if (!automation.fb_page_id) {
    return NextResponse.json({ error: "No Facebook Page" }, { status: 400 });
  }
  const { data: page } = await supabase
    .from("facebook_pages")
    .select("id, page_access_token, page_name")
    .eq("id", automation.fb_page_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const result = await createFacebookComment(
    automation.ig_media_id,
    message,
    page.page_access_token,
  );
  if (!result.ok || !result.id) {
    return NextResponse.json(
      { error: result.error || "Failed to post comment" },
      { status: 502 },
    );
  }

  const { data: log } = await supabase
    .from("automation_logs")
    .insert({
      automation_id: automation.id,
      fb_page_id: page.id,
      user_id: user.id,
      comment_id: result.id,
      commenter_username: page.page_name,
      comment_text: message,
      status: "sent",
      source: "manual",
    })
    .select(
      "id, automation_id, comment_id, commenter_username, comment_text, status, error, source, created_at",
    )
    .single();

  return NextResponse.json({ ok: true, id: result.id, log, platform });
}

/**
 * PATCH — edit a comment we posted.
 * Body: { automationId, commentId, message, logId? }
 */
export async function PATCH(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    automationId?: string;
    commentId?: string;
    message?: string;
    logId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!body.automationId || !body.commentId || !message) {
    return NextResponse.json(
      { error: "Missing automationId, commentId, or message" },
      { status: 400 },
    );
  }

  const automation = await loadAutomation(supabase, body.automationId, user.id);
  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const platform = automation.platform === "facebook" ? "facebook" : "instagram";

  let newCommentId = body.commentId;

  if (platform === "instagram") {
    if (!automation.account_id || !automation.ig_media_id) {
      return NextResponse.json({ error: "No Instagram account" }, { status: 400 });
    }
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("access_token")
      .eq("id", automation.account_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // IG has no in-place edit — replace with a new comment.
    const result = await replaceMediaComment(
      automation.ig_media_id,
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
    newCommentId = result.id;
  } else {
    if (!automation.fb_page_id) {
      return NextResponse.json({ error: "No Facebook Page" }, { status: 400 });
    }
    const { data: page } = await supabase
      .from("facebook_pages")
      .select("page_access_token")
      .eq("id", automation.fb_page_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const result = await editFacebookComment(
      body.commentId,
      message,
      page.page_access_token,
    );
    if (!result.ok) {
      // Fallback: some Page configs reject message updates — replace instead.
      const created = await createFacebookComment(
        automation.ig_media_id!,
        message,
        page.page_access_token,
      );
      if (!created.ok || !created.id) {
        return NextResponse.json(
          { error: result.error || created.error || "Failed to update comment" },
          { status: 502 },
        );
      }
      const deleted = await deleteFacebookComment(
        body.commentId,
        page.page_access_token,
      );
      if (!deleted.ok) {
        await deleteFacebookComment(created.id, page.page_access_token);
        return NextResponse.json(
          { error: deleted.error || "Failed to replace comment" },
          { status: 502 },
        );
      }
      newCommentId = created.id;
    }
  }

  const q = supabase
    .from("automation_logs")
    .update({ comment_text: message, comment_id: newCommentId })
    .eq("user_id", user.id)
    .eq("source", "manual");
  if (body.logId) {
    await q.eq("id", body.logId);
  } else {
    await q.eq("comment_id", body.commentId);
  }

  return NextResponse.json({ ok: true, commentId: newCommentId });
}

/**
 * DELETE — remove a comment we posted.
 * Query: automationId, commentId, logId?
 */
export async function DELETE(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const automationId = request.nextUrl.searchParams.get("automationId");
  const commentId = request.nextUrl.searchParams.get("commentId");
  const logId = request.nextUrl.searchParams.get("logId");

  if (!automationId || !commentId) {
    return NextResponse.json(
      { error: "Missing automationId or commentId" },
      { status: 400 },
    );
  }

  const automation = await loadAutomation(supabase, automationId, user.id);
  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const platform = automation.platform === "facebook" ? "facebook" : "instagram";

  if (platform === "instagram") {
    if (!automation.account_id) {
      return NextResponse.json({ error: "No Instagram account" }, { status: 400 });
    }
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("access_token")
      .eq("id", automation.account_id)
      .eq("user_id", user.id)
      .maybeSingle();
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
  } else {
    if (!automation.fb_page_id) {
      return NextResponse.json({ error: "No Facebook Page" }, { status: 400 });
    }
    const { data: page } = await supabase
      .from("facebook_pages")
      .select("page_access_token")
      .eq("id", automation.fb_page_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const result = await deleteFacebookComment(
      commentId,
      page.page_access_token,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to delete comment" },
        { status: 502 },
      );
    }
  }

  if (logId) {
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
