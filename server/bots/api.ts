import { timingSafeEqual } from "node:crypto";

import { BOT_AGENTS, BOT_ITEM_OPEN, BOT_ITEM_STATUSES, type BotAgent, type BotItemStatus } from "../../shared/bots/types.ts";
import { isBotAvatar } from "../../shared/bots/avatar.ts";
import { badRequest, jsonResponse } from "../http.ts";
import { BotError, type BotNote, type BotRuntime } from "./runtime.ts";
import type { BotStore } from "./store.ts";

const isAgent = (value: unknown): value is BotAgent => typeof value === "string" && (BOT_AGENTS as readonly string[]).includes(value);
const isStatus = (value: unknown): value is BotItemStatus => typeof value === "string" && (BOT_ITEM_STATUSES as readonly string[]).includes(value);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

async function body(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const parsed: unknown = await request.json();
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : badRequest("invalid_body", "request body must be a JSON object");
  } catch { return badRequest("invalid_json", "request body must be JSON"); }
}

async function answer(work: () => unknown): Promise<Response> {
  try {
    const result = await work();
    return jsonResponse(result ?? { ok: true });
  } catch (error) {
    if (error instanceof BotError) return jsonResponse({ error: { code: error.code, message: error.message } }, 400);
    return jsonResponse({ error: { code: "bot_failed", message: error instanceof Error ? error.message : String(error) } }, 500);
  }
}

/** The bots page: /api/bots and below, behind the app's own sign-in. */
export async function handleBotsRequest(request: Request, pathname: string, runtime: BotRuntime, store: BotStore, readOnly: boolean): Promise<Response> {
  const parts = pathname.split("/").slice(3); // ["", "api", "bots", ...]
  if (request.method === "GET" && parts.length === 0) return jsonResponse(store.view());
  // a watching device reads a bot's notes as it reads everything else
  if (request.method === "GET" && parts.length === 3 && parts[1] === "notes" && isNote(parts[2])) {
    const note = parts[2];
    return answer(() => ({ text: runtime.readNote(parts[0]!, note) }));
  }
  if (readOnly) return jsonResponse({ error: { code: "read_only", message: "this device can only watch" } }, 403);
  const [botId, section, key] = parts;
  if (request.method === "POST" && parts.length === 0) {
    const input = await body(request);
    if (input instanceof Response) return input;
    if (!isAgent(input.agent)) return badRequest("invalid_agent", "agent is claude or codex");
    return answer(() => runtime.createBot({ name: str(input.name) ?? "", agent: input.agent as BotAgent, purpose: str(input.purpose) ?? "", repo: str(input.repo) || null }));
  }
  if (botId === undefined) return badRequest("not_found", "no such bots route");
  if (request.method === "DELETE" && section === undefined) return answer(() => runtime.removeBot(botId));
  if (request.method === "PATCH" && section === undefined) {
    const input = await body(request);
    if (input instanceof Response) return input;
    return answer(() => runtime.updateBot(botId, {
      ...(typeof input.paused === "boolean" ? { paused: input.paused } : {}),
      ...(input.repo === null || typeof input.repo === "string" ? { repo: str(input.repo) || null } : {}),
      ...(typeof input.name === "string" ? { name: input.name } : {}),
      ...(isBotAvatar(input.avatar) ? { avatar: input.avatar } : {}),
    }));
  }
  if (request.method === "POST" && section === "message") {
    const input = await body(request);
    if (input instanceof Response) return input;
    const text = str(input.text)?.trim();
    if (!text) return badRequest("missing_text", "text is required");
    return answer(() => runtime.tell(botId, text));
  }
  if (request.method === "POST" && section === "open") return answer(async () => ({ pane_id: await runtime.ensurePane(botId) }));
  if (request.method === "PUT" && section === "notes" && isNote(key)) {
    const input = await body(request);
    if (input instanceof Response) return input;
    if (typeof input.text !== "string") return badRequest("missing_text", "text is required");
    const text = input.text;
    return answer(() => runtime.writeNote(botId, key, text));
  }
  if (request.method === "PATCH" && section === "items" && key !== undefined) {
    const input = await body(request);
    if (input instanceof Response) return input;
    const status = input.status === "planned" || input.status === "done" || input.status === "canceled" ? input.status : undefined;
    return answer(() => runtime.ownerItem(botId, Number(key), { ...(status ? { status } : {}), ...(str(input.comment) ? { comment: str(input.comment)! } : {}) }));
  }
  if (request.method === "POST" && section === "automations" && key !== undefined && parts[3] === "run") return answer(() => runtime.runAutomation(botId, key));
  if (request.method === "POST" && section === "items" && key !== undefined) {
    const input = await body(request);
    if (input instanceof Response) return input;
    return answer(() => runtime.answerItem(botId, Number(key), str(input.answer) ?? ""));
  }
  if (section === "automations") {
    if (request.method === "POST" && key === undefined) {
      const input = await body(request);
      if (input instanceof Response) return input;
      return answer(() => runtime.addAutomation(botId, { name: str(input.name) ?? "", prompt: str(input.prompt) ?? "", schedule: str(input.schedule) ?? "", timezone: str(input.timezone) || null, once: input.once === true }));
    }
    if (request.method === "PATCH" && key !== undefined) {
      const input = await body(request);
      if (input instanceof Response) return input;
      return answer(() => runtime.setAutomation(botId, key, input.enabled === true));
    }
    if (request.method === "DELETE" && key !== undefined) return answer(() => runtime.removeAutomation(botId, key));
  }
  return badRequest("not_found", "no such bots route");
}

function isNote(value: unknown): value is BotNote {
  return value === "soul" || value === "memory";
}

function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The bot's own CLI (server/bots/cli.ts): from this computer only, with that bot's secret. It
 * reads every terminal, but types into or closes one it did not start only after the owner approves.
 */
export async function handleBotCliRequest(request: Request, pathname: string, loopback: boolean, runtime: BotRuntime, store: BotStore, repos: () => Promise<string[]>): Promise<Response> {
  if (!loopback) return jsonResponse({ error: { code: "forbidden", message: "the bot CLI works from this computer only" } }, 403);
  if (request.method !== "POST") return badRequest("method_not_allowed", "use POST");
  const header = request.headers.get("authorization") ?? "";
  const given = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const found = given === "" ? undefined : store.botBySecret(given);
  const bot = found && matches(given, store.secret(found.id) ?? "") ? found : undefined;
  if (!bot) return jsonResponse({ error: { code: "unauthorized", message: "unknown bot secret" } }, 401);
  const input = await body(request);
  if (input instanceof Response) return input;
  const view = (): ReturnType<BotStore["view"]> => store.view();
  const n = Number(input.n);
  switch (pathname.slice("/api/bot-cli/".length)) {
    case "repo-list":
      return answer(async () => ({ default: bot.repo, repos: [...new Set([...(bot.repo ? [bot.repo] : []), ...await repos()])] }));
    case "worker-start":
      if (input.agent !== null && !isAgent(input.agent)) return badRequest("invalid_agent", "agent is claude or codex");
      return answer(async () => {
        const worker = await runtime.startWorker(bot.id, { repo: str(input.repo), agent: input.agent as BotAgent | null, itemN: typeof input.item === "number" && Number.isFinite(input.item) ? input.item : null, spec: str(input.spec) ?? "" });
        return { id: worker.id, branch: worker.branch, worktree: worker.worktree, status: worker.status };
      });
    case "worker-list":
      return jsonResponse(view().workers.filter((worker) => worker.botId === bot.id).map(({ spec: _spec, ...worker }) => worker));
    case "worker-send":
      return answer(() => runtime.sendToWorker(bot.id, str(input.id) ?? "", str(input.text) ?? ""));
    case "item-list":
      return jsonResponse(view().items.filter((item) => item.botId === bot.id && (input.all === true || BOT_ITEM_OPEN.has(item.status))));
    case "item-add":
      return answer(() => runtime.addItem(bot.id, { title: str(input.title) ?? "", doneMeans: str(input.doneMeans) }));
    case "item-set": {
      if (!Number.isInteger(n)) return badRequest("invalid_item", "give the item number");
      // an approval item's question is TermWeave's own: the owner must see exactly what will run
      if (store.item(bot.id, n)?.action) return badRequest("approval_item", "an approval item changes only by your owner's answer");
      if (input.status !== undefined && !isStatus(input.status)) return badRequest("invalid_status", `status is one of ${BOT_ITEM_STATUSES.join(", ")}`);
      const options = Array.isArray(input.options) ? input.options.filter((option): option is string => typeof option === "string") : undefined;
      const comment = str(input.comment)?.trim();
      return answer(() => runtime.setItem(bot.id, n, {
        ...(isStatus(input.status) ? { status: input.status } : {}),
        ...(str(input.ask) !== null ? { ask: str(input.ask) } : {}),
        ...(options ? { options } : {}),
        ...(str(input.waitingOn) !== null ? { waitingOn: str(input.waitingOn) } : {}),
      }, comment ? { by: "bot", text: comment } : undefined));
    }
    case "automation-create":
      return answer(() => runtime.addAutomation(bot.id, { name: str(input.name) ?? "", prompt: str(input.prompt) ?? "", schedule: str(input.schedule) ?? "", timezone: str(input.timezone), once: input.once === true }));
    case "automation-list":
      return jsonResponse(view().automations.filter((automation) => automation.botId === bot.id));
    case "automation-remove":
      return answer(() => runtime.removeAutomation(bot.id, str(input.id) ?? ""));
    case "pane-list":
      return answer(() => runtime.listPanes(bot.id));
    case "pane-read":
      return answer(() => runtime.readPane(bot.id, str(input.id) ?? "", Number(input.lines)));
    case "pane-send":
      return answer(() => runtime.paneAction(bot.id, { paneId: str(input.id) ?? "", kind: "send", text: str(input.text) ?? "" }));
    case "pane-keys":
      return answer(() => runtime.paneAction(bot.id, { paneId: str(input.id) ?? "", kind: "keys", keys: Array.isArray(input.keys) ? input.keys.filter((key): key is string => typeof key === "string") : [] }));
    case "pane-close":
      return answer(() => runtime.paneAction(bot.id, { paneId: str(input.id) ?? "", kind: "close" }));
    case "workspace-open":
      if (input.agent !== null && input.agent !== undefined && !isAgent(input.agent)) return badRequest("invalid_agent", "agent is claude or codex");
      return answer(() => runtime.openWorkspace(bot.id, { cwd: str(input.cwd) ?? "", agent: isAgent(input.agent) ? input.agent : null, label: str(input.label), prompt: str(input.prompt) }));
    default:
      return badRequest("not_found", "no such bot command");
  }
}
