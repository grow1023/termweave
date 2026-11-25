import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Bot, BotAutomation, BotItem, BotsView, BotWorker } from "../../shared/bots/types.ts";

interface BotsFile extends BotsView {
  /** each bot's CLI secret: it never leaves the server and the bot's own home */
  secrets: Record<string, string>;
}

const EMPTY: BotsFile = { bots: [], items: [], automations: [], workers: [], secrets: {} };

/** Bots, their items, automations and workers, in one JSON file beside the server's other state. */
export class BotStore {
  private readonly file: string;
  private data: BotsFile;

  constructor(private readonly dir: string) {
    this.file = join(dir, "bots.json");
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<BotsFile>;
      this.data = {
        bots: Array.isArray(parsed.bots) ? parsed.bots : [],
        items: Array.isArray(parsed.items) ? parsed.items : [],
        automations: Array.isArray(parsed.automations) ? parsed.automations : [],
        workers: Array.isArray(parsed.workers) ? parsed.workers : [],
        secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {},
      };
    } catch { this.data = EMPTY; }
  }

  view(): BotsView {
    const { bots, items, automations, workers } = this.data;
    return { bots, items, automations, workers };
  }

  bot(id: string): Bot | undefined { return this.data.bots.find((bot) => bot.id === id); }
  botByPane(paneId: string): Bot | undefined { return this.data.bots.find((bot) => bot.paneId === paneId); }
  botBySecret(secret: string): Bot | undefined {
    const id = Object.entries(this.data.secrets).find(([, value]) => value === secret)?.[0];
    return id === undefined ? undefined : this.bot(id);
  }
  workerByPane(paneId: string): BotWorker | undefined {
    return this.data.workers.find((worker) => worker.paneId === paneId && (worker.status === "starting" || worker.status === "working" || worker.status === "blocked"));
  }
  item(botId: string, n: number): BotItem | undefined { return this.data.items.find((item) => item.botId === botId && item.n === n); }

  addBot(bot: Bot): string {
    const secret = randomBytes(24).toString("base64url");
    this.save({ ...this.data, bots: [...this.data.bots, bot], secrets: { ...this.data.secrets, [bot.id]: secret } });
    return secret;
  }
  secret(botId: string): string | undefined { return this.data.secrets[botId]; }
  updateBot(id: string, change: Partial<Bot>): Bot | undefined {
    return this.replace("bots", (bot) => bot.id === id, change);
  }
  removeBot(id: string): void {
    const { [id]: _, ...secrets } = this.data.secrets;
    this.save({
      bots: this.data.bots.filter((bot) => bot.id !== id),
      items: this.data.items.filter((item) => item.botId !== id),
      automations: this.data.automations.filter((automation) => automation.botId !== id),
      workers: this.data.workers.filter((worker) => worker.botId !== id),
      secrets,
    });
  }

  addItem(item: Omit<BotItem, "n">): BotItem {
    const n = 1 + Math.max(0, ...this.data.items.filter((other) => other.botId === item.botId).map((other) => other.n));
    const added = { ...item, n };
    this.save({ ...this.data, items: [...this.data.items, added] });
    return added;
  }
  updateItem(botId: string, n: number, change: Partial<BotItem>): BotItem | undefined {
    return this.replace("items", (item) => item.botId === botId && item.n === n, { ...change, updatedAt: new Date().toISOString() });
  }

  addAutomation(automation: BotAutomation): void { this.save({ ...this.data, automations: [...this.data.automations, automation] }); }
  updateAutomation(id: string, change: Partial<BotAutomation>): BotAutomation | undefined {
    return this.replace("automations", (automation) => automation.id === id, change);
  }
  removeAutomation(id: string): void { this.save({ ...this.data, automations: this.data.automations.filter((automation) => automation.id !== id) }); }

  addWorker(worker: BotWorker): void { this.save({ ...this.data, workers: [...this.data.workers, worker] }); }
  updateWorker(id: string, change: Partial<BotWorker>): BotWorker | undefined {
    return this.replace("workers", (worker) => worker.id === id, change);
  }

  private replace<K extends "bots" | "items" | "automations" | "workers">(
    key: K, match: (entry: BotsFile[K][number]) => boolean, change: Partial<BotsFile[K][number]>,
  ): BotsFile[K][number] | undefined {
    const list = this.data[key] as BotsFile[K][number][];
    const index = list.findIndex(match);
    if (index < 0) return undefined;
    const next = { ...list[index], ...change } as BotsFile[K][number];
    this.save({ ...this.data, [key]: list.map((entry, at) => (at === index ? next : entry)) });
    return next;
  }

  private save(next: BotsFile): void {
    this.data = next;
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(temp, this.file);
  }
}
