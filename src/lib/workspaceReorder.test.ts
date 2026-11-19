import { describe, expect, test } from "bun:test";
import { EDGE_SCROLL_MAX, workspaceDragBounds, workspaceEdgeStep, workspaceEdgeVelocity, workspaceInsertion, workspaceScrollStep, workspaceSlots, type WorkspaceBox } from "./workspaceReorder.ts";

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
  test("edge scrolling runs on time, not frames: a 120Hz screen scrolls no faster than a 60Hz one", () => {
    const at60 = 60 * workspaceEdgeStep(100, 36, 1000 / 60);
    const at120 = 120 * workspaceEdgeStep(100, 36, 1000 / 120);
    expect(at60).toBeCloseTo(EDGE_SCROLL_MAX, 6);
    expect(at120).toBeCloseTo(at60, 6);
    // eased in: halfway into the band scrolls a quarter as fast, outside it nothing
    expect(workspaceEdgeStep(18, 36, 20)).toBeCloseTo(EDGE_SCROLL_MAX / 4 * 0.02, 6);
    expect(workspaceEdgeStep(0, 36, 16)).toBe(0);
    // the first frame (no previous time) and a stalled one never jump
    expect(workspaceEdgeStep(100, 36, 0)).toBe(0);
    expect(workspaceEdgeStep(100, 36, 5000)).toBe(EDGE_SCROLL_MAX * 50 / 1000);
  });
});
