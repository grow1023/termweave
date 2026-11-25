import { afterEach, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { trustClaudeFolder, trustCodexFolder } from "./trust.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "tw-trust-")); dirs.push(dir); return dir; };

it("marks a Claude folder trusted and keeps the rest of .claude.json", async () => {
  const file = join(temp(), ".claude.json");
  writeFileSync(file, JSON.stringify({ oauthAccount: { a: 1 }, projects: { "/x/bot": { allowedTools: ["Bash"] }, "/y": { hasTrustDialogAccepted: false } } }));
  expect(await trustClaudeFolder("/x/bot/", file)).toBe("granted");
  const config = JSON.parse(readFileSync(file, "utf8"));
  expect(config.oauthAccount).toEqual({ a: 1 });
  expect(config.projects["/x/bot"]).toEqual({ allowedTools: ["Bash"], hasTrustDialogAccepted: true });
  expect(config.projects["/y"]).toEqual({ hasTrustDialogAccepted: false });
  expect(await trustClaudeFolder("/x/bot", file)).toBe("unchanged");
  expect(existsSync(`${file}.lock`)).toBe(false);
});

it("leaves a missing, broken or locked Claude config alone", async () => {
  const dir = temp();
  expect(await trustClaudeFolder("/x", join(dir, "none.json"))).toBe("missing-config");
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{nope");
  expect(await trustClaudeFolder("/x", broken)).toBe("unreadable");
  expect(readFileSync(broken, "utf8")).toBe("{nope");
  const held = join(dir, "held.json");
  writeFileSync(held, "{}");
  mkdirSync(`${held}.lock`);
  expect(await trustClaudeFolder("/x", held)).toBe("locked");
  expect(readFileSync(held, "utf8")).toBe("{}");
});

it("adds a trusted Codex project table once", async () => {
  const file = join(temp(), "config.toml");
  writeFileSync(file, 'model = "gpt"\n[projects."/z"]\ntrust_level = "untrusted"');
  expect(await trustCodexFolder("/w/worker", file)).toBe("granted");
  expect(readFileSync(file, "utf8")).toBe('model = "gpt"\n[projects."/z"]\ntrust_level = "untrusted"\n\n[projects."/w/worker"]\ntrust_level = "trusted"\n');
  expect(await trustCodexFolder("/w/worker", file)).toBe("unchanged");
  expect(await trustCodexFolder("/z", file)).toBe("unchanged");
});
