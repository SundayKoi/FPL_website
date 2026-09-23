import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MAP_FIXTURE_KEYS } from "../src/lib/expeditions/mapFixtures";

// The living map (spec §6) in every moment of a run on the Legend Hunt and
// the Mythic route, and a fresh run on every other route, at a laptop and a
// phone width.
//
// No sign-in and no seeding: playwright.config.ts starts `npm run dev`, so
// NODE_ENV is development and /admin/expedition-map draws the charts from
// fixtures (src/lib/expeditions/mapFixtures.ts) without a staff profile.
// The screenshots land in e2e/screenshots/expedition-map/ (gitignored) for
// a person to review; this spec asserts what a browser can measure — the
// phone's words at a readable size, the open fork's name clear of pins, a
// dread mark big enough to see, a tapped pin read out under the chart.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test e2e/expedition-map.spec.ts

const OUT = "e2e/screenshots/expedition-map";
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

// A pre-installed Chromium that is not the revision this Playwright pins
// (a sandbox image, say) is reached through its `chromium` link; a normal
// `npx playwright install` has no such link and uses its own.
const preinstalled = process.env.PLAYWRIGHT_BROWSERS_PATH ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
if (preinstalled && existsSync(preinstalled)) test.use({ launchOptions: { executablePath: preinstalled } });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Open one chart and wait until the browser has drawn it in its own frame. */
async function openChart(page: Page, path: string, layout: "wide" | "phone") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  await page.goto(path);
  const map = page.getByTestId("living-map").first();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-settled", "true");
  await expect(map).toHaveAttribute("data-layout", layout);
  await page.evaluate(() => document.fonts.ready);
  // The dev server's badge and the site's floating button sit over corners.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } a[aria-label='Support the devs'] { visibility: hidden !important; }" });
  return { map, errors };
}

/** Every piece of text on the chart and under it, with its rendered size. */
async function textSizes(page: Page) {
  return page.getByTestId("living-map").first().evaluate((map) => {
    const sizes: { text: string; px: number }[] = [];
    const walker = document.createTreeWalker(map, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      const parent = node.parentElement;
      if (!text || !parent || !parent.checkVisibility()) continue;
      sizes.push({ text: text.slice(0, 30), px: parseFloat(getComputedStyle(parent).fontSize) });
    }
    return sizes;
  });
}

/** Whether any journal pin's head covers the open fork's name. */
async function pinsOnOpenLabel(page: Page) {
  return page.getByTestId("living-map").first().evaluate((map) => {
    const label = map.querySelector("[data-open='true'][data-testid^='map-label-']");
    if (!label) return [];
    const a = label.getBoundingClientRect();
    return [...map.querySelectorAll<HTMLElement>("[data-testid^='map-pin-']")]
      .filter((pin) => {
        const b = pin.getBoundingClientRect();
        return b.right > a.left + 1 && b.left < a.right - 1 && b.bottom > a.top + 1 && b.top < a.bottom - 1;
      })
      .map((pin) => pin.dataset.testid);
  });
}

for (const { state, tier } of MAP_FIXTURE_KEYS) {
  for (const viewport of VIEWPORTS) {
    const layout = viewport.width < 640 ? "phone" : "wide";
    test(`expedition map — ${state} ${tier} at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { map, errors } = await openChart(page, `/admin/expedition-map?state=${state}&tier=${tier}`, layout);
      // Let the squad finish its glide to the clock (a 600ms transition).
      await page.waitForTimeout(700);
      await page.getByTestId("map-preview").screenshot({ path: `${OUT}/${state}-${tier}-${viewport.width}.png` });

      expect(errors, "errors on the page").toEqual([]);
      expect(await map.locator("svg").count(), "one inline SVG").toBe(1);
      expect(await pinsOnOpenLabel(page), "pins over the open fork's name").toEqual([]);

      if (layout === "phone") {
        const small = (await textSizes(page)).filter((entry) => entry.px < 11);
        expect(small, "text under 11px at 390").toEqual([]);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, "horizontal page scroll at 390px").toBeLessThanOrEqual(390);
        // The open fork is always named on a phone.
        if (state === "fork") await expect(map.locator("[data-open='true'][data-testid^='map-label-']")).toBeVisible();
        // A dread mark is big enough to see.
        for (const dread of await map.locator("[data-dread='true']").all()) {
          const box = (await dread.boundingBox())!;
          expect(Math.max(box.width, box.height), "dread mark size at 390").toBeGreaterThanOrEqual(10);
        }
        // A tap on a pin reads its line out under the chart.
        const pins = map.locator("[data-testid^='map-pin-']");
        if ((await pins.count()) > 1) {
          const pin = pins.first();
          const line = Number((await pin.getAttribute("data-testid"))!.replace("map-pin-", ""));
          const box = (await pin.boundingBox())!;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await expect(map.getByTestId("map-caption").locator("[data-line]")).toHaveAttribute("data-line", String(line));
        }
      }
    });
  }
}

test("expedition map — held still for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  const { map } = await openChart(page, "/admin/expedition-map?state=storm&tier=legend", "wide");
  await expect(map).toHaveAttribute("data-reduced-motion", "true");
  const animated = await map.evaluate((node) =>
    [...node.querySelectorAll(".map-rain, .map-pulse, .map-drift")].map((el) => getComputedStyle(el).animationName).filter((name) => name !== "none"),
  );
  expect(animated, "animations left running").toEqual([]);
  await page.getByTestId("map-preview").screenshot({ path: `${OUT}/storm-legend-1280-still.png` });
});

test("expedition map — the index of every chart", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/expedition-map");
  await expect(page.getByTestId("map-index")).toBeVisible();
  await expect(page.getByTestId("living-map")).toHaveCount(MAP_FIXTURE_KEYS.length);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } a[aria-label='Support the devs'] { visibility: hidden !important; }" });
  await page.screenshot({ path: `${OUT}/index-1280.png`, fullPage: true });
});
