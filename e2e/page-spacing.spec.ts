import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BETTING_ADMIN_EMAIL,
  BETTING_MEMBER_EMAIL,
  BETTING_PASSWORD,
} from "../scripts/betting-fixture";
import { seedFixture, signIn } from "./fixtures";

const WIDTHS = [320, 375, 768, 1024, 1440, 1920, 2560, 3440, 3840];
const SCREENSHOT_WIDTHS = new Set([375, 1440, 2560, 3440]);
const SCREENSHOT_DIR = join(process.cwd(), "reports", "page-spacing", "after");

function gutterFor(width: number): number {
  if (width >= 1024) return 32;
  if (width >= 640) return 24;
  return 16;
}

async function expectFluidLayout(page: Page, width: number, family: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const rootStyles = getComputedStyle(root);
    const containers = Array.from(document.querySelectorAll<HTMLElement>(".page-container"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement;
        const parentRect = parent?.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return {
          width: rect.width,
          left: rect.left,
          parentWidth: parent?.clientWidth ?? 0,
          parentLeft: parentRect?.left ?? 0,
          parentBorder: parent?.clientLeft ?? 0,
          minWidth: styles.minWidth,
          maxWidth: styles.maxWidth,
          paddingLeft: Number.parseFloat(styles.paddingLeft),
          paddingRight: Number.parseFloat(styles.paddingRight),
        };
      });
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      gutter: Number.parseFloat(rootStyles.getPropertyValue("--page-gutter")),
      containers,
    };
  });

  expect(geometry.gutter).toBe(gutterFor(width));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.containers.length).toBeGreaterThan(0);
  for (const container of geometry.containers) {
    expect(container.minWidth).toBe("0px");
    expect(container.maxWidth).toBe("none");
    expect(Math.abs(container.width - container.parentWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(container.left - (container.parentLeft + container.parentBorder))).toBeLessThanOrEqual(2);
    expect(container.paddingLeft).toBeGreaterThanOrEqual(gutterFor(width));
    expect(container.paddingRight).toBeGreaterThanOrEqual(gutterFor(width));
  }

  if (SCREENSHOT_WIDTHS.has(width)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${family}-${width}.png`),
      animations: "disabled",
    });
  }
}

async function checkAllWidths(page: Page, family: string): Promise<void> {
  for (const width of WIDTHS) await expectFluidLayout(page, width, family);
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test("home, directories, and both Cards themes stay fluid from mobile to ultrawide", async ({ page }) => {
  test.setTimeout(180_000);
  for (const route of [
    { family: "home", path: "/" },
    { family: "players", path: "/players" },
    { family: "teams-academy", path: "/academy/teams" },
    { family: "cards", path: "/cards/browse" },
    { family: "cards-academy", path: "/academy/cards/browse" },
  ]) {
    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await checkAllWidths(page, route.family);
  }

  await page.setViewportSize({ width: 375, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const cardsMenu = page.getByRole("button", { name: "Cards menu" });
  await cardsMenu.click();
  await expect(cardsMenu).toHaveAttribute("aria-expanded", "true");
  await expectNoDocumentOverflow(page);

  await page.getByRole("button", { name: "Search the site" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoDocumentOverflow(page);
}
);

test("betting, draft, and staff workspaces keep the same fluid page edges", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);

  seedFixture("betting");
  const bettingContext = await browser.newContext({ baseURL });
  const bettingPage = await bettingContext.newPage();
  try {
    await signIn(bettingPage, BETTING_MEMBER_EMAIL, BETTING_PASSWORD, "/betting");
    await checkAllWidths(bettingPage, "betting");
  } finally {
    await bettingContext.close();
  }

  seedFixture("draft");
  const draftId = readFileSync("e2e/.draft-id", "utf8").trim();
  const draftContext = await browser.newContext({ baseURL });
  const draftPage = await draftContext.newPage();
  try {
    await signIn(draftPage, "e2e-cap1@test.local", "password123", `/draft/${draftId}`);
    await checkAllWidths(draftPage, "draft");
  } finally {
    await draftContext.close();
  }

  const adminContext = await browser.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, BETTING_ADMIN_EMAIL, BETTING_PASSWORD, "/admin/betting");
    await expect(adminPage.getByRole("heading", { name: /Betting — Markets/ })).toBeVisible();
    await checkAllWidths(adminPage, "admin");
  } finally {
    await adminContext.close();
  }
});
