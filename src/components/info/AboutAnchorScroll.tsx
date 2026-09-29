"use client";

import { useEffect } from "react";

/** Scroll to a fragment after the streamed About page content is in the DOM. */
export default function AboutAnchorScroll() {
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment) return;

    let id = fragment;
    try {
      id = decodeURIComponent(fragment);
    } catch {
      // Keep the literal fragment when it contains invalid percent escapes.
    }

    let disposed = false;
    let animationFrame: number | undefined;
    const observer = new MutationObserver(scrollWhenReady);
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);

    function scrollWhenReady() {
      const target = document.getElementById(id);
      if (!target) return;

      observer.disconnect();
      window.clearTimeout(timeout);
      animationFrame = window.requestAnimationFrame(() => {
        if (!disposed) target.scrollIntoView({ block: "start" });
      });
    }

    scrollWhenReady();
    if (!document.getElementById(id)) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
