import { FacebookIcon, InstagramIcon } from "@/components/icons";

/** Small pill identifying which channel an automation or log belongs to. */
export function PlatformBadge({
  platform,
  labelled = false,
}: {
  platform: string | null | undefined;
  labelled?: boolean;
}) {
  const isFacebook = platform === "facebook";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        isFacebook ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
      }`}
      title={isFacebook ? "Facebook" : "Instagram"}
    >
      {isFacebook ? (
        <FacebookIcon className="h-3 w-3" />
      ) : (
        <InstagramIcon className="h-3 w-3" />
      )}
      {labelled && (isFacebook ? "Facebook" : "Instagram")}
    </span>
  );
}
