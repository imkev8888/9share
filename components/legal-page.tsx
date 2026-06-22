import Link from "next/link";
import { Logo } from "@/components/icons";

export function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
        <Logo className="h-10 w-10" />
        <span className="text-2xl font-extrabold tracking-tight text-ink">
          9share
        </span>
      </Link>

      <article className="glass-strong rounded-3xl p-6 sm:p-9">
        <p className="mb-2 text-sm font-semibold text-brand-600">
          Last updated: June 23, 2026
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">{description}</p>

        <div className="mt-8 space-y-7 text-sm leading-6 text-ink-soft">
          {children}
        </div>
      </article>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-ink">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
