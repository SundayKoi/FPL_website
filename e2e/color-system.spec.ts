import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type RGB = { r: number; g: number; b: number };

function parseColor(value: string): RGB {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      r: Number.parseInt(hex[1].slice(0, 2), 16),
      g: Number.parseInt(hex[1].slice(2, 4), 16),
      b: Number.parseInt(hex[1].slice(4, 6), 16),
    };
  }

  const rgb = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
  if (!rgb) throw new Error(`Unsupported color: ${value}`);
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: RGB): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(foreground: RGB, background: RGB): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function readColors(page: Page, { controls = false }: { controls?: boolean } = {}) {
  const scope = page.locator("[data-league]").last();
  const main = page.getByRole("main");
  const statsLink = page.getByRole("link", { name: "Stats", exact: true });
  const theme = await scope.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      league: element.getAttribute("data-league"),
      canvas: styles.getPropertyValue("--color-canvas").trim(),
      surface: styles.getPropertyValue("--color-surface").trim(),
      muted: styles.getPropertyValue("--color-muted").trim(),
      borderStrong: styles.getPropertyValue("--color-border-strong").trim(),
      actionFill: styles.getPropertyValue("--color-action-fill").trim(),
      actionText: styles.getPropertyValue("--color-action-text").trim(),
      leagueAccent: styles.getPropertyValue("--color-league-accent").trim(),
    };
  });
  const pageStyles = await main.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      backgroundImage: styles.backgroundImage,
    };
  });
  const activeLink = (await statsLink.count()) > 0
    ? await statsLink.evaluate((element) => getComputedStyle(element).color)
    : null;
  const controlStyles = controls
    ? await Promise.all([
        page.getByRole("button", { name: "Sign in with Discord", exact: true }).evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          color: getComputedStyle(element).color,
        })),
        page.getByRole("textbox", { name: "email", exact: true }).evaluate((element) => ({
          border: getComputedStyle(element).borderTopColor,
        })),
      ])
    : null;

  return {
    ...theme,
    activeLink,
    buttonBackground: controlStyles?.[0].background ?? null,
    buttonText: controlStyles?.[0].color ?? null,
    inputBorder: controlStyles?.[1].border ?? null,
    pageBackground: pageStyles.background,
    pageBackgroundImage: pageStyles.backgroundImage,
  };
}

test("shared color roles resolve consistently across Premier and Academy", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("[data-league]").last()).toHaveAttribute("data-league", "premier");
  const login = await readColors(page, { controls: true });

  expect(login.league).toBe("premier");
  expect(login.buttonBackground).toBeTruthy();
  expect(login.buttonText).toBeTruthy();
  expect(login.inputBorder).toBeTruthy();
  expect(login.pageBackground).toBe("rgb(8, 13, 18)");
  expect(login.pageBackgroundImage).not.toContain("repeating");

  await page.goto("/stats");
  await expect(page.locator("[data-league]").last()).toHaveAttribute("data-league", "premier");
  const premier = await readColors(page);
  await page.goto("/academy/stats");
  await expect(page.locator("[data-league]").last()).toHaveAttribute("data-league", "academy");
  const academy = await readColors(page);

  expect(premier.league).toBe("premier");
  expect(academy.league).toBe("academy");
  expect(premier.leagueAccent).not.toBe(academy.leagueAccent);
  expect(premier.actionFill).toBe(academy.actionFill);
  expect(premier.actionText).toBe(academy.actionText);

  const canvas = parseColor(login.canvas);
  const surface = parseColor(login.surface);
  const muted = parseColor(login.muted);
  const strongBorder = parseColor(login.borderStrong);
  const actionFill = parseColor(login.actionFill);
  const actionText = parseColor(login.actionText);
  const activeLink = parseColor(premier.activeLink ?? "");
  const buttonBackground = parseColor(login.buttonBackground ?? "");
  const buttonText = parseColor(login.buttonText ?? "");
  const inputBorder = parseColor(login.inputBorder ?? "");
  const pageBackground = parseColor(login.pageBackground ?? "");

  expect(contrast(activeLink, canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(actionText, canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(buttonText, buttonBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(inputBorder, pageBackground)).toBeGreaterThanOrEqual(3);
  expect(contrast(strongBorder, surface)).toBeGreaterThanOrEqual(3);
  expect(contrast(actionFill, buttonText)).toBeGreaterThanOrEqual(4.5);
});
