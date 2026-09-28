import { DEFAULT_TEAM_BANNER_COLOR, normalizeBannerColor } from "./bannerColor";
import type { TeamIdentity } from "./identity";

export function teamPresentation(name: string | null, identity?: TeamIdentity) {
  const displayName = name?.trim() || "TBD";
  const fill = normalizeBannerColor(identity?.bannerColor ?? DEFAULT_TEAM_BANNER_COLOR);
  const fallback = displayName === "TBD" ? "TBD" : identity?.abbreviation?.trim() || displayName.slice(0, 3).toUpperCase();
  const rgb = [1, 3, 5].map((start) => {
    const value = parseInt(fill.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return { name: displayName, fill, foreground: luminance > 0.179 ? "#17112f" : "#ffffff", fallback };
}
