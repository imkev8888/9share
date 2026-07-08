import { NextResponse, type NextRequest } from "next/server";
import { getPages, subscribePageToWebhooks } from "@/lib/facebook";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirms the Pages the user picked on the "Choose your Pages" screen.
 * POST { pageIds: string[] } — stores each Page token and subscribes the
 * Page to "feed" webhooks so comment events start flowing.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userToken = request.cookies.get("fb_user_token")?.value;
  if (!userToken) {
    return NextResponse.json(
      { error: "Facebook session expired. Please connect again." },
      { status: 400 },
    );
  }

  let pageIds: string[];
  try {
    const body = await request.json();
    pageIds = Array.isArray(body?.pageIds) ? body.pageIds.map(String) : [];
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (pageIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one Page." },
      { status: 400 },
    );
  }

  try {
    // Re-fetch the managed Pages server-side — never trust tokens from the
    // client, only the ids of Pages the user chose.
    const pages = await getPages(userToken);
    const wanted = new Set(pageIds);
    const selected = pages.filter((p) => wanted.has(p.id));

    if (selected.length === 0) {
      return NextResponse.json(
        { error: "None of the selected Pages were found on your account." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const errors: string[] = [];
    let connected = 0;

    for (const page of selected) {
      try {
        // Install the app on the Page so "feed" webhooks start arriving.
        await subscribePageToWebhooks(page.id, page.access_token);

        const { error: upsertError } = await admin
          .from("facebook_pages")
          .upsert(
            {
              user_id: user.id,
              page_id: page.id,
              page_name: page.name,
              picture_url: page.picture_url ?? null,
              page_access_token: page.access_token,
            },
            { onConflict: "page_id" },
          );
        if (upsertError) throw new Error(upsertError.message);
        connected += 1;
      } catch (e) {
        errors.push(
          `${page.name}: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    }

    if (connected === 0) {
      return NextResponse.json(
        { error: errors[0] ?? "Could not connect the selected Pages." },
        { status: 502 },
      );
    }

    const res = NextResponse.json({
      ok: true,
      connected,
      failed: errors.length,
    });
    // The user token has served its purpose.
    res.cookies.delete("fb_user_token");
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
