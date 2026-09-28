"use client";

import { useState } from "react";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamPresentation } from "@/lib/teams/presentation";

export default function TeamLogo({ name, identity, className, fallbackClassName }: {
  name: string | null;
  identity?: TeamIdentity;
  className: string;
  fallbackClassName: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = identity?.imageUrl;
  if (url && url !== failedUrl) {
    // The source is the team's original upload; CSS only contains it in the reserved box.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={240} height={240} className={className} onError={() => setFailedUrl(url)} />;
  }
  return <span aria-hidden="true" className={fallbackClassName}>{teamPresentation(name, identity).fallback}</span>;
}
