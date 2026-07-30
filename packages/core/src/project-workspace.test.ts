import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  ProjectValidationError,
  ProjectWorkspace,
  createProjectDocument,
  parseProjectDocument,
  validateProjectDocument
} from "./index.js";

function deterministicIdFactory(): () => string {
  const ids = [
    "project_00000000-0000-4000-8000-000000000001",
    "level_00000000-0000-4000-8000-000000000002",
    "wall_00000000-0000-4000-8000-000000000003",
    "opening_00000000-0000-4000-8000-000000000005",
    "opening_00000000-0000-4000-8000-000000000006",
    "opening_00000000-0000-4000-8000-000000000007"
  ];

  return () => {
    const id = ids.shift();

    if (!id) {
      throw new Error("The test exhausted its deterministic IDs");
    }

    return id;
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
          openings: [],
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

  it("adds, edits, moves, and deletes each Opening type on an ordered Wall path", () => {
    const workspace = ProjectWorkspace.create("Openings", {
      idFactory: deterministicIdFactory()
    }).addWall({
      start: { x: 3000, y: 1000 },
      end: { x: 0, y: 1000 },
      heightMm: 3000
    });
    const wallId = workspace.activeLevel.walls[0]!.id;
    const withDoor = workspace.addOpening({
      kind: "door",
      hostWallId: wallId,
      positionMm: 300,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    });
    const doorId = withDoor.activeLevel.openings[0]!.id;
    const editedDoor = withDoor.updateOpening(doorId, {
      operation: { kind: "sliding", slideDirection: "end" },
      widthMm: 1000
    });
    const movedDoor = editedDoor.moveOpening(doorId, 250);
    const withWindow = movedDoor.addOpening({
      kind: "window",
      hostWallId: wallId,
      positionMm: 1600,
      widthMm: 800,
      heightMm: 1200,
      sillHeightMm: 900,
      operation: { kind: "fixed" }
    });
    const withPassage = withWindow.addOpening({
      kind: "passage",
      hostWallId: wallId,
      positionMm: 2500,
      widthMm: 500,
      heightMm: 2200
    });

    expect(withPassage.activeLevel.openings).toMatchObject([
      {
        id: "opening_00000000-0000-4000-8000-000000000005",
        kind: "door",
        positionMm: 550,
        widthMm: 1000,
        operation: { kind: "sliding", slideDirection: "end" }
      },
      {
        kind: "window",
        positionMm: 1600,
        sillHeightMm: 900,
        operation: { kind: "fixed" }
      },
      {
        kind: "passage",
        positionMm: 2500,
        heightMm: 2200
      }
    ]);
    expect(withPassage.exportYaml()).toContain("hostWallId:");
    expect(withPassage.deleteOpening(doorId).activeLevel.openings).toHaveLength(2);
  });

  it("rejects invalid Opening dimensions, hosts, bounds, and invalidating Wall edits atomically", () => {
    const workspace = ProjectWorkspace.create("Atomic openings", {
      idFactory: deterministicIdFactory()
    }).addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
      heightMm: 2500
    });
    const wallId = workspace.activeLevel.walls[0]!.id;
    const withWindow = workspace.addOpening({
      kind: "window",
      hostWallId: wallId,
      positionMm: 1200,
      widthMm: 1000,
      heightMm: 1000,
      sillHeightMm: 1000,
      operation: { kind: "hinged", hingeSide: "end", swingDirection: "outward" }
    });
    const windowId = withWindow.activeLevel.openings[0]!.id;

    expect(() => workspace.addOpening({
      kind: "passage",
      hostWallId: "wall_00000000-0000-4000-8000-999999999999",
      positionMm: 0,
      widthMm: 800,
      heightMm: 2000
    })).toThrow(ProjectValidationError);
    expect(() => withWindow.updateOpening(windowId, { widthMm: 0 }))
      .toThrow(ProjectValidationError);
    expect(() => withWindow.moveOpening(windowId, 1000))
      .toThrow(ProjectValidationError);
    expect(() => withWindow.updateWall(wallId, { lengthMm: 1800 }))
      .toThrow(ProjectValidationError);
    expect(() => withWindow.updateWall(wallId, { heightMm: 1500 }))
      .toThrow(ProjectValidationError);
    expect(() => withWindow.deleteWall(wallId)).toThrow(ProjectValidationError);
    expect(withWindow.activeLevel.openings[0]).toMatchObject({
      id: windowId,
      positionMm: 1200,
      widthMm: 1000
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
