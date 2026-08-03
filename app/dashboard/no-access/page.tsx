import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="glass-strong mx-auto max-w-lg rounded-3xl p-10 text-center">
      <h1 className="text-xl font-extrabold text-ink">No access yet</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Your account doesn&apos;t have a product permission. Ask an admin
        (kev@boostteamhk.com) to grant DM Automation or Cross Post access.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white"
      >
        Back to login
      </Link>
    </div>
  );
}
