import Link from "next/link";
import { cookies } from "next/headers";
import { requireAnyProductAccess } from "@/lib/product-gate";
import { getPages } from "@/lib/facebook";
import { FacebookPagePicker } from "@/components/facebook-page-picker";
import { FacebookIcon } from "@/components/icons";

/**
 * "Choose your Pages" — shown right after Facebook OAuth. One Facebook
 * account often manages several Pages, so the user picks which ones to
 * connect instead of us auto-connecting everything.
 */
export default async function ChooseFacebookPagesPage() {
  const { supabase, user } = await requireAnyProductAccess();

  const cookieStore = await cookies();
  const userToken = cookieStore.get("fb_user_token")?.value;

  if (!userToken) {
    return (
      <ExpiredState message="Your Facebook session expired. Please start the connection again." />
    );
  }

  let pages;
  try {
    pages = await getPages(userToken);
  } catch (e) {
    return (
      <ExpiredState
        message={`Couldn't load your Facebook Pages: ${
          e instanceof Error ? e.message : "unknown error"
        }`}
      />
    );
  }

  // Mark Pages that are already connected so they can't be double-picked.
  const { data: existing } = await supabase
    .from("facebook_pages")
    .select("page_id")
    .eq("user_id", user.id);
  const connectedIds = new Set((existing ?? []).map((p) => p.page_id));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 inline-flex rounded-2xl bg-[#1877F2] p-3 text-white">
          <FacebookIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Choose your Page
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Pick the Facebook Page you want to automate.
        </p>
      </div>

      {pages.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <h2 className="text-lg font-bold text-ink">No Pages found</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            This Facebook account doesn&apos;t manage any Pages, or you
            didn&apos;t grant access to them during login.
          </p>
          <Link
            href="/dashboard/channels"
            className="mt-5 inline-flex items-center rounded-2xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-600 transition-colors duration-200 hover:bg-brand-50 cursor-pointer"
          >
            Back to Channels
          </Link>
        </div>
      ) : (
        <FacebookPagePicker
          pages={pages.map((p) => ({
            id: p.id,
            name: p.name,
            pictureUrl: p.picture_url ?? null,
            alreadyConnected: connectedIds.has(p.id),
          }))}
        />
      )}
    </div>
  );
}

function ExpiredState({ message }: { message: string }) {
  return (
    <div className="glass-strong mx-auto max-w-2xl rounded-3xl p-10 text-center">
      <h2 className="text-lg font-bold text-ink">Connection expired</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{message}</p>
      <Link
        href="/api/facebook/connect"
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#1877F2] px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition-opacity duration-200 hover:opacity-90 cursor-pointer"
      >
        <FacebookIcon className="h-5 w-5" />
        Connect Facebook Page
      </Link>
    </div>
  );
}
