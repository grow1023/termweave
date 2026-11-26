// TermWeave's own dev-only fixtures for the tool rows (SPEC 5.0, 5.4): synthetic blocks shaped like a
// Claude session as the WP1 adapter emits them. Not real transcript data; no user content.
import type { NativeChatBlock, NativeChatToolCallBlock, NativeChatToolResultBlock, ToolRunProps } from "../shared/index.ts";

export function call(callId: string, name: string, input: Record<string, unknown>, summary = ""): NativeChatToolCallBlock {
  return { type: "tool-call", callId, name, input, summary };
}

export function result(callId: string, output: string, extra: Partial<NativeChatToolResultBlock> = {}): NativeChatToolResultBlock {
  return { type: "tool-result", callId, output, ...extra };
}

const todos = (statuses: readonly string[]) => ({
  todos: [
    { content: "Write the adapter", activeForm: "Writing the adapter", status: statuses[0] },
    { content: "Port the tool rows", activeForm: "Porting the tool rows", status: statuses[1] },
    { content: "Run the checks", activeForm: "Running the checks", status: statuses[2] },
  ],
});

export const FIXTURE_RUNS: Record<string, NativeChatBlock[]> = {
  threeReads: [
    call("r1", "Read", { file_path: "/repo/src/app/very/long/folder/structure/that/keeps/going/component.tsx" }),
    result("r1", "1\texport function Component() {}"),
    call("r2", "Read", { file_path: "/repo/src/lib/i18n.ts" }),
    result("r2", "export const x = 1"),
    call("r3", "Read", { file_path: "/repo/README.md" }),
    result("r3", "# Repo"),
  ],
  oneBash: [call("b1", "Bash", { command: "git status --short", description: "Show status" }), result("b1", " M package.json")],
  grepAndRead: [
    call("g1", "Grep", { pattern: "useDisclosure", path: "/repo/src" }),
    result("g1", "src/a.ts\nsrc/b.ts"),
    call("g2", "Read", { file_path: "/repo/src/a.ts" }),
    result("g2", "const a = 1"),
  ],
  oneEdit: [
    call("e1", "Edit", { file_path: "/repo/src/a.ts", old_string: "const a = 1\nconst b = 2", new_string: "const a = 1\nconst b = 3" }),
    result("e1", "The file /repo/src/a.ts has been updated."),
  ],
  failedBash: [call("f1", "Bash", { command: "bun test" }), result("f1", "error: 2 tests failed", { isError: true })],
  mcp: [call("m1", "mcp__claude-in-chrome__read_page", { tabId: 1 }), result("m1", "<page text>")],
  todoUpdate: [call("t2", "TodoWrite", todos(["completed", "in_progress", "pending"])), result("t2", "Todos have been modified successfully.")],
  cutOutput: [
    call("c1", "Bash", { command: "cat big.log" }),
    result("c1", "line\n".repeat(900), { fullOutputRef: "ref-c1", outputSize: 120_000 }),
  ],
  liveRead: [call("l1", "Read", { file_path: "/repo/src/a.ts" }), result("l1", "a"), call("l2", "Bash", { command: "bun run build" })],
};

/** The TodoWrite call before `todoUpdate`, for the task diff. */
export const FIXTURE_PREVIOUS_TODO = call("t1", "TodoWrite", todos(["in_progress", "pending", "pending"]));

/** Props for one fixture run; the loader answers after a short wait, or fails for ref "fail". */
export function fixtureRunProps(name: keyof typeof FIXTURE_RUNS, live = false): ToolRunProps {
  return {
    blocks: FIXTURE_RUNS[name] ?? [],
    live,
    followsProse: true,
    disclosureId: `fixture:${name}`,
    previousTodoWrite: name === "todoUpdate" ? FIXTURE_PREVIOUS_TODO : undefined,
    loadFullOutput: (ref) =>
      ref === "fail" ? Promise.reject(new Error("output_not_found")) : Promise.resolve("line\n".repeat(24_000)),
  };
}
