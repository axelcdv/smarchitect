import { describe, expect, it } from "vitest";
import type { Wall } from "@smarchitect/core";
import {
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
});
