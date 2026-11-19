import { describe, expect, it } from "bun:test";
import { PRODUCT_VERSION } from "../shared/product.ts";
import { isNewer, ownedUpdater } from "./owned-updater.ts";

describe("owned updater", () => {
  it("compares release tags as numbers", () => {
    expect(isNewer("v0.3.40", "0.3.39")).toBe(true);
    expect(isNewer("v0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("v0.3.39", "0.3.39")).toBe(false);
    expect(isNewer("v0.3.38", "0.3.39")).toBe(false);
    expect(isNewer("remote-v1.0.0", "0.3.39")).toBe(false);
  });
  it("offers the latest GitHub release when it is newer, and reports a failed check", async () => {
    const [major, minor, patch] = PRODUCT_VERSION.split(".").map(Number);
    const next = `v${major}.${minor}.${patch! + 1}`;
    const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const updater = ownedUpdater("/nowhere", reply({ tag_name: next, body: "- 새 기능" + "x".repeat(9000) }));
    updater.request("check"); await Bun.sleep(10);
    expect(updater.status()).toMatchObject({ managed: true, available: true, latest_version: next.slice(1), phase: "idle" });
    // the release notes come along, bounded
    expect(updater.status().latest_notes).toStartWith("- 새 기능");
    expect(updater.status().latest_notes).toHaveLength(8000);
    const down = ownedUpdater("/nowhere", reply({}, 503));
    down.request("check"); await Bun.sleep(10);
    expect(down.status()).toMatchObject({ available: false, phase: "error" });
    expect(down.status().latest_notes ?? null).toBeNull();
    updater.stop(); down.stop();
  });
  it("asks again with the ETag, keeps the answer on 304, and names the rate limit's reset", async () => {
    const [major, minor, patch] = PRODUCT_VERSION.split(".").map(Number);
    const next = `v${major}.${minor}.${patch! + 1}`;
    const sent: (string | null)[] = [];
    const replies = [
      new Response(JSON.stringify({ tag_name: next, body: "notes" }), { status: 200, headers: { etag: '"abc"' } }),
      new Response(null, { status: 304 }),
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" } }),
    ];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get("if-none-match"));
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const updater = ownedUpdater("/nowhere", fetcher);
    updater.request("check"); await Bun.sleep(10);
    updater.request("check"); await Bun.sleep(10);
    // 304: GitHub does not count it, and the release found before still stands
    expect(sent).toEqual([null, '"abc"']);
    expect(updater.status()).toMatchObject({ phase: "idle", available: true, latest_version: next.slice(1), latest_notes: "notes" });
    updater.request("check"); await Bun.sleep(10);
    expect(updater.status().phase).toBe("error");
    expect(updater.status().error).toContain("rate limit");
    expect(updater.status().error).toContain(new Date(1800000000 * 1000).toISOString().slice(0, 16));
    // the release found before is not forgotten while GitHub refuses
    expect(updater.status().latest_version).toBe(next.slice(1));
    updater.stop();
  });
});
