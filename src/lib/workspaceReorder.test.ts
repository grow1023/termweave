import { describe, expect, test } from "bun:test";
import { workspaceDragBounds, workspaceEdgeVelocity, workspaceInsertion, workspaceScrollStep, workspaceSlots, type WorkspaceBox } from "./workspaceReorder.ts";

const boxes: WorkspaceBox[] = [{ id: "a", top: 8, height: 80, gap: 8 },
  { id: "b", top: 96, height: 200, gap: 8 }, { id: "c", top: 304, height: 40, gap: 8 }];
describe("measured workspace preview", () => {
  test("variable heights displace exactly one lifted footprint", () => {
    expect([...workspaceSlots(boxes, "a", 2)]).toEqual([["b", 8], ["c", 216], ["a", 264]]);
    expect([...workspaceSlots(boxes, "c", 0)]).toEqual([["c", 8], ["a", 56], ["b", 144]]);
    expect(boxes[0]!.top).toBe(8);
  });
  test("midpoints resist jitter within the eight-pixel reversal band", () => {
    expect(workspaceInsertion(boxes, "a", 115, 0)).toBe(0);
    expect(workspaceInsertion(boxes, "a", 117, 0)).toBe(1);
    expect(workspaceInsertion(boxes, "a", 101, 1)).toBe(1);
    expect(workspaceInsertion(boxes, "a", 99, 1)).toBe(0);
    expect(workspaceInsertion(boxes, "a", 1000, 0)).toBe(2);
    expect(workspaceInsertion(boxes, "a", -100, 2)).toBe(0);
  });
});

describe("a drag stays inside its list", () => {
  test("the dragged section moves between the first slot and the last, whatever its height", () => {
    expect(workspaceDragBounds(boxes, "a")).toEqual({ min: 0, max: 256 });
    expect(workspaceDragBounds(boxes, "b")).toEqual({ min: -88, max: 48 });
    expect(workspaceDragBounds(boxes, "c")).toEqual({ min: -296, max: 0 });
    expect(workspaceDragBounds(boxes, "missing")).toEqual({ min: 0, max: 0 });
    expect(workspaceDragBounds([], "a")).toEqual({ min: 0, max: 0 });
  });
  test("edge scrolling stops at the list's own content: held at the edge it never runs on", () => {
    let top = 150;
    for (let frame = 0; frame < 200; frame++) top = workspaceScrollStep(top, 12, 157);
    expect(top).toBe(157);
    for (let frame = 0; frame < 200; frame++) top = workspaceScrollStep(top, -12, 157);
    expect(top).toBe(0);
    // a list that fits has nothing to scroll
    expect(workspaceScrollStep(0, 12, 0)).toBe(0);
    expect(workspaceScrollStep(40, 0, 157)).toBe(40);
  });
  test("edge scrolling stops once the section cannot move further that way: it stays under the pointer", () => {
    const bounds = { min: -88, max: 48 };
    // at the last slot, scrolling on would carry the section away from the pointer
    expect(workspaceEdgeVelocity(12, 48, bounds)).toBe(0);
    expect(workspaceEdgeVelocity(-12, -88, bounds)).toBe(0);
    // short of the bound, or scrolling back, the edge still scrolls
    expect(workspaceEdgeVelocity(12, 20, bounds)).toBe(12);
    expect(workspaceEdgeVelocity(-12, 48, bounds)).toBe(-12);
    expect(workspaceEdgeVelocity(12, -88, bounds)).toBe(12);
    expect(workspaceEdgeVelocity(0, 48, bounds)).toBe(0);
    // the last step scrolls only the room left, so the section stops exactly at the pointer
    expect(workspaceEdgeVelocity(12, 44, bounds)).toBe(4);
    expect(workspaceEdgeVelocity(-12, -80, bounds)).toBe(-8);
  });
});
