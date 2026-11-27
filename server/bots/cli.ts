#!/usr/bin/env bun
/**
 * tw-bot: what a bot runs from its home to start workers, keep items and make automations.
 * It reads the server address and its own secret from .termweave-bot.json in the bot's home,
 * and talks only to /api/bot-cli on this computer.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const USAGE = `tw-bot <command>
  repo list
  worker start [--repo <path>] [--agent claude|codex] [--item <n>] (--spec "..." | --spec-file <file>)
  worker list
  worker send <id> (--text "..." | --text-file <file>)
  item list [--all]
  item add --title "..." [--done-means "..."]
  item set <n> [--status planned|working|waiting|needs-you] [--ask "..."] [--option "..."]... [--waiting-on "..."] [--comment "..."]
  item comment <n> (--text "..." | --text-file <file>)
  item done <n> | item cancel <n> --reason "..."
  automation create --name "..." --cron "<min hour day month weekday>" --prompt "..." [--timezone <zone>] [--once]
  automation list | automation remove <id>
  pane list | pane read <id> [--lines <n>] | pane notes <id>
  pane send <id> (--text "..." | --text-file <file>) | pane keys <id> <key>... | pane close <id>
  workspace open --cwd <path> [--agent claude|codex] [--label "..."] [--prompt "..." | --prompt-file <file>]`;

type Flags = Map<string, string[]>;

function parse(argv: string[]): { words: string[]; flags: Flags } {
  const words: string[] = [];
  const flags: Flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) { words.push(arg); continue; }
    const name = arg.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? "true" : (i++, next);
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { words, flags };
}

const one = (flags: Flags, name: string): string | undefined => flags.get(name)?.at(-1);
function text(flags: Flags, name: string): string | undefined {
  const file = one(flags, `${name}-file`);
  return file === undefined ? one(flags, name) : readFileSync(resolve(file), "utf8");
}

function config(): { url: string; secret: string } {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, ".termweave-bot.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as { url: string; secret: string };
    if (dirname(dir) === dir) throw new Error("no .termweave-bot.json here: run tw-bot from the bot's home");
  }
}

async function call(command: string, body: Record<string, unknown>): Promise<unknown> {
  const { url, secret } = config();
  const response = await fetch(`${url}/api/bot-cli/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? `the server answered ${response.status}`);
  return result;
}

async function main(argv: string[]): Promise<void> {
  const { words, flags } = parse(argv);
  const [group, action, target] = words;
  const n = target === undefined ? undefined : Number(target);
  const status = one(flags, "status")?.replace("needs-you", "needs_you");
  const run = async (command: string, body: Record<string, unknown> = {}): Promise<void> => {
    console.log(JSON.stringify(await call(command, body), null, 2));
  };
  switch (`${group} ${action}`) {
    case "repo list": return run("repo-list");
    case "worker start": return run("worker-start", { repo: one(flags, "repo") ?? null, agent: one(flags, "agent") ?? null, item: one(flags, "item") === undefined ? null : Number(one(flags, "item")), spec: text(flags, "spec") ?? "" });
    case "worker list": return run("worker-list");
    case "worker send": return run("worker-send", { id: target, text: text(flags, "text") ?? "" });
    case "item list": return run("item-list", { all: flags.has("all") });
    case "item add": return run("item-add", { title: one(flags, "title") ?? "", doneMeans: one(flags, "done-means") ?? null });
    case "item set": return run("item-set", { n, status, ask: one(flags, "ask"), options: flags.get("option"), waitingOn: one(flags, "waiting-on"), comment: one(flags, "comment") });
    case "item comment": return run("item-set", { n, comment: text(flags, "text") ?? "" });
    case "item done": return run("item-set", { n, status: "done" });
    case "item cancel": return run("item-set", { n, status: "canceled", comment: one(flags, "reason") });
    case "automation create": return run("automation-create", { name: one(flags, "name") ?? "", prompt: text(flags, "prompt") ?? "", schedule: one(flags, "cron") ?? one(flags, "rrule") ?? "", timezone: one(flags, "timezone") ?? null, once: flags.has("once") });
    case "automation list": return run("automation-list");
    case "automation remove": return run("automation-remove", { id: target });
    case "pane list": return run("pane-list");
    case "pane read": return run("pane-read", { id: target, lines: Number(one(flags, "lines") ?? 80) });
    case "pane notes": return run("pane-notes", { id: target });
    case "pane send": return run("pane-send", { id: target, text: text(flags, "text") ?? "" });
    case "pane keys": return run("pane-keys", { id: target, keys: words.slice(3) });
    case "pane close": return run("pane-close", { id: target });
    case "workspace open": return run("workspace-open", { cwd: one(flags, "cwd") ?? "", agent: one(flags, "agent") ?? null, label: one(flags, "label") ?? null, prompt: text(flags, "prompt") ?? null });
    default:
      console.error(USAGE);
      process.exitCode = 2;
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`tw-bot: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
