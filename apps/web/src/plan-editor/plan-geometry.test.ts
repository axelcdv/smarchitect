import { describe, expect, it } from "vitest";
import { ProjectWorkspace, type Wall } from "@smarchitect/core";
import {
  moveWallForDrag,
  planPolygonPoints,
  wallPolygonPoints,
  wallSurfacePath
} from "./plan-geometry.js";

const horizontalWall: Wall = {
  id: "wall-1",
  path: {
    kind: "straight",
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 }
  },
  thicknessMm: 200,
  heightMm: 2500,
  extensions: {}
};

describe("plan geometry formatting", () => {
  it("serializes model points into the SVG coordinate system", () => {
    expect(planPolygonPoints([
      { x: 10, y: 20 },
      { x: -30, y: -40 }
    ])).toBe("10,-20 -30,40");
  });

  it("serializes a Wall's derived face polygon", () => {
    expect(wallPolygonPoints(horizontalWall))
      .toBe("0,-100 1000,-100 1000,100 0,100");
  });

  it("combines Wall faces into one SVG path", () => {
    expect(wallSurfacePath([horizontalWall]))
      .toBe("M 0 -100 L 1000 -100 L 1000 100 L 0 100 Z");
  });

  it("derives a non-durable wall-drag preview from the supplied workspace", () => {
    const workspace = ProjectWorkspace.create("Drag preview").addWall({
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 }
    });
    const wallId = workspace.activeLevel.walls[0]!.id;

    const preview = moveWallForDrag(
      workspace,
      wallId,
      { x: 500, y: 0 },
      { x: 650, y: 200 },
      10
    );

    expect(preview).not.toBe(workspace);
    expect(preview.activeLevel.walls[0]!.path).toMatchObject({
      start: { x: 150, y: 200 },
      end: { x: 1150, y: 200 }
    });
    expect(workspace.activeLevel.walls[0]!.path).toMatchObject({
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 }
    });
  });

  it("reuses the workspace when a wall drag has no effective delta", () => {
    const workspace = ProjectWorkspace.create("No drag").addWall({
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 }
    });

    expect(moveWallForDrag(
      workspace,
      workspace.activeLevel.walls[0]!.id,
      { x: 500, y: 0 },
      { x: 500, y: 0 },
      10
    )).toBe(workspace);
  });
});
