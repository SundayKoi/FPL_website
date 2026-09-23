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

/** An element's own picture, without the site's floating "Support the
 *  devs" button: it is fixed to the viewport's corner, so an element
 *  screenshot scrolled under it would show it over the panel's text. */
async function panelShot(page: Page, testId: string, path: string) {
  const style = await page.addStyleTag({ content: "a[aria-label='Support the devs'] { visibility: hidden !important; }" });
  await page.getByTestId(testId).screenshot({ path });
  await style.evaluate((node) => (node as HTMLElement).remove());
}

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

      // A run card with fog on its road: the `?`s, the dread, and the
      // fragment that shows the rest in the map's corner.
      const fogged = { mid: 301, veteran: 502 } as const;
      if (persona !== "new") {
        const id = fogged[persona];
        const card = page.getByTestId(`run-${id}`);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('[data-known="false"]').first()).toBeAttached();
        await expect(page.getByTestId(`reveal-${id}`).getByRole("button", { name: /See the road ahead/ })).toBeEnabled();
        await panelShot(page, `run-${id}`, `${OUT}/${persona}-${viewport.width}-runcard.png`);
      }

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
        // the rulebook wraps, the camp's cards stack — and every panel
        // keeps the page's rules: 44px targets, a reason by every
        // disabled button.
        for (const tab of await page.getByTestId("more-tabs").getByRole("tab").all()) {
          await tab.click();
          const name = await tab.textContent();
          const width = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(width, `horizontal scroll with the ${name} tab open`).toBeLessThanOrEqual(390);
          expect(await smallTargets(page), `tap targets under 44×44 with the ${name} tab open`).toEqual([]);
          expect(await silentDisabled(page), `disabled controls with no visible reason on the ${name} tab`).toEqual([]);
        }
        if (persona === "veteran") {
          await page.getByTestId("tab-standings").click();
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-standings.png`);
          await page.getByTestId("tab-camp").click();
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-camp.png`);
          await page.getByTestId("tab-atlas").click();
          await expect(page.getByTestId("atlas")).toBeVisible();
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-atlas.png`);
          // The rulebook on a phone, scrolled to the edges: every title
          // grouped by kind, one kind opened to show its rows.
          await page.getByTestId("tab-rules").click();
          const edges = page.getByTestId("rule-edges");
          await expect(edges).toBeVisible();
          await edges.locator("summary").first().click();
          await edges.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
          const style = await page.addStyleTag({ content: "a[aria-label='Support the devs'] { visibility: hidden !important; }" });
          await page.screenshot({ path: `${OUT}/${persona}-${viewport.width}-rules.png` });
          await style.evaluate((node) => (node as HTMLElement).remove());
        }
      }

      if (persona !== "new") {
        // The This-week line's league goal opens its tab.
        await page.getByTestId("league-line").click();
        await expect(page.getByTestId("tab-league")).toHaveAttribute("aria-selected", "true");
        await expect(page.getByTestId("league-goal")).toBeVisible();
        expect(await silentDisabled(page), "disabled controls with no visible reason on the League tab").toEqual([]);
        if (persona === "veteran" && viewport.width === 1280) {
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-league.png`);
          await page.getByTestId("tab-camp").click();
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-camp.png`);
          // The atlas: a road walked end to end and paid, one half seen,
          // the places named after the viewer and after others.
          await page.getByTestId("tab-atlas").click();
          await expect(page.getByTestId("atlas-named")).toBeVisible();
          await panelShot(page, "more-drawer", `${OUT}/${persona}-${viewport.width}-atlas.png`);
        }
      }
    });
  }
}
