import assert from "node:assert/strict";
import type { Browser } from "playwright-core";

/**
 * Phone zoom buttons (src/lib/pageZoom.ts): the more menu's Zoom out / Zoom in change the layout width
 * the way Cmd+- / Cmd+= do on the Mac, the choice survives a reload, and a desktop shows no buttons.
 */
export async function checkPageZoom(browser: Browser, origin: string, paneId: string): Promise<void> {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US" });
  try {
    const page = await phone.newPage();
    await page.goto(`${origin}/?pane=${encodeURIComponent(paneId)}`);
    await page.locator(".conn.conn-live").waitFor({ state: "attached" });
    const width = () => page.evaluate(() => window.innerWidth);
    const widthIs = (value: number) => page.waitForFunction((value) => window.innerWidth === value, value, { timeout: 5_000 });
    assert.equal(await width(), 390);
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await widthIs(Math.round(390 / 0.9)); // zoomed out: more room, as Cmd+- gives
    assert.equal(await page.getByRole("button", { name: "Reset zoom" }).textContent(), "90%");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await widthIs(Math.round(390 / 1.1));
    await page.reload();
    await page.locator(".conn.conn-live").waitFor({ state: "attached" });
    await widthIs(Math.round(390 / 1.1)); // kept across a reload
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("button", { name: "Reset zoom" }).click();
    await widthIs(390);
  } finally {
    await phone.close();
  }
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
  try {
    const page = await desktop.newPage();
    await page.goto(`${origin}/?pane=${encodeURIComponent(paneId)}`);
    await page.locator(".conn.conn-live").waitFor({ state: "attached" });
    assert.equal(await page.getByRole("button", { name: "Zoom out" }).count(), 0, "a desktop keeps its own Cmd+- zoom");
  } finally {
    await desktop.close();
  }
  console.log("PASS phone zoom buttons scale the page like Cmd+- / Cmd+= and keep the choice");
}
