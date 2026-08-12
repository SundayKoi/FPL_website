export const DEFAULT_TEAM_BANNER_COLOR = "#083344";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexBannerColor(value: string) {
  return HEX_COLOR_PATTERN.test(value);
}

export function normalizeBannerColor(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && isHexBannerColor(normalized) ? normalized : DEFAULT_TEAM_BANNER_COLOR;
}
