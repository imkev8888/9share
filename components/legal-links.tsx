import Link from "next/link";

export function LegalLinks() {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-soft">
      <Link href="/privacy-policy" className="hover:text-ink">
        Privacy Policy
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/terms-of-service" className="hover:text-ink">
        Terms of Service
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/user-data-deletion" className="hover:text-ink">
        User Data Deletion
      </Link>
    </nav>
  );
}
