import { describe, expect, test } from "bun:test";
import { fitLabel, labelBaseline, labelWidth, layoutProjectGraph, PROJECT_RADIUS, SESSION_PITCH, SESSION_RADIUS } from "./fleetProjectGraph.ts";

const projects = (counts: number[]) => counts.map((sessions, index) => ({ key: "w" + index, sessions }));
const rimNodes = (layout: ReturnType<typeof layoutProjectGraph>) => layout.projects.flatMap((project) => [...project.sessions, ...(project.more ? [project.more] : [])]);
const closest = (points: ReadonlyArray<{ x: number; y: number }>) =>
  Math.min(...points.flatMap((a, i) => points.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));

describe("layoutProjectGraph", () => {
  test("gives every session its own place, inside the graph", () => {
    for (const width of [320, 375, 768, 1100]) {
      const counts = [1, 2, 3, 8, 1, 1, 4, 2];
      const layout = layoutProjectGraph(projects(counts), width);
      expect(layout.projects.map((project) => project.sessions.length + (project.more?.count ?? 0))).toEqual(counts);
      const nodes = rimNodes(layout);
      // chord, not arc: a little under the pitch on the tightest bend
      expect(closest(nodes)).toBeGreaterThan(SESSION_PITCH - 4);
      for (const point of [...nodes, ...layout.projects]) {
        expect(point.x).toBeGreaterThanOrEqual(11);
        expect(point.x).toBeLessThanOrEqual(width - 11);
        expect(point.y).toBeGreaterThanOrEqual(11);
        expect(point.y).toBeLessThanOrEqual(layout.height - 11);
      }
    }
  });

  test("no node covers another, from a 320 px phone to a desktop", () => {
    for (const width of [258, 313, 420, 690, 1136]) for (const counts of [[10, 2, 1, 1, 2, 3, 2, 1, 2, 1, 2, 1, 2, 1], [1, 1, 1, 1, 1, 1, 1, 1], [5, 5, 5, 5, 5], [2, 2]]) {
      const layout = layoutProjectGraph(projects(counts), width);
      // the hub's orbit ring is 29 px, as drawn in FleetProjectGraph.tsx
      const circles = [...layout.projects.map((project) => ({ ...project, r: PROJECT_RADIUS })), ...rimNodes(layout).map((node) => ({ ...node, r: SESSION_RADIUS })), { ...layout.center, r: 29 }];
      const overlaps = circles.flatMap((a, i) => circles.slice(i + 1).filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r));
      expect([width, counts.length, overlaps.length]).toEqual([width, counts.length, 0]);
    }
  });

  test("folds what does not fit into +N and still counts it", () => {
    const layout = layoutProjectGraph(projects([30, 30, 4]), 320);
    expect(layout.projects[0]!.more).not.toBeNull();
    expect(layout.projects.map((project) => project.sessions.length + (project.more?.count ?? 0))).toEqual([30, 30, 4]);
    expect(closest(rimNodes(layout))).toBeGreaterThan(SESSION_PITCH - 4);
  });

  test("keeps one project's sessions together", () => {
    const layout = layoutProjectGraph(projects([2]), 900);
    const [a, b] = layout.projects[0]!.sessions;
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeLessThan(70);
    expect(layout.projects[0]!.more).toBeNull();
  });

  test("a project name never covers another node, a session number or another name", () => {
    const names = ["보이드뉴스 사이트 작업", "TermWeave", "포트폴리오 2026 개편 프로젝트", "ICT-ACP", "강릉아산 AI 특강 교안", "motion-recipe-library"];
    const box = (at: { x: number; y: number }, radius: number, below: boolean, textWidth: number) => {
      const baseline = at.y + labelBaseline(radius, below);
      return { left: at.x - textWidth / 2, right: at.x + textWidth / 2, top: baseline - 10, bottom: baseline + 3 };
    };
    for (const width of [258, 313, 420, 690, 1136]) for (const counts of [[3, 2, 1, 4], [2, 2, 1, 1, 1, 3], [2, 1], [1, 2, 3, 8, 1, 1, 4, 2]]) {
      const layout = layoutProjectGraph(counts.map((sessions, index) => ({ key: "w" + index, sessions, label: names[index % names.length]! })), width);
      const named = layout.projects.filter((project) => project.label !== null);
      const nameBoxes = named.map((project) => box(project, PROJECT_RADIUS, project.labelBelow, labelWidth(project.label!, 10)));
      // a session's number is drawn 3 or 4 characters wide: 22 px at most
      const numberBoxes = layout.projects.flatMap((project) => project.sessions.map((spot) => box(spot, SESSION_RADIUS, spot.labelBelow, 22)));
      const circles = [{ ...layout.center, r: 22 }, ...layout.projects.map((project) => ({ x: project.x, y: project.y, r: PROJECT_RADIUS })), ...rimNodes(layout).map((node) => ({ x: node.x, y: node.y, r: SESSION_RADIUS }))];
      const covered = nameBoxes.flatMap((b, i) => circles.filter((c) => (c.x !== named[i]!.x || c.y !== named[i]!.y)
        && Math.hypot(c.x - Math.max(b.left, Math.min(c.x, b.right)), c.y - Math.max(b.top, Math.min(c.y, b.bottom))) < c.r));
      const crossed = nameBoxes.flatMap((a, i) => [...nameBoxes.slice(i + 1), ...numberBoxes].filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
      const outside = nameBoxes.filter((b) => b.left < 0 || b.right > width);
      expect([width, counts.length, covered.length, crossed.length, outside.length]).toEqual([width, counts.length, 0, 0, 0]);
      // hiding is the last resort: a desktop graph has room for every name
      if (width >= 690) expect([width, counts.length, named.length]).toEqual([width, counts.length, counts.length]);
    }
  });

  test("cuts a name by its drawn width, so a Korean name is not twice as wide as a Latin one", () => {
    const cut = fitLabel("포트폴리오 2026 개편 프로젝트", 60, 10);
    expect(cut.endsWith("…")).toBe(true);
    expect(labelWidth(cut, 10)).toBeLessThanOrEqual(60);
    expect(fitLabel("TermWeave", 60, 10)).toBe("TermWeave");
    expect(layoutProjectGraph([{ key: "w", sessions: 1 }], 600).projects[0]!.label).toBeNull();
  });

  test("an empty PC is just the hub", () => {
    expect(layoutProjectGraph([], 600).projects).toEqual([]);
  });
});
