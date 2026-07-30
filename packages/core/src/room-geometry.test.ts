import { describe, expect, it } from "vitest";
import {
  deriveRooms,
  findRoomContainingPoint,
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

describe("Room geometry", () => {
  it("derives the usable region and dimensions from physical Wall faces", () => {
    const rooms = deriveRooms([
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [4000, 0], [4000, 3000]),
      wall("wall_c", [4000, 3000], [0, 3000]),
      wall("wall_d", [0, 3000], [0, 0])
    ]);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      areaMm2: 10_640_000,
      dimensionsMm: { width: 3800, depth: 2800 },
      wallIds: ["wall_a", "wall_b", "wall_c", "wall_d"]
    });
    expect(rooms[0]!.boundary).toEqual([
      { x: 100, y: 100 },
      { x: 3900, y: 100 },
      { x: 3900, y: 2900 },
      { x: 100, y: 2900 }
    ]);
  });

  it("derives concave and angled Rooms deterministically", () => {
    const concave = [
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [4000, 0], [4000, 2000]),
      wall("wall_c", [4000, 2000], [2000, 2000]),
      wall("wall_d", [2000, 2000], [2000, 4000]),
      wall("wall_e", [2000, 4000], [0, 4000]),
      wall("wall_f", [0, 4000], [0, 0])
    ];
    const angled = [
      wall("wall_g", [0, 0], [3000, 0]),
      wall("wall_h", [3000, 0], [4000, 2000]),
      wall("wall_i", [4000, 2000], [0, 2000]),
      wall("wall_j", [0, 2000], [0, 0])
    ];

    expect(deriveRooms(concave)).toHaveLength(1);
    expect(deriveRooms(concave)[0]!.areaMm2).toBeCloseTo(10_440_000);
    expect(deriveRooms(angled)).toHaveLength(1);
    expect(deriveRooms(angled)[0]!.areaMm2).toBeGreaterThan(5_800_000);
    expect(deriveRooms([...angled].reverse())).toEqual(deriveRooms(angled));
  });

  it("does not infer Rooms from incomplete topology or a lone T-junction", () => {
    expect(deriveRooms([
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [4000, 0], [4000, 3000]),
      wall("wall_c", [4000, 3000], [0, 3000])
    ])).toEqual([]);
    expect(deriveRooms([
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [2000, 0], [2000, 2000])
    ])).toEqual([]);
  });

  it("splits an enclosure at T-junctions without producing a false extra Room", () => {
    const rooms = deriveRooms([
      wall("wall_a", [0, 0], [4000, 0]),
      wall("wall_b", [4000, 0], [4000, 3000]),
      wall("wall_c", [4000, 3000], [0, 3000]),
      wall("wall_d", [0, 3000], [0, 0]),
      wall("wall_e", [2000, 0], [2000, 3000])
    ]);

    expect(rooms).toHaveLength(2);
    expect(rooms.map(({ areaMm2 }) => areaMm2)).toEqual([
      5_040_000,
      5_040_000
    ]);
    expect(findRoomContainingPoint({ x: 1000, y: 1500 }, rooms)?.id)
      .not.toBe(findRoomContainingPoint({ x: 3000, y: 1500 }, rooms)?.id);
  });
});
