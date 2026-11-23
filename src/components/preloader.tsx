"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "preloader_seen";
/** Long enough for the mark to finish drawing on a first visit. */
const MIN_VISIBLE_MS = 1150;
const FADE_MS = 450;

const wasSeen = () => {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};

/**
 * Opening screen, once per visit. It is part of the server's HTML, so it paints
 * first; CSS alone also removes it after a few seconds, so a script that fails
 * to load can never leave it covering the site.
 */
export function Preloader({ name, tagline }: { name: string; tagline: string }) {
  const [state, setState] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    const wait = wasSeen() ? 0 : Math.max(MIN_VISIBLE_MS - performance.now(), 0);
    const leave = window.setTimeout(() => setState("leaving"), wait);
    const remove = window.setTimeout(() => setState("gone"), wait + FADE_MS);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Without storage the screen simply shows again next time.
    }
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);

  if (state === "gone") return null;

  return (
    <div className="preloader" data-state={state} role="status" aria-label={name}>
      <div className="preloader-pattern" aria-hidden />
      <div className="preloader-center">
        <svg viewBox="0 0 120 120" className="preloader-mark" fill="none" aria-hidden>
          {/* Eight-pointed star, then the arch of the logo inside it. */}
          <path
            className="preloader-star"
            pathLength={1}
            d="M60 8 75.2 23.3h21.5v21.5L112 60 96.7 75.2v21.5H75.2L60 112 44.8 96.7H23.3V75.2L8 60l15.3-15.2V23.3h21.5L60 8Z"
          />
          <path className="preloader-arch" pathLength={1} d="M38 84V56l22-17 22 17v28H38Z" />
          <path className="preloader-door" pathLength={1} d="M51 84V70a9 9 0 0 1 18 0v14" />
        </svg>
        <p className="preloader-name">{name}</p>
        <p className="preloader-tagline">{tagline}</p>
        <span className="preloader-line" aria-hidden />
      </div>
    </div>
  );
}
