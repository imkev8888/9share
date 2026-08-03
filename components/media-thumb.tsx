"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MediaThumbProps = {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  /** When the stored CDN URL expires, refresh via Graph. */
  accountId?: string | null;
  mediaId?: string | null;
};

function PlaceholderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/**
 * Social CDN URLs (Instagram/Facebook) expire and hostnames vary.
 * Plain <img> + optional on-demand refresh — never block the server render.
 */
export function MediaThumb({
  src,
  alt = "",
  className = "h-full w-full object-cover",
  fallbackClassName = "flex h-full w-full items-center justify-center bg-brand-100 text-brand-400",
  accountId,
  mediaId,
}: MediaThumbProps) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [showFallback, setShowFallback] = useState(!src);
  const triedRefresh = useRef(false);

  const refresh = useCallback(async () => {
    if (!accountId || !mediaId || triedRefresh.current) return false;
    triedRefresh.current = true;
    try {
      const res = await fetch(
        `/api/instagram/thumb?accountId=${encodeURIComponent(accountId)}&mediaId=${encodeURIComponent(mediaId)}`,
      );
      const data = await res.json();
      if (res.ok && data.url) {
        setUrl(data.url);
        setShowFallback(false);
        return true;
      }
    } catch {
      // fall through
    }
    setShowFallback(true);
    return false;
  }, [accountId, mediaId]);

  useEffect(() => {
    setUrl(src ?? null);
    setShowFallback(!src);
    triedRefresh.current = false;
    if (!src && accountId && mediaId) {
      void refresh();
    }
  }, [src, accountId, mediaId, refresh]);

  if (showFallback || !url) {
    return (
      <div className={fallbackClassName} aria-hidden>
        <PlaceholderIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        void (async () => {
          const ok = await refresh();
          if (!ok) setShowFallback(true);
        })();
      }}
    />
  );
}
