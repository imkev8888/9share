import {
  chooseAutomation,
  chooseCrossPost,
} from "@/app/dashboard/actions-product";
import { BoltIcon, SendIcon } from "@/components/icons";

export function ProductPicker({
  automation,
  crossPost,
}: {
  automation: boolean;
  crossPost: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Choose a workspace
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          You have access to more than one 9share product. Pick where to work.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {automation && (
          <form action={chooseAutomation}>
            <button
              type="submit"
              className="glass-strong flex h-full w-full flex-col items-start gap-3 rounded-3xl p-6 text-left transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
            >
              <span className="inline-flex rounded-2xl bg-brand-50 p-3 text-brand-600">
                <BoltIcon className="h-7 w-7" />
              </span>
              <span className="text-lg font-bold text-ink">DM Automation</span>
              <span className="text-sm text-ink-soft">
                Comment-to-DM campaigns, tracking, and activity for Instagram
                and Facebook.
              </span>
            </button>
          </form>
        )}

        {crossPost && (
          <form action={chooseCrossPost}>
            <button
              type="submit"
              className="glass-strong flex h-full w-full flex-col items-start gap-3 rounded-3xl p-6 text-left transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
            >
              <span className="inline-flex rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                <SendIcon className="h-7 w-7" />
              </span>
              <span className="text-lg font-bold text-ink">Cross Post</span>
              <span className="text-sm text-ink-soft">
                Compose once and sync to Facebook, Instagram, Threads, LinkedIn,
                RedNote, and WeChat.
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
