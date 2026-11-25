import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";

import type { BotsView } from "../shared/bots/types.ts";

/**
 * The bots page (src/components/BotsPanel.tsx) against a stand-in /api/bots: no bot, worker or
 * agent session is started. Creating, answering a needs-you item, adding a schedule, and the
 * phone layout.
 */
export async function checkBotsPanel(browser: Browser, origin: string): Promise<void> {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const phone = viewport.width < 600;
    const context = await browser.newContext({ viewport, locale: "en-US", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const calls = await standIn(page);
      await page.goto(origin);
      await page.locator(".conn.conn-live").waitFor({ state: "attached" });
      if (phone) await page.getByRole("button", { name: "More tools", exact: true }).click();
      await page.getByRole("button", { name: "Bots", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Bots" });
      await dialog.waitFor();

      // no bot yet: the form is the page
      await dialog.getByRole("textbox", { name: "Name" }).fill("Fixer");
      await dialog.getByRole("textbox", { name: "What it is for" }).fill("Keep the tests green.");
      await dialog.getByRole("button", { name: "Create bot" }).click();
      await dialog.getByRole("tab", { name: "Fixer" }).waitFor();
      assert.deepEqual(calls.at(-1), { method: "POST", path: "/api/bots", body: { name: "Fixer", agent: "claude", purpose: "Keep the tests green.", repo: null } });

      // a needs-you item: its question and answers, and the pick goes back
      await dialog.getByText("Ship the fix today?", { exact: true }).waitFor();
      await dialog.getByRole("button", { name: "yes", exact: true }).click();
      await until(() => calls.at(-1)?.path === "/api/bots/b1/items/1");
      assert.deepEqual(calls.at(-1)?.body, { answer: "yes" });

      // a schedule
      await dialog.getByRole("button", { name: "Add schedule" }).click();
      await dialog.getByRole("textbox", { name: "What to do" }).fill("Look at CI.");
      await dialog.getByRole("button", { name: "Add schedule" }).click();
      await until(() => calls.at(-1)?.path === "/api/bots/b1/automations");
      assert.equal((calls.at(-1)?.body as { schedule: string }).schedule, "0 9 * * 1-5");
      await dialog.locator(".bots-title", { hasText: "Look at CI." }).waitFor();

      // a refusal shows as it came
      await dialog.getByRole("button", { name: "Add schedule" }).click();
      await dialog.getByRole("textbox", { name: /When/ }).fill("nope");
      await dialog.getByRole("textbox", { name: "What to do" }).fill("x");
      await dialog.getByRole("button", { name: "Add schedule" }).click();
      await dialog.getByRole("alert").filter({ hasText: "Invalid bot schedule." }).waitFor();
      assert.equal(await dialog.getByRole("textbox", { name: /When/ }).inputValue(), "nope", "a refused schedule keeps what was typed");

      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in the bots page");
      if (phone) {
        const box = await dialog.boundingBox();
        assert.ok(box && box.width >= 389, "the bots page fills a phone");
      }
      if (process.env.UI_EVIDENCE_DIR) {
        mkdirSync(process.env.UI_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `bots-${phone ? "mobile" : "desktop"}.png`) });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log("PASS bots page: create, answer a needs-you item, add a schedule, a refusal, phone layout");
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function standIn(page: Page): Promise<Array<{ method: string; path: string; body: unknown }>> {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const at = "2026-11-24T00:00:00.000Z";
  let view: BotsView = { bots: [], items: [], automations: [], workers: [] };
  await page.route("**/api/bots**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body });
    if (request.method() === "POST" && path === "/api/bots") {
      const bot = { id: "b1", name: body.name, agent: body.agent, home: "/tmp/b1", repo: null, paused: false, paneId: "p9", createdAt: at };
      view = {
        ...view,
        bots: [bot],
        items: [{ botId: "b1", n: 1, title: "Fix login test", doneMeans: null, status: "needs_you", ask: "Ship the fix today?", options: ["yes", "no"], waitingOn: null, comments: [], createdAt: at, updatedAt: at }],
      };
      return route.fulfill({ json: bot });
    }
    if (request.method() === "POST" && path === "/api/bots/b1/items/1") {
      view = { ...view, items: view.items.map((item) => ({ ...item, status: "working" as const, ask: null, options: [] })) };
      return route.fulfill({ json: { ok: true } });
    }
    if (request.method() === "POST" && path === "/api/bots/b1/automations") {
      if (body.schedule === "nope") return route.fulfill({ status: 400, json: { error: { code: "invalid_schedule", message: "Invalid bot schedule." } } });
      const automation = { id: "a1", botId: "b1", name: body.name || "Look at CI.", prompt: body.prompt, schedule: { value: body.schedule, dtstart: at, timezone: body.timezone }, enabled: true, once: false, nextRunAt: "2026-11-25T00:00:00.000Z", lastRunAt: null };
      view = { ...view, automations: [automation] };
      return route.fulfill({ json: automation });
    }
    return route.fulfill({ json: view });
  });
  return calls;
}
