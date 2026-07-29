import { describe, expect, it } from "vitest";
import {
  deriveWallFaces,
  deriveWallJunctions,
  findWallAtPoint,
  findWallEndpointAtPoint,
  normalizeAngleDeg,
  snapWallDelta,
  snapPoint,
  type Wall
} from "./index.js";

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  thicknessMm = 200
): Wall {
  return {
    id,
    path: {
      kind: "straight",
      start: { x: start[0], y: start[1] },
      end: { x: end[0], y: end[1] }
    },
    thicknessMm,
    heightMm: 2500,
    extensions: {}
  };
}

describe("wall geometry", () => {
  it("derives physical faces for an arbitrary-angle centreline", () => {
    expect(deriveWallFaces(wall("wall_a", [0, 0], [3000, 4000]))).toEqual([
      { x: -80, y: 60 },
      { x: 2920, y: 4060 },
      { x: 3080, y: 3940 },
      { x: 80, y: -60 }
    ]);
  });

  it("derives deterministic endpoint, T, and crossing junctions", () => {
    const walls = [
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [2000, 0], [2000, 2000]),
      wall("wall_c", [4000, 0], [4000, 2000]),
      wall("wall_d", [1000, -1000], [1000, 1000])
    ];

    expect(deriveWallJunctions(walls)).toEqual([
      { point: { x: 1000, y: 0 }, wallIds: ["wall_a", "wall_d"] },
      { point: { x: 2000, y: 0 }, wallIds: ["wall_a", "wall_b"] },
      { point: { x: 4000, y: 0 }, wallIds: ["wall_a", "wall_c"] }
    ]);
  });

  it("derives collinear endpoint-on-path contacts", () => {
    expect(deriveWallJunctions([
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [1000, 0], [2000, 0])
    ])).toEqual([
      { point: { x: 1000, y: 0 }, wallIds: ["wall_a", "wall_b"] },
      { point: { x: 2000, y: 0 }, wallIds: ["wall_a", "wall_b"] }
    ]);
  });

  it("keeps near contacts distinct and snaps exact endpoints/intersections", () => {
    const walls = [
      wall("wall_a", [0, 0], [3000, 0]),
      wall("wall_b", [1500, -1000], [1500, 1000])
    ];

    expect(deriveWallJunctions([
      walls[0]!,
      wall("wall_near", [3001, 0], [4000, 0])
    ])).toEqual([]);
    expect(snapPoint({ x: 1492, y: 6 }, walls, 10)).toEqual({
      x: 1500,
      y: 0
    });
  });

  it("hit-tests Wall faces and endpoint handles in the shared core", () => {
    const walls = [wall("wall_a", [0, 0], [3000, 0], 200)];

    expect(findWallAtPoint({ x: 1500, y: 90 }, walls)?.id).toBe("wall_a");
    expect(findWallAtPoint({ x: 1500, y: 101 }, walls)).toBeUndefined();
    expect(findWallEndpointAtPoint({ x: 8, y: -6 }, walls, 10)).toEqual({
      wallId: "wall_a",
      endpoint: "start"
    });
  });

  it("snaps whole-Wall movement to exact endpoint contacts", () => {
    const moving = wall("wall_moving", [0, 0], [1000, 0]);
    const fixed = wall("wall_fixed", [2010, 0], [3000, 0]);

    expect(snapWallDelta(moving, { x: 1005, y: 4 }, [fixed], 10)).toEqual({
      x: 1010,
      y: 0
    });
  });

  it("normalizes arbitrary angles to the canonical range", () => {
    expect(normalizeAngleDeg(-306.87)).toBeCloseTo(53.13);
    expect(normalizeAngleDeg(413.13)).toBeCloseTo(53.13);
  });
});
