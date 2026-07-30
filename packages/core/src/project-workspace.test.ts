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
    "wall_00000000-0000-4000-8000-000000000004",
    "furniture_definition_00000000-0000-4000-8000-000000000005",
    "furniture_placement_00000000-0000-4000-8000-000000000006",
    "furniture_definition_00000000-0000-4000-8000-000000000007"
  ];

  return () => {
    const id = ids.shift();

    if (!id) {
      throw new Error("The test exhausted its deterministic IDs");
    }

    return id;
  };
}

function deterministicFurnitureIdFactory(): () => string {
  const ids = [
    "project_00000000-0000-4000-8000-000000000001",
    "level_00000000-0000-4000-8000-000000000002",
    "furniture_placement_00000000-0000-4000-8000-000000000006",
    "furniture_placement_00000000-0000-4000-8000-000000000008",
    "furniture_definition_00000000-0000-4000-8000-000000000007"
  ];
  return () => {
    const id = ids.shift();
    if (!id) throw new Error("The test exhausted its deterministic Furniture IDs");
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
      furnitureDefinitions: [],
      levels: [
        {
          id: "level_00000000-0000-4000-8000-000000000002",
          name: "Ground floor",
          baseElevationMm: 0,
          defaultWallHeightMm: 2500,
          walls: [],
          furniturePlacements: [],
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

  it("preserves pre-Furniture 1.0 documents without silently adding collections", () => {
    const legacyYaml = `schemaVersion: 1.0.0
id: project_00000000-0000-4000-8000-000000000001
name: Existing project
units: metric
activeLevelId: level_00000000-0000-4000-8000-000000000002
levels:
  - id: level_00000000-0000-4000-8000-000000000002
    name: Ground floor
    baseElevationMm: 0
    defaultWallHeightMm: 2500
    walls: []
    extensions: {}
extensions: {}
`;

    const imported = ProjectWorkspace.importYaml(legacyYaml);

    expect(imported.document.furnitureDefinitions).toBeUndefined();
    expect(imported.activeLevel.furniturePlacements).toBeUndefined();
    expect(imported.exportYaml()).not.toContain("furnitureDefinitions");
    expect(imported.exportYaml()).not.toContain("furniturePlacements");
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

  it("embeds a Furniture Definition when placing it and preserves placement geometry", () => {
    const workspace = ProjectWorkspace.create("Furnished home", {
      idFactory: deterministicFurnitureIdFactory()
    });
    const definition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Dining table",
      widthMm: 1800,
      depthMm: 900,
      heightMm: 750,
      extensions: {}
    };

    const furnished = workspace.placeFurniture(definition, {
      position: { x: 1200, y: -400 },
      rotationDeg: 33.5
    });
    const placement = furnished.activeLevel.furniturePlacements[0]!;
    const imported = ProjectWorkspace.importYaml(furnished.exportYaml());

    expect(placement).toMatchObject({
      definitionId: definition.id,
      position: { x: 1200, y: -400 },
      rotationDeg: 33.5,
      elevationMm: 0
    });
    expect(furnished.document.furnitureDefinitions).toEqual([definition]);
    expect(imported.document).toEqual(furnished.document);
  });

  it("reuses the embedded snapshot when the Item Library definition has drifted", () => {
    const libraryDefinition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Dining table",
      widthMm: 1800,
      depthMm: 900,
      heightMm: 750,
      extensions: {}
    };
    const first = ProjectWorkspace.create("Furnished home", {
      idFactory: deterministicFurnitureIdFactory()
    }).placeFurniture(libraryDefinition, { position: { x: 0, y: 0 } });
    const otherFirst = ProjectWorkspace.create("Other furnished home", {
      idFactory: deterministicFurnitureIdFactory()
    }).placeFurniture(libraryDefinition, { position: { x: 0, y: 0 } });
    const editedEmbedded = first.updateFurnitureDefinition(
      libraryDefinition.id,
      { widthMm: 1700 }
    );
    const changedLibrary = { ...libraryDefinition, widthMm: 2000 };

    const placedAfterEmbeddedEdit = editedEmbedded.placeFurniture(
      libraryDefinition,
      { position: { x: 1000, y: 0 } }
    );
    const placedAfterLibraryEdit = otherFirst.placeFurniture(
      changedLibrary,
      { position: { x: 2000, y: 0 } }
    );

    expect(placedAfterEmbeddedEdit.document.furnitureDefinitions).toEqual([
      expect.objectContaining({ id: libraryDefinition.id, widthMm: 1700 })
    ]);
    expect(placedAfterLibraryEdit.document.furnitureDefinitions).toEqual([
      libraryDefinition
    ]);
    expect(placedAfterEmbeddedEdit.activeLevel.furniturePlacements).toHaveLength(2);
    expect(placedAfterLibraryEdit.activeLevel.furniturePlacements).toHaveLength(2);
  });

  it("moves, rotates, elevates, and deletes Furniture Placements", () => {
    const definition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Armchair",
      widthMm: 850,
      depthMm: 900,
      heightMm: 950,
      extensions: {}
    };
    const workspace = ProjectWorkspace.create("Furnished home", {
      idFactory: deterministicFurnitureIdFactory()
    }).placeFurniture(definition, { position: { x: 100, y: 200 } });
    const placementId = workspace.activeLevel.furniturePlacements[0]!.id;

    const edited = workspace.updateFurniturePlacement(placementId, {
      position: { x: 800, y: 900 },
      rotationDeg: -90,
      elevationMm: 250
    });

    expect(edited.activeLevel.furniturePlacements[0]).toMatchObject({
      position: { x: 800, y: 900 },
      rotationDeg: 270,
      elevationMm: 250
    });
    expect(edited.deleteFurniturePlacement(placementId)
      .activeLevel.furniturePlacements).toEqual([]);
  });

  it("updates shared embedded definitions and can make one placement unique", () => {
    const definition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Chair",
      widthMm: 450,
      depthMm: 500,
      heightMm: 900,
      extensions: {}
    };
    const idFactory = deterministicFurnitureIdFactory();
    const first = ProjectWorkspace.create("Dining room", { idFactory })
      .placeFurniture(definition, { position: { x: 0, y: 0 } });
    const two = first.placeFurniture(definition, { position: { x: 1000, y: 0 } });
    const [firstPlacement, secondPlacement] = two.activeLevel.furniturePlacements;
    const shared = two.updateFurnitureDefinition(definition.id, { widthMm: 500 });
    const unique = shared.makeFurniturePlacementUnique(firstPlacement!.id);
    const uniqueDefinitionId = unique.activeLevel.furniturePlacements[0]!.definitionId;
    const edited = unique.updateFurnitureDefinition(uniqueDefinitionId, {
      name: "Wide chair",
      widthMm: 650
    });

    expect(shared.document.furnitureDefinitions[0]!.widthMm).toBe(500);
    expect(uniqueDefinitionId).not.toBe(definition.id);
    expect(unique.activeLevel.furniturePlacements[1]!.definitionId)
      .toBe(secondPlacement!.definitionId);
    expect(edited.document.furnitureDefinitions.find(({ id }) => id === uniqueDefinitionId))
      .toMatchObject({ name: "Wide chair", widthMm: 650 });
    expect(edited.document.furnitureDefinitions.find(({ id }) => id === definition.id))
      .toMatchObject({ name: "Chair", widthMm: 500 });
  });

  it("rejects non-positive dimensions and arbitrary placement dimension overrides", () => {
    const workspace = ProjectWorkspace.create("Invalid furniture", {
      idFactory: deterministicFurnitureIdFactory()
    });
    const invalidDefinition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Broken chair",
      widthMm: 0,
      depthMm: 500,
      heightMm: 900,
      extensions: {}
    };

    expect(() => workspace.placeFurniture(invalidDefinition, {
      position: { x: 0, y: 0 }
    })).toThrow(ProjectValidationError);

    const validDefinition = { ...invalidDefinition, widthMm: 450 };
    const furnished = workspace.placeFurniture(validDefinition, {
      position: { x: 0, y: 0 }
    });
    const placementId = furnished.activeLevel.furniturePlacements[0]!.id;
    expect(() => furnished.updateFurniturePlacement(placementId, {
      widthMm: 123
    } as never)).toThrow(/dimension overrides/i);
  });
});
