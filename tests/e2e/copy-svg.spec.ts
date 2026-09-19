import { test, expect } from "@playwright/test";
import LZString from "lz-string";

// The Copy button in the Share panel puts the diagram's SVG source on the
// clipboard, fitted to the whole diagram rather than the current pan/zoom
// viewport (zoom/pan live on a wrapper and are never baked into the markup).
//
// Loads the diagram through ?data= rather than a saved row, so the test does
// not depend on the database having content.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const CODE = `sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello
  B-->>A: Hi there`;

// the code editor has its own "Copy" button, so target this one by its title
const COPY_TITLE = '[title="Copy the diagram as SVG, fitted to the whole diagram"]';

test.describe("Share panel - Copy", () => {
  test("copies fitted SVG source to the clipboard", async ({ page }) => {
    const data = LZString.compressToEncodedURIComponent(CODE);
    await page.goto(`/?data=${data}`, { timeout: 25_000 });
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_500);

    await page.getByRole("button", { name: /format/i }).first().click();
    const shareTab = page.getByRole("button", { name: "share", exact: true });
    if (await shareTab.count()) await shareTab.first().click();

    const copy = page.getByRole("button", { name: "Copy", exact: true }).and(page.locator(COPY_TITLE));
    await expect(copy).toBeVisible({ timeout: 10_000 });
    await copy.click();

    // feedback flips to Copied! inside its 1.5s window
    await expect(
      page.getByRole("button", { name: "Copied!", exact: true }).and(page.locator(COPY_TITLE))
    ).toBeVisible({ timeout: 3_000 });

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain("Alice");

    // fitted: explicit width/height matching the viewBox extent, so it pastes at
    // the diagram's own size instead of whatever happened to be on screen
    const m = text.match(/width="([\d.]+)"\s+height="([\d.]+)"\s+viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(m, "root <svg> carries width, height and a 0 0 W H viewBox").not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(Number(m![3]), 1);
    expect(Number(m![2])).toBeCloseTo(Number(m![4]), 1);

    // Contract with the Forensic board (~/Sites/forensic), which is where this
    // gets pasted. Its handler tries FILES on the clipboard first and only then
    // SVG markup, so the copy must carry text/plain ONLY - adding an image/png
    // alongside would make Forensic take the raster branch instead. This is
    // Forensic's exact SVG_TEXT matcher from src/hooks/useNodeClipboard.js; if
    // it stops matching, the paste silently degrades to "not a picture".
    const FORENSIC_SVG_TEXT =
      /^\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>][\s\S]*<\/svg>\s*$/i;
    expect(FORENSIC_SVG_TEXT.test(text), "matches Forensic's svgTextToFile matcher").toBe(true);

    const parsesAsSvg = await page.evaluate((t) => {
      const d = new DOMParser().parseFromString(t, "image/svg+xml");
      return !d.querySelector("parsererror") && d.documentElement.tagName === "svg";
    }, text);
    expect(parsesAsSvg).toBe(true);
  });
});
