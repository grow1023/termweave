import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright-core";

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
      const { calls, ask, work } = await standIn(page, botPane);
      const conversation = await conversationStandIn(page, botPane);
      const shot = async (name: string): Promise<void> => {
        if (!process.env.UI_EVIDENCE_DIR) return;
        mkdirSync(process.env.UI_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `${name}-${phone ? "mobile" : "desktop"}.png`) });
      };
      await page.goto(origin);
      await page.locator(".conn.conn-live").waitFor({ state: "attached" });
      const drawer = async (): Promise<void> => { if (phone) await page.locator('button[aria-controls="workspace-drawer"]').click(); };
      const group = page.locator("section.bots-sidebar");
      // a running worker: the worker pill floats over the end of the transcript
      const showWorker = async (): Promise<void> => {
        work();
        await page.evaluate(() => window.dispatchEvent(new Event("termweave:bots-changed")));
        const pill = page.locator("[data-native-chat-root] [data-worker-dock-pill]");
        await pill.waitFor();
        assert.match((await pill.getAttribute("aria-label")) ?? "", /Run the login tests/, "the pill names the running worker");
        await page.waitForTimeout(300); // the pill's title fades in
        await shot("bot-chat-workers");
      };

      // the sidebar's bots section, before any bot: its one line opens New bot
      await drawer();
      await group.getByRole("button", { name: /No bots yet/ }).click();
      const dialog = page.getByRole("dialog", { name: "New bot" });
      await dialog.getByRole("textbox", { name: "Name" }).fill("Fixer");
      await dialog.getByRole("textbox", { name: "Soul" }).fill("Keep the tests green.");
      await shot("bot-new");
      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in New bot");
      await dialog.getByRole("button", { name: "Create" }).click();
      await until(() => calls.some((call) => call.method === "POST" && call.path === "/api/bots"));
      assert.deepEqual(calls.find((call) => call.path === "/api/bots")?.body, { name: "Fixer", agent: "claude", purpose: "Keep the tests green.", repo: null });
      await dialog.waitFor({ state: "detached" });

      // the new bot's chat opens in the chat lens as Orca's chat (src/orca/chat), with its Home beside it
      // (on a phone: behind its picture)
      const chat = page.locator("[data-native-chat-root]");
      await chat.waitFor();
      assert.equal(await page.locator(".chat-view").count(), 0, "a bot's chat is Orca's chat, not ChatView");
      const box = chat.getByRole("textbox", { name: "Message" });
      await box.waitFor();
      await chat.getByRole("button", { name: "Send message" }).waitFor();
      await box.pressSequentially("hello bot");
      assert.equal(await box.inputValue(), "hello bot", "typed text goes into the chat's message box");
      await box.fill("");
      // the stand-in pane has no readable conversation: the terminal fallback, with the terminal's text
      const fallback = chat.getByRole("button", { name: "Conversation unavailable — show terminal output" });
      // when the conversation cannot be read, the terminal is one press away: "Open terminal" switches
      // this pane to the terminal lens; the header's Chat switch brings the chat back
      await fallback.waitFor();
      await chat.getByRole("button", { name: "Open terminal", exact: true }).click();
      await chat.waitFor({ state: "hidden" });
      await page.locator(".view-switch button").nth(0).click(); // the header's Chat (an icon only on a phone)
      await chat.waitFor();
      await fallback.click();
      await chat.locator("pre").first().waitFor({ state: "visible" });
      await page.waitForTimeout(300); // the disclosure's open animation
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no sideways scroll on the page with the chat");
      assert.equal(await chat.locator("[data-native-chat-scroll]").evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in the chat");
      await shot("bot-chat");
      // a small invented conversation: user and assistant rows, markdown with a table, code and a quote, a tool run, an edit
      conversation.show();
      await chat.getByText("Parser tidy-up", { exact: true }).waitFor({ timeout: 10_000 });
      await chat.locator("table").first().waitFor();
      assert.equal(await chat.locator("table td").first().evaluate((el) => getComputedStyle(el).borderBottomStyle === "none" || getComputedStyle(el).borderBottomWidth === "0px"), true, "no row lines in a chat table");
      assert.notEqual(await chat.locator("table th").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "a chat table's header row is tinted");
      assert.equal(await chat.locator("[data-native-chat-scroll]").evaluate((el) => el.scrollWidth <= el.clientWidth), true, "no sideways scroll in the transcript");
      await shot("bot-chat-transcript");
      await chat.locator("[data-native-chat-scroll]").evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(200);
      await shot("bot-chat-transcript-top");
      // the cards docked above the composer never squeeze the transcript: it keeps 40% of the chat
      // column (capped at 60% of a very short one) and at least 160px
      const [transcriptHeight, chatHeight] = await chat.evaluate((root) => [root.querySelector("[data-native-chat-scroll]")?.getBoundingClientRect().height ?? 0, root.getBoundingClientRect().height]);
      assert.ok(transcriptHeight >= Math.min(Math.max(160, chatHeight * 0.4), chatHeight * 0.6) - 1, `the transcript keeps its room above the dock (${transcriptHeight} of ${chatHeight}px)`);
      const dockBox = chat.locator("[data-native-chat-worker-approvals]");
      if (phone) {
        // Home is a sheet behind the bot's picture: the chat is the only place that shows the card, so it is open
        const card = chat.locator('[data-native-chat-worker-approval="1"]');
        await card.getByText("Ship the fix today?", { exact: true }).waitFor();
        assert.equal(await insideBox(card.getByRole("button", { name: "Submit" }), dockBox), true, "the open dock card's Submit is fully inside the dock's visible box");
      } else {
        // Home is docked and open beside the chat and shows the full card: here it is one folded row
        await chat.locator("[data-native-chat-worker-approvals-folded]").waitFor();
        await chat.locator('[data-native-chat-worker-question-summary="1"]').getByText("#1 Fix login test · Waiting on you", { exact: true }).waitFor();
        assert.equal(await chat.locator("[data-native-chat-worker-approval]").count(), 0, "no card shows twice side by side: the dock's card is folded while Home shows it");
      }
      await chat.locator("[data-native-chat-scroll]").evaluate((el) => { el.scrollTop = el.scrollHeight; });
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

      // an approval: worded from the action, not from the bot's ask; Approve or Deny only.
      // It shows in the Home panel and in the chat's dock; answered in one place, it leaves both.
      ask();
      await page.evaluate(() => window.dispatchEvent(new Event("termweave:bots-changed")));
      const approvalName = 'Type this into "api" (w1:p2) and press Enter?';
      const approval = side.getByRole("group", { name: approvalName });
      const docked = chat.getByRole("group", { name: approvalName });
      await approval.getByText("npm test", { exact: true }).waitFor();
      if (!phone) {
        // Home docked beside the chat: both waiting items are folded rows in the dock; Show opens one in place
        await chat.locator('[data-native-chat-worker-question-summary="3"]').waitFor();
        await chat.locator('[data-native-chat-worker-question-summary="2"]').waitFor();
        assert.equal(await docked.count(), 0, "the approval is folded in the dock while Home shows it");
        await chat.getByRole("button", { name: 'Show #3 Type into "api" (w1:p2) question' }).click();
      }
      await docked.getByText("npm test", { exact: true }).waitFor();
      // one order everywhere: Deny first, Approve last at the right end, at least 12px apart
      const dockedActions = docked.locator("[data-native-chat-approval-actions] button");
      assert.deepEqual(await dockedActions.allTextContents(), ["Deny", "Approve"], "the dock's approval reads Deny, then Approve");
      const [denyBox, approveBox] = [await dockedActions.nth(0).boundingBox(), await dockedActions.nth(1).boundingBox()];
      assert.ok(denyBox && approveBox && approveBox.x - (denyBox.x + denyBox.width) >= 11.5, "12px or more between Deny and Approve");
      const homeActions = approval.getByRole("button", { name: /^(Deny|Approve)$/ });
      assert.deepEqual(await homeActions.allTextContents(), ["Deny", "Approve"], "the Home panel's approval reads Deny, then Approve");
      assert.equal(await insideBox(docked.getByRole("button", { name: "Approve", exact: true }), dockBox), true, "the open dock card's Approve is fully inside the dock's visible box");
      assert.equal(await side.getByText("a bot's own wording").count(), 0, "an approval shows the action, not the bot's words");
      assert.equal(await chat.getByText("a bot's own wording").count(), 0, "the chat's dock shows the action, not the bot's words");
      assert.equal(await approval.getByRole("textbox").count(), 0, "an approval takes Approve or Deny only");
      assert.equal(await docked.getByRole("textbox").count(), 0, "the docked approval takes Approve or Deny only");
      await shot("bot-approval");
      if (phone) {
        // the Home sheet covers the chat on a phone: close it, answer in the chat, and Home has it answered too
        await side.getByRole("button", { name: "Close" }).click();
        await side.waitFor({ state: "detached" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no sideways scroll with the dock open");
        await shot("bot-chat-approval");
        // a card that just appeared or moved ignores answers for 500 ms (a fast second click must not
        // approve a card the owner has not read): wait past it, as an owner reading the card does
        await page.waitForTimeout(600);
        await docked.getByRole("button", { name: "Approve", exact: true }).click();
        await until(() => calls.at(-1)?.path === "/api/bots/b1/items/3");
        assert.deepEqual(calls.at(-1)?.body, { answer: "Approve" });
        await docked.waitFor({ state: "detached" });
        await showWorker();
        await page.getByRole("button", { name: "Open Fixer's home" }).click();
        await side.waitFor();
        await approval.waitFor({ state: "detached" });
      } else {
        await shot("bot-chat-approval");
        // the two cards ask() added each ignore answers for 500 ms after they appear (Home and dock alike):
        // wait past it, as an owner reading the card does
        await page.waitForTimeout(600);
        await approval.getByRole("button", { name: "Approve", exact: true }).click();
        await until(() => calls.at(-1)?.path === "/api/bots/b1/items/3");
        assert.deepEqual(calls.at(-1)?.body, { answer: "Approve" });
        await docked.waitFor({ state: "detached" });
        await showWorker();
      }

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
  console.log("PASS bots: new bot, Orca chat with composer and fallback, transcript rows, home panel beside the chat, answer, automation and its refusal, approval in Home and in the chat dock answered once, settings and picture, sidebar row, phone layout");
}

/** True when the element is wholly inside the box's visible rectangle (not cut by its scroll edge). */
async function insideBox(element: Locator, box: Locator): Promise<boolean> {
  const [inner, outer] = [await element.boundingBox(), await box.boundingBox()];
  if (!inner || !outer) return false;
  return inner.y >= outer.y - 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5
    && inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function standIn(page: Page, botPane: string): Promise<{ calls: Array<{ method: string; path: string; body: unknown }>; ask: () => void; work: () => void }> {
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
  const work = (): void => {
    view = { ...view, workers: [{ id: "w1", botId: "b1", itemN: 1, agent: "claude", repo: "/tmp/b1/repo", worktree: "/tmp/b1/worktrees/w1", branch: "bot/fix-login", paneId: null, spec: "Run the login tests and fix the failure", status: "working", result: null, startedAt: at, endedAt: null }] };
  };
  return { calls, ask, work };
}

/**
 * A stand-in /api/pane/conversation for the bot's pane, off until `show()`: then a small invented
 * conversation (no user data) so the transcript rows can be looked at.
 */
async function conversationStandIn(page: Page, botPane: string): Promise<{ show: () => void }> {
  let shown = false;
  const at = "2026-11-24T00:00:00.000Z";
  const markdown = [
    "## Parser tidy-up",
    "",
    "I split the tokenizer from the parser. **Two files** changed:",
    "",
    "| File | Change | Lines |",
    "| --- | --- | --- |",
    "| `src/parser.ts` | one function per rule | 42 |",
    "| `src/tokens.ts` | new | 18 |",
    "",
    "```ts",
    "export function parse(source: string): Node[] {",
    "  return rules(tokens(source));",
    "}",
    "```",
    "",
    "> The old entry point still works; it calls the new one.",
  ].join("\n");
  const turns = [
    { role: "user", ts: at, parts: [{ kind: "text", text: "Please tidy the parser in the demo project and tell me what changed." }] },
    { role: "assistant", ts: at, end_ts: at, parts: [
      { kind: "tool", name: "Bash", summary: "bun test src/parser", input: JSON.stringify({ command: "bun test src/parser" }), output: "12 pass\n0 fail" },
      { kind: "tool", name: "Edit", summary: "src/parser.ts", input: JSON.stringify({ file_path: "/srv/demo-project/src/parser.ts", old_string: "return parseAll(source);", new_string: "return rules(tokens(source));" }), output: "The file has been updated." },
      { kind: "text", text: markdown },
    ] },
  ];
  await page.route((url) => url.pathname === "/api/pane/conversation" && url.searchParams.get("pane_id") === botPane, async (route) => {
    if (!shown) return route.fallback();
    return route.fulfill({ json: { history_id: "demo-history", source: "claude-transcript", turns, cursor: null, metadata: { model: "demo-model", reasoning_effort: null } } });
  });
  return { show: () => { shown = true; } };
}
