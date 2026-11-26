import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";

import type { BotsView } from "../shared/bots/types.ts";

/**
 * The bot screens (src/orca/bots) against a stand-in /api/bots: no bot, worker or
 * agent session is started. Creating, answering a needs-you item, adding a schedule, and the
 * phone layout.
 */
export async function checkBotsPanel(browser: Browser, origin: string, botPane: string): Promise<void> {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const phone = viewport.width < 600;
    const context = await browser.newContext({ viewport, locale: "en-US", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const { calls, ask } = await standIn(page, botPane);
      const shot = async (name: string): Promise<void> => {
        if (!process.env.UI_EVIDENCE_DIR) return;
        mkdirSync(process.env.UI_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `${name}-${phone ? "mobile" : "desktop"}.png`) });
      };
      await page.goto(origin);
      await page.locator(".conn.conn-live").waitFor({ state: "attached" });
      const drawer = async (): Promise<void> => { if (phone) await page.locator('button[aria-controls="workspace-drawer"]').click(); };
      const group = page.locator("section.bots-sidebar");

      // the sidebar's bots section, before any bot: its one line opens New bot
      await drawer();
      await group.getByRole("button", { name: /No bots yet/ }).click();
      const dialog = page.getByRole("dialog", { name: "New bot" });
      await dialog.getByRole("textbox", { name: "Name" }).fill("Fixer");
      await dialog.getByRole("textbox", { name: "Identity" }).fill("Keep the tests green.");
      await shot("bot-new");
      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in New bot");
      await dialog.getByRole("button", { name: "Create" }).click();
      await until(() => calls.some((call) => call.method === "POST" && call.path === "/api/bots"));
      assert.deepEqual(calls.find((call) => call.path === "/api/bots")?.body, { name: "Fixer", agent: "claude", purpose: "Keep the tests green.", repo: null });
      await dialog.waitFor({ state: "detached" });

      // the new bot's chat opens, in the chat lens, with its Home beside it (on a phone: behind its picture)
      await page.locator(".chat-view").waitFor();
      if (phone) await page.getByRole("button", { name: "Open Fixer's home" }).click();
      const side = page.getByRole("complementary", { name: "Fixer bot" });
      await side.waitFor();

      // a needs-you item: its question and answers, and the pick goes back
      await side.getByText("Ship the fix today?", { exact: true }).first().waitFor();
      await shot("bot-home");
      await side.getByRole("button", { name: /yes$/ }).click();
      await until(() => calls.at(-1)?.path === "/api/bots/b1/items/1");
      assert.deepEqual(calls.at(-1)?.body, { answer: "yes" });
      // answered, it sits in its status group
      await side.getByRole("button", { name: /In progress/ }).waitFor();
      await side.getByText("Fix login test", { exact: true }).first().waitFor();

      // an automation, and a refusal that shows as it came and keeps what was typed
      // as in Orca, a section's "+" shows while the pointer is on its header (always on touch)
      const addAutomation = async (): Promise<void> => {
        if (!phone) await side.getByRole("heading", { name: "Automations" }).hover({ force: true });
        await side.getByRole("button", { name: "New automation" }).click();
      };
      await addAutomation();
      const form = side.getByRole("group", { name: "New automation" }).or(side.getByRole("form", { name: "New automation" })).first();
      await form.getByRole("textbox", { name: "What to do" }).fill("Look at CI.");
      await form.getByRole("button", { name: "Add automation" }).click();
      await until(() => calls.at(-1)?.path === "/api/bots/b1/automations");
      assert.equal((calls.at(-1)?.body as { schedule: string }).schedule, "0 9 * * 1-5");
      await side.getByText("Look at CI.", { exact: true }).first().waitFor();
      await addAutomation();
      await form.getByRole("textbox", { name: "When" }).fill("nope");
      await form.getByRole("textbox", { name: "What to do" }).fill("x");
      await form.getByRole("button", { name: "Add automation" }).click();
      await side.getByRole("alert").filter({ hasText: "Invalid bot schedule." }).waitFor();
      assert.equal(await form.getByRole("textbox", { name: "When" }).inputValue(), "nope", "a refused automation keeps what was typed");
      await form.getByRole("button", { name: "Cancel" }).click();

      // an approval: worded from the action, not from the bot's ask; Approve or Deny only
      ask();
      await page.evaluate(() => window.dispatchEvent(new Event("termweave:bots-changed")));
      const approval = side.getByRole("group", { name: 'Type this into "api" (w1:p2) and press Enter?' });
      await approval.getByText("npm test", { exact: true }).waitFor();
      assert.equal(await side.getByText("a bot's own wording").count(), 0, "an approval shows the action, not the bot's words");
      assert.equal(await approval.getByRole("textbox").count(), 0, "an approval takes Approve or Deny only");
      await shot("bot-approval");
      await approval.getByRole("button", { name: "Approve", exact: true }).click();
      await until(() => calls.at(-1)?.path === "/api/bots/b1/items/3");
      assert.deepEqual(calls.at(-1)?.body, { answer: "Approve" });

      // its settings open in place of Home; the picture is one of the beasts
      await side.getByRole("button", { name: "Bot settings…" }).click();
      await side.getByRole("button", { name: "Edit bot picture" }).click();
      await page.getByRole("button", { name: "Dragon", exact: true }).click();
      await until(() => calls.at(-1)?.method === "PATCH");
      assert.deepEqual(calls.at(-1), { method: "PATCH", path: "/api/bots/b1", body: { avatar: "mascot:dragon" } });
      await page.getByRole("button", { name: "Dragon", exact: true, pressed: true }).waitFor();
      await page.waitForTimeout(300); // the popover's enter animation
      await shot("bot-picture");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Dragon", exact: true }).waitFor({ state: "detached" });
      await shot("bot-settings");
      assert.equal(await side.evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in the bot's panel");
      if (phone) {
        const box = await side.boundingBox();
        assert.ok(box && box.width >= 389, "the bot's panel fills a phone");
      }

      // the sidebar lists the bot with its picture; its row opens the chat
      if (phone) { await side.getByRole("button", { name: "Back" }).first().click(); await side.getByRole("button", { name: "Close" }).click(); }
      await drawer();
      await group.getByRole("button", { name: /^Fixer\b/ }).first().waitFor();
      assert.ok(await group.locator("img").count() >= 1, "a bot's row shows its picture");
      await group.getByRole("button", { name: "Manage Fixer" }).waitFor({ state: "attached" });
      if (process.env.UI_EVIDENCE_DIR) await group.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `bots-sidebar-${phone ? "mobile" : "desktop"}.png`) });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log("PASS bots: new bot, home panel beside the chat, answer, automation and its refusal, approval, settings and picture, sidebar row, phone layout");
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function standIn(page: Page, botPane: string): Promise<{ calls: Array<{ method: string; path: string; body: unknown }>; ask: () => void }> {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const at = "2026-11-24T00:00:00.000Z";
  let view: BotsView = { bots: [], items: [], automations: [], workers: [] };
  await page.route("**/api/bots**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body });
    if (request.method() === "POST" && path === "/api/bots") {
      const bot = { id: "b1", name: body.name, agent: body.agent, home: "/tmp/b1", repo: null, paused: false, paneId: botPane, createdAt: at };
      view = {
        ...view,
        bots: [bot],
        items: [{ botId: "b1", n: 1, title: "Fix login test", doneMeans: null, status: "needs_you", ask: "Ship the fix today?", options: ["yes", "no"], waitingOn: null, comments: [], createdAt: at, updatedAt: at }],
      };
      return route.fulfill({ json: bot });
    }
    if (request.method() === "PATCH" && path === "/api/bots/b1") {
      view = { ...view, bots: view.bots.map((bot) => ({ ...bot, ...body })) };
      return route.fulfill({ json: view.bots[0] });
    }
    const answered = /^\/api\/bots\/b1\/items\/(\d+)$/.exec(path);
    if (request.method() === "POST" && answered) {
      view = { ...view, items: view.items.map((item) => item.n === Number(answered[1]) ? { ...item, status: "working" as const, ask: null, options: [] } : item) };
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
  const ask = (): void => {
    view = { ...view, items: [...view.items, { botId: "b1", n: 2, title: "Merge the fix", doneMeans: null, status: "needs_you", ask: "Merge now?", options: ["merge", "wait"], waitingOn: null, comments: [], createdAt: at, updatedAt: at },
      // an approval: the bar words it from the action, not from the bot's ask
      { botId: "b1", n: 3, title: "Type into \"api\" (w1:p2)", doneMeans: null, status: "needs_you", ask: "a bot's own wording", options: ["Approve", "Deny"], waitingOn: null, comments: [], action: { kind: "send", paneId: "w1:p2", where: "\"api\" (w1:p2)", text: "npm test" }, createdAt: at, updatedAt: at }] };
  };
  return { calls, ask };
}
