import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_DOCUMENT_SCHEMA_DIALECT,
  ProjectValidationError,
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
    "room-label": 8,
    opening: 5,
    furniture_definition: 5,
    furniture_placement: 6,
    fixture_definition: 7,
    fixture_placement: 8,
    design_proposal: 12
  };
  return (kind) => {
    const value = next[kind]++;
    return `${kind}_00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
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

function deterministicOpeningIdFactory(): () => string {
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
    if (!id) throw new Error("The test exhausted its deterministic Opening IDs");
    return id;
  };
}

function deterministicFixtureIdFactory(): () => string {
  const ids = [
    "project_00000000-0000-4000-8000-000000000001",
    "level_00000000-0000-4000-8000-000000000002",
    "fixture_placement_00000000-0000-4000-8000-000000000006",
    "fixture_placement_00000000-0000-4000-8000-000000000008",
    "fixture_definition_00000000-0000-4000-8000-000000000007"
  ];
  return () => {
    const id = ids.shift();
    if (!id) throw new Error("The test exhausted its deterministic Fixture IDs");
    return id;
  };
}

describe("Project Workspace acceptance seam", () => {
  it("keeps several complete Design Proposals independent", () => {
    const now = new Date("2026-07-31T10:00:00.000Z");
    let workspace = ProjectWorkspace.create("Alternatives", {
      idFactory: deterministicIdFactory(),
      now: () => now
    })
      .addWall({
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 }
      })
      .addRoomLabel({ name: "Living room", position: { x: 1000, y: 1000 } });
    workspace = workspace
      .placeFurniture({
        id: "furniture_definition_00000000-0000-4000-8000-000000000010",
        name: "Sofa",
        widthMm: 2000,
        depthMm: 900,
        heightMm: 800,
        extensions: {}
      }, { position: { x: 500, y: 500 } })
      .placeFixture({
        id: "fixture_definition_00000000-0000-4000-8000-000000000011",
        name: "Radiator",
        widthMm: 1000,
        depthMm: 150,
        heightMm: 600,
        extensions: {}
      }, { position: { x: 2500, y: 300 } });

    const existing = workspace.document;
    const first = workspace.createDesignProposal("Open kitchen");
    const firstId = first.activeDesignProposal!.id;
    const second = first
      .selectExistingState()
      .createDesignProposal("Separate kitchen");
    const secondId = second.activeDesignProposal!.id;

    expect(second.document.designProposals).toHaveLength(2);
    expect(second.activeDesignProposal).toMatchObject({
      id: secondId,
      name: "Separate kitchen",
      sourceRevision: existing.existingStateRevision,
      sourceRevisedAt: existing.existingStateRevisedAt,
      levels: existing.levels,
      furnitureDefinitions: existing.furnitureDefinitions,
      fixtureDefinitions: existing.fixtureDefinitions
    });
    expect(second.document.designProposals![0]).toMatchObject({
      id: firstId,
      name: "Open kitchen",
      levels: existing.levels
    });

    const editedFirst = second
      .selectDesignProposal(firstId)
      .addWall({
        start: { x: 0, y: 1000 },
        end: { x: 4000, y: 1000 }
      })
      .renameDesignProposal(firstId, "Kitchen opened");

    expect(editedFirst.activeLevel.walls).toHaveLength(2);
    expect(editedFirst.document.levels).toEqual(existing.levels);
    expect(editedFirst.document.designProposals![1]!.levels)
      .toEqual(existing.levels);
    expect(editedFirst.activeDesignProposal?.name).toBe("Kitchen opened");

    const deleted = editedFirst.deleteDesignProposal(firstId);
    expect(deleted.activePlanSelection).toEqual({ kind: "existing-state" });
    expect(deleted.document.designProposals?.map(({ id }) => id))
      .toEqual([secondId]);
  });

  it("marks proposals stale after Existing State corrections", () => {
    let currentTime = new Date("2026-07-31T10:00:00.000Z");
    const workspace = ProjectWorkspace.create("Staleness", {
      idFactory: deterministicIdFactory(),
      now: () => currentTime
    }).addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    });
    const proposal = workspace.createDesignProposal("Before correction");
    const proposalId = proposal.activeDesignProposal!.id;
    const proposalLevels = proposal.activeDesignProposal!.levels;

    currentTime = new Date("2026-08-01T11:30:00.000Z");
    const corrected = proposal
      .selectExistingState()
      .updateWall(workspace.activeLevel.walls[0]!.id, { lengthMm: 4200 })
      .selectDesignProposal(proposalId);

    expect(corrected.activeDesignProposal?.levels).toEqual(proposalLevels);
    expect(corrected.activeProposalStaleness).toEqual({
      stale: true,
      sourceRevision: workspace.document.existingStateRevision,
      sourceRevisedAt: "2026-07-31T10:00:00.000Z",
      currentRevision: corrected.document.existingStateRevision,
      currentRevisedAt: "2026-08-01T11:30:00.000Z"
    });
  });

  it("roots active Design Proposal warnings at the proposal document path", () => {
    const workspace = ProjectWorkspace.create("Proposal diagnostics", {
      idFactory: deterministicIdFactory()
    })
      .addRoomLabel({
        name: "Outside",
        position: { x: 1000, y: 1000 }
      })
      .createDesignProposal("Alternative");

    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({
      code: "room-label.outside-room",
      path: "/designProposals/0/levels/0/roomLabels/0/position"
    }));
  });

  it("protects the Design Proposal schema and stable-reference contract", () => {
    const workspace = ProjectWorkspace.create("Proposal contract", {
      idFactory: deterministicIdFactory()
    }).createDesignProposal("Extended alternative");
    const document = workspace.document;
    const proposal = document.designProposals![0]!;
    proposal.extensions["https://example.com/smarchitect/proposal-notes"] = {
      note: "Preserved"
    };

    expect(validateProjectDocument(document)).toEqual([]);
    expect(
      ProjectWorkspace.importYaml(stringify(document))
        .document.designProposals![0]!.extensions
    ).toEqual({
      "https://example.com/smarchitect/proposal-notes": {
        note: "Preserved"
      }
    });

    const unnamespacedExtension = structuredClone(document);
    unnamespacedExtension.designProposals![0]!.extensions.notes = {
      note: "Rejected"
    };
    expect(validateProjectDocument(unnamespacedExtension)).toContainEqual(
      expect.objectContaining({
        code: "schema.invalid",
        path: "/designProposals/0/extensions"
      })
    );

    const malformedId = structuredClone(document);
    malformedId.designProposals![0]!.id = "proposal-not-stable";
    expect(validateProjectDocument(malformedId)).toContainEqual(
      expect.objectContaining({
        code: "stable-id.invalid",
        path: "/designProposals/0/id"
      })
    );

    const danglingSelection = structuredClone(document);
    danglingSelection.activePlan = {
      kind: "design-proposal",
      proposalId: "design_proposal_00000000-0000-4000-8000-000000000099"
    };
    expect(validateProjectDocument(danglingSelection)).toContainEqual(
      expect.objectContaining({
        code: "active-plan.proposal.missing",
        path: "/activePlan/proposalId"
      })
    );

    const unknownField = structuredClone(document) as unknown as {
      designProposals: Array<Record<string, unknown>>;
    };
    unknownField.designProposals[0]!.comparisonMode = true;
    expect(validateProjectDocument(unknownField)).toContainEqual(
      expect.objectContaining({
        code: "schema.invalid",
        path: "/designProposals/0/comparisonMode"
      })
    );
  });

  it("rejects missing, invalid, and impossible Design Proposal provenance", () => {
    const document = ProjectWorkspace.create("Proposal provenance", {
      idFactory: deterministicIdFactory(),
      now: () => new Date("2026-07-31T10:00:00.000Z")
    }).createDesignProposal("Alternative").document;

    const missingExistingStateProvenance = structuredClone(document);
    delete missingExistingStateProvenance.existingStateRevision;
    delete missingExistingStateProvenance.existingStateRevisedAt;
    expect(validateProjectDocument(missingExistingStateProvenance)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/existingStateRevision" }),
        expect.objectContaining({ path: "/existingStateRevisedAt" })
      ])
    );

    const invalidTimestamp = structuredClone(document);
    invalidTimestamp.designProposals![0]!.sourceRevisedAt = "nope";
    expect(validateProjectDocument(invalidTimestamp)).toContainEqual(
      expect.objectContaining({
        code: "schema.invalid",
        path: "/designProposals/0/sourceRevisedAt"
      })
    );

    const invalidExistingStateTimestamp = structuredClone(document);
    invalidExistingStateTimestamp.existingStateRevisedAt = "nope";
    expect(validateProjectDocument(invalidExistingStateTimestamp))
      .toContainEqual(expect.objectContaining({
        code: "schema.invalid",
        path: "/existingStateRevisedAt"
      }));

    const futureRevision = structuredClone(document);
    futureRevision.designProposals![0]!.sourceRevision =
      futureRevision.existingStateRevision! + 1;
    expect(validateProjectDocument(futureRevision)).toContainEqual({
      code: "design-proposal.source-revision.future",
      severity: "error",
      path: "/designProposals/0/sourceRevision",
      message: "Design Proposal source revision must not be newer than the Existing State."
    });
  });

  it("creates a valid metric project with one active Level", () => {
    const document = createProjectDocument("My renovation", {
      idFactory: deterministicIdFactory(),
      now: () => new Date("2026-07-31T10:00:00.000Z")
    });

    expect(document).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      schemaDialect: PROJECT_DOCUMENT_SCHEMA_DIALECT,
      id: "project_00000000-0000-4000-8000-000000000001",
      name: "My renovation",
      units: "metric",
      activeLevelId: "level_00000000-0000-4000-8000-000000000002",
      furnitureDefinitions: [],
      fixtureDefinitions: [],
      existingStateRevision: 0,
      existingStateRevisedAt: "2026-07-31T10:00:00.000Z",
      activePlan: { kind: "existing-state" },
      designProposals: [],
      levels: [
        {
          id: "level_00000000-0000-4000-8000-000000000002",
          name: "Ground floor",
          baseElevationMm: 0,
          defaultWallHeightMm: 2500,
          walls: [],
          roomLabels: [],
          openings: [],
          furniturePlacements: [],
          fixturePlacements: [],
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
      idFactory: deterministicOpeningIdFactory()
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
    expect(withPassage.deleteOpening(doorId).activeLevel.openings).toHaveLength(2);
  });

  it("preserves authored YAML through every Opening mutation", () => {
    const source = `# project comment
name: Authored openings # name comment
schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
units: metric
id: project_00000000-0000-4000-8000-000000000001
levels:
  - name: Ground floor # level comment
    id: level_00000000-0000-4000-8000-000000000002
    openings:
      - kind: passage # opening comment
        id: opening_00000000-0000-4000-8000-000000000005
        extensions:
          example.test:opening:
            authored: true # extension comment
        hostWallId: wall_00000000-0000-4000-8000-000000000003
        widthMm: 800
        positionMm: 200
        heightMm: 2100
    walls:
      - thicknessMm: 150
        id: wall_00000000-0000-4000-8000-000000000003
        path:
          end: { y: 0, x: 4000 }
          kind: straight
          start: { y: 0, x: 0 }
        heightMm: 2500
        extensions: {}
    extensions: {}
    defaultWallHeightMm: 2500
    baseElevationMm: 0
activeLevelId: level_00000000-0000-4000-8000-000000000002
extensions: {}
`;
    const imported = ProjectWorkspace.importYaml(source);
    const firstId = imported.activeLevel.openings[0]!.id;
    const added = imported.addOpening({
      kind: "passage",
      hostWallId: imported.activeLevel.walls[0]!.id,
      positionMm: 1500,
      widthMm: 700,
      heightMm: 2000
    });
    const addedId = added.activeLevel.openings[1]!.id;
    const updated = added.updateOpening(firstId, { widthMm: 900 });
    const moved = updated.moveOpening(firstId, 100);
    const deleted = moved.deleteOpening(addedId);
    const yaml = deleted.exportYaml();

    for (const comment of [
      "# project comment",
      "# name comment",
      "# level comment",
      "# opening comment",
      "# extension comment"
    ]) {
      expect(yaml).toContain(comment);
    }
    expect(yaml.indexOf("name: Authored openings")).toBeLessThan(
      yaml.indexOf("schemaVersion:")
    );
    expect(yaml.indexOf("widthMm: 900")).toBeLessThan(
      yaml.indexOf("positionMm: 300")
    );
    expect(yaml).not.toContain(`id: ${addedId}`);
    expect(ProjectWorkspace.importYaml(yaml).document).toEqual(deleted.document);
  });

  it("preserves surviving Opening nodes when one operation deletes several", () => {
    const workspace = ProjectWorkspace.create("Multiple conflicts", {
      idFactory: deterministicOpeningIdFactory()
    }).addWall({
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 }
    });
    const wallId = workspace.activeLevel.walls[0]!.id;
    const withOpenings = workspace
      .addOpening({
        kind: "passage",
        hostWallId: wallId,
        positionMm: 100,
        widthMm: 500,
        heightMm: 2000
      })
      .addOpening({
        kind: "passage",
        hostWallId: wallId,
        positionMm: 1600,
        widthMm: 500,
        heightMm: 2000
      })
      .addOpening({
        kind: "passage",
        hostWallId: wallId,
        positionMm: 3000,
        widthMm: 500,
        heightMm: 2000
      });
    const authored = ProjectWorkspace.importYaml(
      stringify(withOpenings.document, {
        collectionStyle: "block",
        lineWidth: 0
      }).replace(
        "kind: passage",
        "kind: passage # surviving authored opening"
      )
    );

    const resolved = authored.updateWallResolvingOpenings(
      wallId,
      { lengthMm: 1000 },
      "delete"
    );

    expect(resolved.activeLevel.openings).toHaveLength(1);
    expect(resolved.exportYaml()).toContain("# surviving authored opening");
    expect(ProjectWorkspace.importYaml(resolved.exportYaml()).document)
      .toEqual(resolved.document);
  });

  it("resolves invalidating Wall edits atomically for hosted Openings", () => {
    const workspace = ProjectWorkspace.create("Atomic openings", {
      idFactory: deterministicOpeningIdFactory()
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

    expect(() => withWindow.updateWall(wallId, { lengthMm: 1800 }))
      .toThrow(ProjectValidationError);
    const fitted = withWindow.updateWallResolvingOpenings(
      wallId,
      { lengthMm: 1800, heightMm: 1500 },
      "fit"
    );
    expect(fitted.activeLevel.openings[0]).toMatchObject({
      positionMm: 800,
      widthMm: 1000,
      sillHeightMm: 1000,
      heightMm: 500
    });
    expect(withWindow.updateWallResolvingOpenings(
      wallId,
      { lengthMm: 1800 },
      "delete"
    ).activeLevel.openings).toEqual([]);
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
schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
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

  it("preserves pre-Furniture 1.0 documents without silently adding collections", () => {
    const legacyYaml = `schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
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
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "schema-version.unsupported",
      severity: "error",
      path: "/schemaVersion",
      message: expect.stringMatching(/not supported.*left untouched/i)
    }));
  });

  it("rejects malformed stable IDs and invalid Level dimensions", () => {
    const yaml = `schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
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
    const aliasResult = parseProjectDocument(`schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
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
    expect(aliasResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "yaml.restricted-syntax",
        path: "/activeLevelId",
        line: 6,
        column: expect.any(Number),
        message: expect.stringMatching(/remove.*alias/i)
      })
    ]));
    expect(tagResult.diagnostics.map(({ code }) => code)).toContain(
      "yaml.restricted-syntax"
    );
  });

  it("locates structural and semantic diagnostics in YAML source", () => {
    const structural = parseProjectDocument(`schemaVersion: 1.1.0\nschemaDialect: https://json-schema.org/draft/2020-12/schema\nname: Missing fields\n`);
    expect(structural.diagnostics[0]).toEqual(expect.objectContaining({
      severity: "error",
      line: expect.any(Number),
      column: expect.any(Number)
    }));

    const workspace = ProjectWorkspace.create("Located semantic error");
    const source = workspace.exportYaml().replace(
      /^activeLevelId: .+$/m,
      "activeLevelId: level_00000000-0000-4000-8000-000000000099"
    );
    expect(parseProjectDocument(source).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/activeLevelId",
          line: expect.any(Number),
          column: expect.any(Number)
        })
      ])
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

  it("keeps Fixture Definitions distinct, embedded, and reproducible", () => {
    const libraryFixture = {
      id: "fixture_definition_00000000-0000-4000-8000-000000000005",
      name: "Kitchen sink",
      widthMm: 800,
      depthMm: 500,
      heightMm: 220,
      extensions: {}
    };
    const workspace = ProjectWorkspace.create("Installed home", {
      idFactory: deterministicFixtureIdFactory()
    }).placeFixture(libraryFixture, {
      position: { x: 100, y: 200 },
      rotationDeg: 90,
      elevationMm: 850
    });
    const placement = workspace.activeLevel.fixturePlacements![0]!;
    const changedLibraryFixture = { ...libraryFixture, widthMm: 900 };

    expect(workspace.document.fixtureDefinitions).toEqual([libraryFixture]);
    expect(placement).toMatchObject({
      definitionId: libraryFixture.id,
      position: { x: 100, y: 200 },
      rotationDeg: 90,
      elevationMm: 850
    });
    expect(workspace.document.fixtureDefinitions![0]!.widthMm).toBe(800);
    expect(changedLibraryFixture.widthMm).toBe(900);
    expect(ProjectWorkspace.importYaml(workspace.exportYaml()).document)
      .toEqual(workspace.document);
    const authoredYaml = workspace.exportYaml().replace(
      "fixtureDefinitions:",
      "# fixture comment\nfixtureDefinitions:"
    );
    expect(ProjectWorkspace.importYaml(authoredYaml)
      .updateFixtureDefinition(libraryFixture.id, { widthMm: 900 })
      .exportYaml()).toContain("# fixture comment");
  });

  it("edits shared Fixtures and can make one Fixture Placement unique", () => {
    const definition = {
      id: "fixture_definition_00000000-0000-4000-8000-000000000005",
      name: "Radiator",
      widthMm: 1000,
      depthMm: 150,
      heightMm: 600,
      extensions: {}
    };
    const first = ProjectWorkspace.create("Fixtures", {
      idFactory: deterministicFixtureIdFactory()
    }).placeFixture(definition, { position: { x: 0, y: 0 } });
    const two = first.placeFixture(definition, { position: { x: 2000, y: 0 } });
    const [firstPlacement, secondPlacement] = two.activeLevel.fixturePlacements!;
    const shared = two.updateFixtureDefinition(definition.id, { widthMm: 1200 });
    const unique = shared.makeFixturePlacementUnique(firstPlacement!.id);
    const uniqueDefinitionId = unique.activeLevel.fixturePlacements![0]!.definitionId;
    const edited = unique
      .updateFixtureDefinition(uniqueDefinitionId, { widthMm: 700 })
      .updateFixturePlacement(firstPlacement!.id, {
        position: { x: 250, y: 300 },
        rotationDeg: -45,
        elevationMm: 100
      });

    expect(shared.document.fixtureDefinitions![0]!.widthMm).toBe(1200);
    expect(uniqueDefinitionId).not.toBe(definition.id);
    expect(unique.activeLevel.fixturePlacements![1]!.definitionId)
      .toBe(secondPlacement!.definitionId);
    expect(edited.document.fixtureDefinitions!.find(
      ({ id }) => id === uniqueDefinitionId
    )!.widthMm).toBe(700);
    expect(edited.activeLevel.fixturePlacements![0]).toMatchObject({
      position: { x: 250, y: 300 },
      rotationDeg: 315,
      elevationMm: 100
    });
    expect(edited.deleteFixturePlacement(firstPlacement!.id)
      .activeLevel.fixturePlacements).toHaveLength(1);
  });

  it("rejects cross-kind Fixture references during validation", () => {
    const document = ProjectWorkspace.create("Typed fixtures", {
      idFactory: deterministicFixtureIdFactory()
    }).document;
    document.levels[0]!.fixturePlacements = [{
      id: "fixture_placement_00000000-0000-4000-8000-000000000006",
      definitionId:
        "furniture_definition_00000000-0000-4000-8000-000000000005",
      position: { x: 0, y: 0 },
      rotationDeg: 0,
      elevationMm: 0,
      extensions: {}
    }];

    expect(validateProjectDocument(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "/levels/0/fixturePlacements/0/definitionId"
      })
    ]));
  });
});
