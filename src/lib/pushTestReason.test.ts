import { describe, expect, test } from "bun:test";
import { ApiError } from "./api.ts";
import { pushFailureReason } from "./pushTestReason.ts";

describe("pushFailureReason", () => {
  test("an API error gives its status and the server's detail, not the URL", () => {
    expect(pushFailureReason(new ApiError("/api/push/test", 502, "Test failure", "push_failed"))).toBe("502 Test failure");
  });
  test("another error gives its message", () => {
    expect(pushFailureReason(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
  });
  test("an unknown value gives nothing, so the caller shows its general text", () => {
    expect(pushFailureReason(undefined)).toBe("");
  });
  test("a long detail is cut", () => {
    const reason = pushFailureReason(new Error("x".repeat(400)));
    expect(reason.length).toBe(160);
    expect(reason.endsWith("…")).toBe(true);
  });
});
