import Link from "next/link";
import {
  Logo,
  InstagramIcon,
  MessageIcon,
  BoltIcon,
  TargetIcon,
  ShieldIcon,
  ChartIcon,
  ArrowRightIcon,
  CheckIcon,
} from "@/components/icons";

const features = [
  {
    icon: BoltIcon,
    title: "Instant comment-to-DM",
    body: "The moment someone comments on your post or reel, 9share slides into their DMs with your message — in seconds, automatically.",
  },
  {
    icon: TargetIcon,
    title: "A campaign per post",
    body: "Every post, reel and video gets its own template. Run a different marketing campaign on each piece of content with zero overlap.",
  },
  {
    icon: MessageIcon,
    title: "Keyword triggers",
    body: 'Fire only when a comment contains a word like "PRICE" or "LINK" — or send to everyone who comments. Your call.',
  },
  {
    icon: ChartIcon,
    title: "Live delivery logs",
    body: "See every DM sent, skipped or failed in real time, with the commenter and the exact message that went out.",
  },
  {
    icon: ShieldIcon,
    title: "Official Instagram API",
    body: "Built on Instagram's official Login & Messaging API with signed webhooks. No passwords, no scraping, no bans.",
  },
  {
    icon: InstagramIcon,
    title: "One-click connect",
    body: "No tokens, no developer setup, no copy-pasting keys. Click connect, approve on Instagram, and you're live.",
  },
];

const steps = [
  { n: "1", t: "Connect Instagram", d: "Authorize your Business or Creator account in one click." },
  { n: "2", t: "Pick a post & write a DM", d: "Choose the post, set an optional keyword, write your template." },
  { n: "3", t: "We do the rest", d: "Comments roll in, DMs go out automatically. Watch the logs." },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Nav */}
      <header className="sticky top-4 z-50 mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-2xl px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span className="text-xl font-extrabold tracking-tight text-ink">
              9share
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/60 cursor-pointer"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="flex items-center gap-1.5 rounded-xl bg-[var(--color-cyan-cta)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] cursor-pointer"
            >
              Start free
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center md:pt-28">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 py-1.5 text-sm font-medium text-brand-700 backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Comment automation for Instagram
        </div>

        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-7xl">
          Turn every comment into a{" "}
          <span className="bg-gradient-to-r from-brand-500 to-[var(--color-cyan-cta)] bg-clip-text text-transparent">
            conversation
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-soft md:text-xl">
          9share auto-sends a DM the instant someone comments on your post,
          reel or video. Different campaign for every post — set it once, let it
          run.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login?mode=signup"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-cyan-cta)] px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-cyan-500/20 transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] cursor-pointer sm:w-auto"
          >
            <InstagramIcon className="h-5 w-5" />
            Connect Instagram free
          </Link>
          <Link
            href="#how"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-7 py-3.5 text-base font-bold text-ink transition-colors duration-200 hover:bg-white/80 cursor-pointer sm:w-auto"
          >
            See how it works
          </Link>
        </div>

        <p className="mt-4 text-sm text-ink-soft/80">
          No credit card · No developer setup · Official Instagram API
        </p>

        {/* Hero glass mockup */}
        <div className="glass-strong mx-auto mt-16 max-w-3xl rounded-3xl p-2">
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-6 text-left">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600" />
              <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm shadow-sm">
                <span className="font-semibold text-ink">@maria_g</span>
                <span className="ml-2 text-ink-soft">
                  Omg I need this 😍 PRICE?
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-brand-600">
              <BoltIcon className="h-4 w-4" />
              9share auto-replied in 1.2s
            </div>
            <div className="mt-4 flex justify-end">
              <div className="max-w-xs rounded-2xl rounded-br-sm bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)] px-4 py-2.5 text-sm text-white shadow-md">
                Hey @maria_g! 💌 Here&apos;s the link to grab yours with 20% off
                today: 9sha.re/spring 🌸
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Everything you need to sell in the DMs
          </h2>
          <p className="mt-3 text-ink-soft">
            Stop manually answering the same comment 200 times. Let 9share work
            around the clock.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="glass group rounded-2xl p-6 transition-colors duration-200 hover:bg-white/85"
            >
              <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)] p-2.5 text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Live in three steps
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="glass rounded-2xl p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink">{s.t}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="glass-strong relative overflow-hidden rounded-3xl px-8 py-14 text-center">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-400/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-cyan-400/30 blur-3xl" />
          <h2 className="relative text-3xl font-extrabold tracking-tight text-ink md:text-5xl">
            Ready to grow on autopilot?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-ink-soft">
            Connect your Instagram in one click and send your first automated DM
            in under two minutes.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-ink">
            {["Free to start", "No tokens to manage", "Cancel anytime"].map(
              (t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckIcon className="h-4 w-4 text-[var(--color-cyan-cta)]" />
                  {t}
                </span>
              ),
            )}
          </div>
          <Link
            href="/login?mode=signup"
            className="relative mt-8 inline-flex items-center gap-2 rounded-2xl bg-[var(--color-cyan-cta)] px-8 py-4 text-base font-bold text-white shadow-lg shadow-cyan-500/20 transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] cursor-pointer"
          >
            <InstagramIcon className="h-5 w-5" />
            Start free with Instagram
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/50 pt-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-bold text-ink">9share</span>
          </div>
          <p className="text-sm text-ink-soft">
            © {new Date().getFullYear()} 9share. Not affiliated with Instagram
            or Meta.
          </p>
        </div>
      </footer>
    </div>
  );
}
