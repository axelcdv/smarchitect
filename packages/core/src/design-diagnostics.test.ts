import { describe, expect, it } from "vitest";
import {
  ProjectWorkspace,
  type EntityKind,
  type FurnitureDefinition,
  type IdFactory
} from "./index.js";

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

  it("traverses inactive Plans for machine diagnostics while scoping GUI diagnostics", () => {
    let workspace = ProjectWorkspace.create("All plans", { idFactory: ids() })
      .addRoomLabel({ name: "Proposal-only warning", position: { x: 100, y: 100 } })
      .createDesignProposal("Alternative");
    const proposalLabelId = workspace.activeLevel.roomLabels[0]!.id;
    workspace = workspace.selectExistingState().deleteRoomLabel(proposalLabelId);

    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "room-label.outside-room",
      path: "/designProposals/0/levels/0/roomLabels/0/position"
    }));
    expect(workspace.activeDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "room-label.outside-room" })
    ]));
  });
});
