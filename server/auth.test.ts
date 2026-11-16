import { expect, test } from "bun:test";
import { isBridgePath } from "./auth.ts";

test("a PC's bridge token reaches the session, panes, workspaces, files and host status, and nothing of this server's own", () => {
  for (const path of ["/api/bridge", "/api/session", "/api/agents", "/api/host-status", "/api/pane/split", "/api/pane/input", "/api/workspace/create", "/api/fs/stat", "/ws"]) expect([path, isBridgePath(path)]).toEqual([path, true]);
  for (const path of ["/api/machines", "/api/machines/setup", "/api/devices", "/api/devices/pair", "/api/push/subscribe", "/api/auth", "/api/settings", "/api/host-status/x", "/api/panes", "/"]) expect([path, isBridgePath(path)]).toEqual([path, false]);
});
