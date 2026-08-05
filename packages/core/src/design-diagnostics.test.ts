import { describe, expect, it } from "vitest";
import {
  ProjectWorkspace,
  type EntityKind,
  type FurnitureDefinition,
  type IdFactory,
  type Level
} from "./index.js";
import { designDiagnostics } from "./design-diagnostics.js";

function ids(): IdFactory {
  let sequence = 0;
  return (kind: EntityKind) =>
    `${kind}_00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
}

const table: FurnitureDefinition = {
  id: "furniture_definition_00000000-0000-4000-8000-000000000100",
  name: "Table",
  widthMm: 1000,
  depthMm: 1000,
  heightMm: 750,
  extensions: {}
};

describe("advisory design diagnostics", () => {
  it("reports stable, navigable warnings for Wall and Placement overlaps", () => {
    const workspace = ProjectWorkspace.create("Warnings", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } })
      .placeFurniture(table, { position: { x: 500, y: 0 } })
      .placeFurniture(table, { position: { x: 900, y: 0 } });
    const [wall] = workspace.activeLevel.walls;
    const [first, second] = workspace.activeLevel.furniturePlacements!;

    expect(workspace.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "placement.wall-overlap",
        severity: "warning",
        affectedIds: [first!.id, wall!.id],
        focus: { kind: "furniture", id: first!.id }
      }),
      expect.objectContaining({
        code: "placement.overlap",
        severity: "warning",
        affectedIds: [first!.id, second!.id]
      })
    ]));
    expect(workspace.diagnostics.map(({ code, affectedIds }) => ({
      code,
      affectedIds
    }))).toEqual([
      { code: "placement.wall-overlap", affectedIds: [first!.id, wall!.id] },
      { code: "placement.wall-overlap", affectedIds: [second!.id, wall!.id] },
      { code: "placement.overlap", affectedIds: [first!.id, second!.id] }
    ]);
  });

  it("removes warnings after the conflicting placement is corrected", () => {
    const conflicting = ProjectWorkspace.create("Correction", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } })
      .placeFurniture(table, { position: { x: 500, y: 0 } });
    const placementId = conflicting.activeLevel.furniturePlacements![0]!.id;

    expect(conflicting.diagnostics.some(({ severity }) => severity === "warning"))
      .toBe(true);
    expect(conflicting.updateFurniturePlacement(placementId, {
      position: { x: 500, y: 1500 }
    }).diagnostics).toEqual([]);
  });

  it("reports an obstructed Door without rejecting the Project Document", () => {
    let workspace = ProjectWorkspace.create("Door", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } });
    const wallId = workspace.activeLevel.walls[0]!.id;
    workspace = workspace.addOpening({
      kind: "door",
      hostWallId: wallId,
      positionMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    }).placeFurniture(table, { position: { x: 1450, y: 500 } });
    const door = workspace.activeLevel.openings[0]!;
    const placement = workspace.activeLevel.furniturePlacements![0]!;

    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "door.obstructed",
      severity: "warning",
      affectedIds: [door.id, placement.id],
      focus: { kind: "opening", id: door.id }
    }));
    expect(() => ProjectWorkspace.importYaml(workspace.exportYaml())).not.toThrow();
  });

  it("checks hinged Door clearance only on its configured swing side", () => {
    const workspaceFor = (swingDirection: "inward" | "outward", y: number) => {
      let workspace = ProjectWorkspace.create("Door swing", { idFactory: ids() })
        .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } });
      return workspace.addOpening({
        kind: "door",
        hostWallId: workspace.activeLevel.walls[0]!.id,
        positionMm: 1000,
        widthMm: 900,
        heightMm: 2100,
        operation: { kind: "hinged", hingeSide: "end", swingDirection }
      }).placeFurniture(table, { position: { x: 1450, y } });
    };

    expect(workspaceFor("inward", 1000).diagnostics).toContainEqual(
      expect.objectContaining({ code: "door.obstructed" })
    );
    expect(workspaceFor("inward", -1000).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "door.obstructed" })
    );
    expect(workspaceFor("outward", -1000).diagnostics).toContainEqual(
      expect.objectContaining({ code: "door.obstructed" })
    );
    expect(workspaceFor("outward", 1000).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "door.obstructed" })
    );
  });

  it("uses a doorway access zone instead of a swing envelope for sliding Doors", () => {
    let workspace = ProjectWorkspace.create("Sliding Door", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } });
    workspace = workspace.addOpening({
      kind: "door",
      hostWallId: workspace.activeLevel.walls[0]!.id,
      positionMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      operation: { kind: "sliding", slideDirection: "end" }
    });

    expect(workspace.placeFurniture(table, { position: { x: 1450, y: 1000 } }).diagnostics)
      .not.toContainEqual(expect.objectContaining({ code: "door.obstructed" }));
    expect(workspace.placeFurniture(table, { position: { x: 1450, y: 100 } }).diagnostics)
      .toContainEqual(expect.objectContaining({ code: "door.obstructed" }));
  });

  it("reports non-host Walls that block a Door clearance footprint on its swing side", () => {
    let workspace = ProjectWorkspace.create("Wall-blocked Door", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } });
    const hostWallId = workspace.activeLevel.walls[0]!.id;
    workspace = workspace
      .addWall({ start: { x: 0, y: 500 }, end: { x: 4000, y: 500 } })
      .addWall({ start: { x: 0, y: -500 }, end: { x: 4000, y: -500 } })
      .addOpening({
        kind: "door",
        hostWallId,
        positionMm: 1000,
        widthMm: 900,
        heightMm: 2100,
        operation: {
          kind: "hinged",
          hingeSide: "start",
          swingDirection: "inward"
        }
      });
    const door = workspace.activeLevel.openings[0]!;
    const [blockingWall] = workspace.activeLevel.walls.slice(1);

    expect(workspace.diagnostics.filter(({ code }) => code === "door.obstructed"))
      .toEqual([expect.objectContaining({
        affectedIds: [door.id, blockingWall!.id]
      })]);
  });

  it("does not report a Door obstructed by a Placement entirely below the floor", () => {
    let workspace = ProjectWorkspace.create("Below-floor table", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } });
    workspace = workspace.addOpening({
      kind: "door",
      hostWallId: workspace.activeLevel.walls[0]!.id,
      positionMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    }).placeFurniture(table, {
      position: { x: 1450, y: 500 },
      elevationMm: -1000
    });

    expect(workspace.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "door.obstructed" })
    ]));
  });

  it("bounds overlap diagnostics across the documented 500/500/2,000 fixture", () => {
    const walls = Array.from({ length: 500 }, (_, index) => ({
      id: `wall_${String(index).padStart(4, "0")}`,
      path: {
        start: { x: 100_000 + index * 10_000, y: 0 },
        end: { x: 104_000 + index * 10_000, y: 0 }
      },
      thicknessMm: 100,
      heightMm: 2500,
      extensions: {}
    }));
    const level: Level = {
      id: "level_fixture",
      name: "Performance fixture",
      baseElevationMm: 0,
      defaultWallHeightMm: 2500,
      walls,
      openings: walls.map((wall, index) => ({
        id: `opening_${String(index).padStart(4, "0")}`,
        kind: "window" as const,
        hostWallId: wall.id,
        positionMm: 1000,
        widthMm: 900,
        heightMm: 1200,
        sillHeightMm: 900,
        extensions: {}
      })),
      roomLabels: [],
      furniturePlacements: Array.from({ length: 2000 }, (_, index) => ({
        id: `placement_${String(index).padStart(4, "0")}`,
        definitionId: table.id,
        position: { x: 0, y: 0 },
        rotationDeg: 0,
        elevationMm: 0,
        extensions: {}
      })),
      fixturePlacements: [],
      extensions: {}
    };
    const startedAt = performance.now();
    const diagnostics = designDiagnostics(level, [table], [], {
      pathPrefix: "",
      levelIndex: 0
    });
    const elapsedMs = performance.now() - startedAt;
    const overlaps = diagnostics.filter(({ code }) => code === "placement.overlap");

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.affectedIds).toHaveLength(2000);
    expect(elapsedMs).toBeLessThan(250);
  });

  it("warns about a likely open enclosure without making edits invalid", () => {
    const workspace = ProjectWorkspace.create("Open room", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } })
      .addWall({ start: { x: 3000, y: 0 }, end: { x: 3000, y: 3000 } })
      .addWall({ start: { x: 3000, y: 3000 }, end: { x: 0, y: 3000 } });

    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "room.enclosure.open",
      severity: "warning",
      affectedIds: workspace.activeLevel.walls.map(({ id }) => id)
    }));
    expect(workspace.addWall({
      start: { x: 0, y: 3000 }, end: { x: 0, y: 0 }
    }).diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "room.enclosure.open" })
    ]));
  });

  it("reports a disconnected open enclosure beside a valid Room", () => {
    const workspace = ProjectWorkspace.create("Mixed rooms", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 2000, y: 0 } })
      .addWall({ start: { x: 2000, y: 0 }, end: { x: 2000, y: 2000 } })
      .addWall({ start: { x: 2000, y: 2000 }, end: { x: 0, y: 2000 } })
      .addWall({ start: { x: 0, y: 2000 }, end: { x: 0, y: 0 } })
      .addWall({ start: { x: 4000, y: 0 }, end: { x: 6000, y: 0 } })
      .addWall({ start: { x: 6000, y: 0 }, end: { x: 6000, y: 2000 } })
      .addWall({ start: { x: 6000, y: 2000 }, end: { x: 4000, y: 2000 } });
    const openWallIds = workspace.activeLevel.walls.slice(4).map(({ id }) => id);

    expect(workspace.rooms).toHaveLength(1);
    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "room.enclosure.open",
      affectedIds: openWallIds
    }));
  });

  it("navigates project-wide diagnostics to their Plan, Level, and stable entity", () => {
    let workspace = ProjectWorkspace.create("All plans", { idFactory: ids() })
      .addRoomLabel({ name: "Proposal-only warning", position: { x: 100, y: 100 } })
      .createDesignProposal("Alternative");
    const proposalLabelId = workspace.activeLevel.roomLabels[0]!.id;
    workspace = workspace.selectExistingState().deleteRoomLabel(proposalLabelId);

    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "room-label.outside-room",
      path: "/designProposals/0/levels/0/roomLabels/0/position"
    }));
    const diagnostic = workspace.diagnostics.find(
      ({ code }) => code === "room-label.outside-room"
    )!;
    const focused = workspace.navigateToDiagnostic(diagnostic);

    expect(focused.activePlanSelection).toEqual({
      kind: "design-proposal",
      proposalId: focused.document.designProposals![0]!.id
    });
    expect(focused.activeLevel.id).toBe(focused.activeDesignProposal!.levels[0]!.id);
    expect(focused.activeDiagnostics).toContainEqual(diagnostic);
  });
});
