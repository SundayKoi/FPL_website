import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The expedition page as three collectors first see it — brand new,
// mid-game with a fork open, a veteran — at a laptop and a phone width.
//
// No sign-in and no seeding: playwright.config.ts starts `npm run dev`, so
// NODE_ENV is development and /admin/expedition-board renders the board
// from fixtures (src/lib/expeditions/boardFixtures.ts) without a staff
// profile. The screenshots land in e2e/screenshots/expedition-board/
// (gitignored) for a person to walk the design's §10.4 checklist on; this
// spec asserts the parts of it a browser can measure.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test e2e/expedition-board.spec.ts

const OUT = "e2e/screenshots/expedition-board";
const PERSONAS = ["new", "mid", "veteran"] as const;
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

/** Every visible control on the board smaller than a 44×44 tap target. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.getByTestId("expedition-board").evaluate((board) => {
    const controls = board.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])");
    const small: string[] = [];
    for (const control of controls) {
      if (!control.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
      const box = control.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 44 || box.height < 44) {
        const name = control.getAttribute("aria-label") ?? control.textContent?.trim().slice(0, 40) ?? control.tagName;
        small.push(`${name} (${Math.round(box.width)}×${Math.round(box.height)})`);
      }
    }
    return small;
  });
}

/** Every visible disabled control with no reason on screen: a
 *  [data-reason] inside it, or one its aria-describedby points at. A
 *  `title` does not count — a phone has no hover. */
async function silentDisabled(page: Page): Promise<string[]> {
  return page.getByTestId("expedition-board").evaluate((board) => {
    const seen = (node: Element | null) => node instanceof HTMLElement && node.checkVisibility() && (node.textContent ?? "").trim().length > 0;
    const silent: string[] = [];
    for (const control of board.querySelectorAll<HTMLElement>("button:disabled, input:disabled, select:disabled")) {
      if (!control.checkVisibility()) continue;
      const inside = control.querySelector("[data-reason]");
      const described = (control.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .filter((node) => node?.hasAttribute("data-reason"));
      if (!seen(inside) && !described.some(seen)) silent.push(control.getAttribute("aria-label") ?? control.textContent?.trim() ?? control.tagName);
    }
    return silent;
  });
}

for (const persona of PERSONAS) {
  for (const viewport of VIEWPORTS) {
    test(`expedition board — ${persona} at ${viewport.width}`, async ({ page }) => {
      // A hydration mismatch or a render error fails the run, not just the
      // console: the board has to come up clean for the screenshots to mean
      // anything.
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
      await page.setViewportSize(viewport);
      await page.goto(`/admin/expedition-board?persona=${persona}`);
      await expect(page.getByTestId("expedition-board")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      // The dev server's own badge sits over the board's bottom-left corner.
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      // What the collector sees before scrolling, then the whole page.
      await page.screenshot({ path: `${OUT}/${persona}-${viewport.width}.png` });
      await page.screenshot({ path: `${OUT}/${persona}-${viewport.width}-full.png`, fullPage: true });

      expect(errors, "errors on the page").toEqual([]);
      expect(await silentDisabled(page), "disabled controls with no visible reason").toEqual([]);

      if (viewport.width === 390) {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, "horizontal page scroll at 390px").toBeLessThanOrEqual(390);
        expect(await smallTargets(page), "tap targets under 44×44 at 390px").toEqual([]);

        // A Term's definition opens inside the screen, not past its edge.
        const fragments = page.getByTestId("fragments");
        await fragments.scrollIntoViewIfNeeded();
        await fragments.click();
        const note = page.locator(`[id="${await fragments.getAttribute("aria-controls")}"]`);
        await expect(note).toBeVisible();
        const box = (await note.boundingBox())!;
        expect(box.x, "definition's left edge").toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, "definition's right edge").toBeLessThanOrEqual(390);
        await page.keyboard.press("Escape");
        await expect(note).toBeHidden();

        // Every drawer panel fits the phone too: the standings become rows,
        // the rulebook wraps.
        for (const tab of await page.getByTestId("more-tabs").getByRole("tab").all()) {
          await tab.click();
          const width = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(width, `horizontal scroll with the ${await tab.textContent()} tab open`).toBeLessThanOrEqual(390);
        }
        if (persona === "veteran") {
          await page.getByTestId("tab-standings").click();
          await page.getByTestId("more-drawer").screenshot({ path: `${OUT}/${persona}-${viewport.width}-standings.png` });
        }
      }
    });
  }
}
