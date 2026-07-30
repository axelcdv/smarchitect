import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  ProjectWorkspace,
  createProjectDocument,
  parseProjectDocument,
  type EntityKind,
  type IdFactory,
  validateProjectDocument
} from "./index.js";

function deterministicIdFactory(): IdFactory {
  const next: Record<EntityKind, number> = {
    project: 1,
    level: 2,
    wall: 3,
    "room-label": 8
  };
  return (kind) => {
    const value = next[kind]++;
    return `${kind}_00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  };
}

describe("Project Workspace acceptance seam", () => {
  it("creates a valid metric project with one active Level", () => {
    const document = createProjectDocument("My renovation", {
      idFactory: deterministicIdFactory()
    });

    expect(document).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "project_00000000-0000-4000-8000-000000000001",
      name: "My renovation",
      units: "metric",
      activeLevelId: "level_00000000-0000-4000-8000-000000000002",
      levels: [
        {
          id: "level_00000000-0000-4000-8000-000000000002",
          name: "Ground floor",
          baseElevationMm: 0,
          defaultWallHeightMm: 2500,
          walls: [],
          roomLabels: [],
          extensions: {}
        }
      ],
      extensions: {}
    });
    expect(validateProjectDocument(document)).toEqual([]);
  });

  it("adds, edits, moves, and deletes straight Walls without measurement drift", () => {
    const workspace = ProjectWorkspace.create("Measured home", {
      idFactory: deterministicIdFactory()
    });
    const withWall = workspace.addWall({
      start: { x: 100, y: 200 },
      end: { x: 3100, y: 200 }
    });
    const wallId = withWall.activeLevel.walls[0]!.id;
    const edited = withWall.updateWall(wallId, {
      lengthMm: 2500,
      angleDeg: 90,
      thicknessMm: 180,
      heightMm: 2800
    });
    const moved = edited.moveWall(wallId, { x: 400, y: -100 });
    const repeated = moved.updateWall(wallId, {
      lengthMm: 2500,
      angleDeg: 90
    });

    expect(repeated.activeLevel.walls[0]).toMatchObject({
      path: {
        kind: "straight",
        start: { x: 500, y: 100 },
        end: { x: 500, y: 2600 }
      },
      thicknessMm: 180,
      heightMm: 2800
    });
    expect(repeated.exportYaml()).toContain("kind: straight");
    expect(repeated.deleteWall(wallId).activeLevel.walls).toEqual([]);
  });

  it("applies repeated decimal angle edits without accumulating drift", () => {
    const workspace = ProjectWorkspace.create("Angled home", {
      idFactory: deterministicIdFactory()
    }).addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    });
    const wallId = workspace.activeLevel.walls[0]!.id;

    const once = workspace.updateWall(wallId, { angleDeg: -306.87 });
    const repeated = once.updateWall(wallId, { angleDeg: 53.13 });

    expect(repeated.activeLevel.walls[0]!.path).toEqual(
      once.activeLevel.walls[0]!.path
    );
    expect(repeated.activeLevel.walls[0]!.path.end).toEqual({
      x: 1800,
      y: 2400
    });
  });

  it("renames, exports, and imports through one workspace boundary", () => {
    const workspace = ProjectWorkspace.create("My renovation", {
      idFactory: deterministicIdFactory()
    });

    const renamedWorkspace = workspace.rename("Kitchen and living room");
    const yaml = renamedWorkspace.exportYaml();
    const imported = ProjectWorkspace.importYaml(yaml);

    expect(yaml).toContain("name: Kitchen and living room");
    expect(imported.document).toEqual(renamedWorkspace.document);
    expect(imported.activeLevel.name).toBe("Ground floor");
    expect(imported.diagnostics).toEqual([]);
  });

  it("adds, names, moves, edits, and deletes durable Room Labels", () => {
    let workspace = ProjectWorkspace.create("Labelled home", {
      idFactory: deterministicIdFactory()
    });
    for (const [start, end] of [
      [[0, 0], [4000, 0]],
      [[4000, 0], [4000, 3000]],
      [[4000, 3000], [0, 3000]],
      [[0, 3000], [0, 0]]
    ] as const) {
      workspace = workspace.addWall({
        start: { x: start[0], y: start[1] },
        end: { x: end[0], y: end[1] }
      });
    }
    const labelled = workspace.addRoomLabel({
      name: "Kitchen",
      position: { x: 1000, y: 1500 }
    });
    const labelId = labelled.activeLevel.roomLabels[0]!.id;
    const edited = labelled.updateRoomLabel(labelId, { name: "Dining" });
    const moved = edited.moveRoomLabel(labelId, { x: 2000, y: 0 });

    expect(moved.activeLevel.roomLabels[0]).toMatchObject({
      name: "Dining",
      position: { x: 3000, y: 1500 }
    });
    expect(moved.rooms[0]!.labelIds).toEqual([labelId]);
    expect(moved.exportYaml()).not.toContain("boundary:");
    expect(moved.exportYaml()).not.toContain("areaMm2:");
    expect(ProjectWorkspace.importYaml(moved.exportYaml()).document)
      .toEqual(moved.document);
    expect(moved.deleteRoomLabel(labelId).activeLevel.roomLabels).toEqual([]);
  });

  it("preserves authored YAML comments, ordering, and extensions during Room Label mutations", () => {
    const source = `# authored project comment
name: Labelled home # keep project name comment
schemaVersion: 1.0.0
units: metric
id: project_00000000-0000-4000-8000-000000000001
levels:
  - name: Ground floor # keep level comment
    id: level_00000000-0000-4000-8000-000000000002
    roomLabels:
      - name: Kitchen # keep label comment
        id: room-label_00000000-0000-4000-8000-000000000008
        extensions:
          example.test:room-label:
            authored: true # keep extension comment
        position:
          y: 1200
          x: 1000
    walls: []
    extensions:
      example.test:level:
        preserved: yes
    defaultWallHeightMm: 2500
    baseElevationMm: 0
activeLevelId: level_00000000-0000-4000-8000-000000000002
extensions:
  example.test:project:
    preserved: yes
`;
    const imported = ProjectWorkspace.importYaml(source);
    const labelId = imported.activeLevel.roomLabels[0]!.id;
    const added = imported.addRoomLabel({
      name: "Dining",
      position: { x: 2000, y: 1200 }
    });
    const updated = added.updateRoomLabel(labelId, { name: "Cooking" });
    const moved = updated.moveRoomLabel(labelId, { x: 100, y: 200 });
    const addedId = added.activeLevel.roomLabels[1]!.id;
    const deleted = moved.deleteRoomLabel(addedId);
    const yaml = deleted.exportYaml();

    expect(yaml).toContain("# authored project comment");
    expect(yaml).toContain("# keep project name comment");
    expect(yaml).toContain("# keep level comment");
    expect(yaml).toContain("# keep label comment");
    expect(yaml).toContain("# keep extension comment");
    expect(yaml.indexOf("name: Labelled home")).toBeLessThan(
      yaml.indexOf("schemaVersion:")
    );
    expect(yaml.indexOf("name: Cooking")).toBeLessThan(yaml.indexOf(`id: ${labelId}`));
    expect(yaml.indexOf("y: 1400")).toBeLessThan(yaml.indexOf("x: 1100"));
    expect(yaml).not.toContain("name: Dining");
    expect(ProjectWorkspace.importYaml(yaml).document).toEqual(deleted.document);
  });

  it("keeps labels through splits and diagnoses outside and merged labels", () => {
    let workspace = ProjectWorkspace.create("Changing rooms", {
      idFactory: deterministicIdFactory()
    });
    for (const [start, end] of [
      [[0, 0], [4000, 0]],
      [[4000, 0], [4000, 3000]],
      [[4000, 3000], [0, 3000]],
      [[0, 3000], [0, 0]]
    ] as const) {
      workspace = workspace.addWall({
        start: { x: start[0], y: start[1] },
        end: { x: end[0], y: end[1] }
      });
    }
    const first = workspace.addRoomLabel({
      name: "Kitchen",
      position: { x: 1000, y: 1500 }
    });
    const firstLabelId = first.activeLevel.roomLabels[0]!.id;
    const split = first.addWall({
      start: { x: 2000, y: 0 },
      end: { x: 2000, y: 3000 }
    });

    expect(split.rooms).toHaveLength(2);
    expect(split.rooms.find(({ labelIds }) => labelIds.includes(firstLabelId)))
      .toMatchObject({ labelIds: [firstLabelId] });

    const withSecond = split.addRoomLabel({
      name: "Living room",
      position: { x: 3000, y: 1500 }
    });
    const dividerId = withSecond.activeLevel.walls.at(-1)!.id;
    const merged = withSecond.deleteWall(dividerId);
    expect(merged.document.levels[0]!.roomLabels).toHaveLength(2);
    expect(merged.diagnostics).toContainEqual(expect.objectContaining({
      code: "room-label.merge-conflict",
      severity: "warning"
    }));

    const outside = merged.moveRoomLabel(firstLabelId, { x: -2000, y: 0 });
    expect(outside.diagnostics).toContainEqual(expect.objectContaining({
      code: "room-label.outside-room",
      severity: "warning"
    }));
    expect(outside.document.levels[0]!.roomLabels).toHaveLength(2);
  });

  it("rejects unsupported schema versions with a machine-readable diagnostic", () => {
    const yaml = `schemaVersion: 99.0.0
id: project_00000000-0000-4000-8000-000000000001
name: Future project
units: metric
activeLevelId: level_00000000-0000-4000-8000-000000000002
levels:
  - id: level_00000000-0000-4000-8000-000000000002
    name: Ground floor
    baseElevationMm: 0
    defaultWallHeightMm: 2500
    extensions: {}
extensions: {}
`;

    const result = parseProjectDocument(yaml);

    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual({
      code: "schema-version.unsupported",
      severity: "error",
      path: "/schemaVersion",
      message: `Unsupported schema version "99.0.0". Expected "${CURRENT_SCHEMA_VERSION}".`
    });
  });

  it("rejects malformed stable IDs and invalid Level dimensions", () => {
    const yaml = `schemaVersion: 1.0.0
id: not-stable
name: Broken project
units: metric
activeLevelId: missing-level
levels:
  - id: also-broken
    name: Ground floor
    baseElevationMm: 0
    defaultWallHeightMm: 0
    extensions: {}
extensions: {}
`;

    const result = parseProjectDocument(yaml);

    expect(result.document).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["stable-id.invalid", "dimension.non-positive"])
    );
  });

  it("rejects zero-length Walls as a semantic geometry invariant", () => {
    const document = createProjectDocument("Invalid geometry", {
      idFactory: deterministicIdFactory()
    });
    document.levels[0]!.walls.push({
      id: "wall_00000000-0000-4000-8000-000000000003",
      path: {
        kind: "straight",
        start: { x: 100, y: 200 },
        end: { x: 100, y: 200 }
      },
      thicknessMm: 150,
      heightMm: 2500,
      extensions: {}
    });

    expect(validateProjectDocument(document)).toContainEqual({
      code: "wall.length.zero",
      severity: "error",
      path: "/levels/0/walls/0/path/end",
      message: "Wall path must have distinct start and end points."
    });
  });

  it("rejects aliases and custom YAML tags", () => {
    const aliasResult = parseProjectDocument(`schemaVersion: 1.0.0
id: &projectId project_00000000-0000-4000-8000-000000000001
name: Aliased
units: metric
activeLevelId: *projectId
levels: []
extensions: {}
`);
    const tagResult = parseProjectDocument("!custom { schemaVersion: 1.0.0 }");

    expect(aliasResult.diagnostics.map(({ code }) => code)).toContain(
      "yaml.restricted-syntax"
    );
    expect(tagResult.diagnostics.map(({ code }) => code)).toContain(
      "yaml.restricted-syntax"
    );
  });

  it("confines unknown data to globally namespaced extension keys", () => {
    const document = createProjectDocument("Extended project", {
      idFactory: deterministicIdFactory()
    });
    document.extensions["https://example.com/smarchitect/materials"] = {
      finish: "oak"
    };

    expect(validateProjectDocument(document)).toEqual([]);

    document.extensions.materials = { finish: "oak" };
    expect(validateProjectDocument(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema.invalid",
          path: "/extensions"
        })
      ])
    );
  });
});
