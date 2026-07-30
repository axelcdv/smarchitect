import { describe, expect, it } from "vitest";
import {
  deriveOpeningPlanGeometry,
  distanceAlongWallPath,
  pointAlongWallPath,
  wallPathLength,
  type DoorOpening,
  type Wall
} from "./index.js";

const wall: Wall = {
  id: "wall_a",
  path: {
    kind: "straight",
    start: { x: 100, y: 200 },
    end: { x: 3100, y: 4200 }
  },
  thicknessMm: 200,
  heightMm: 2800,
  extensions: {}
};

describe("Opening geometry", () => {
  it("uses ordered Wall-path distance for projection and inverse projection", () => {
    expect(wallPathLength(wall)).toBe(5000);
    expect(pointAlongWallPath(wall, 2500)).toEqual({ x: 1600, y: 2200 });
    expect(distanceAlongWallPath(wall, { x: 1600, y: 2200 })).toBe(2500);
  });

  it("derives hinged and sliding symbol geometry in the shared core", () => {
    const hinged: DoorOpening = {
      id: "opening_a",
      kind: "door",
      hostWallId: wall.id,
      positionMm: 500,
      widthMm: 1000,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      },
      extensions: {}
    };
    const sliding: DoorOpening = {
      ...hinged,
      operation: { kind: "sliding", slideDirection: "end" }
    };

    expect(deriveOpeningPlanGeometry(hinged, wall)).toMatchObject({
      start: { x: 400, y: 600 },
      end: { x: 1000, y: 1400 },
      operationKind: "hinged",
      jambs: [],
      panes: [],
      slidingPanels: [],
      hinge: { x: 400, y: 600 },
      leafEnd: { x: -400, y: 1200 },
      swingArcStart: { x: 1000, y: 1400 },
      swingClockwise: true
    });
    expect(deriveOpeningPlanGeometry(sliding, wall).slideArrow).toBeDefined();
  });
});
