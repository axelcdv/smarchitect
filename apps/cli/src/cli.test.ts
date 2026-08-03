import { readFileSync } from "node:fs";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

const validYaml = `schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
id: project_00000000-0000-4000-8000-000000000001
name: CLI project
units: metric
activeLevelId: level_00000000-0000-4000-8000-000000000002
furnitureDefinitions: []
levels:
  - id: level_00000000-0000-4000-8000-000000000002
    name: Ground floor
    baseElevationMm: 0
    defaultWallHeightMm: 2500
    walls: []
    furniturePlacements: []
    extensions: {}
extensions: {}
`;

function outputCollector(): {
  values: string[];
  write: (value: string) => void;
} {
  const values: string[] = [];

  return {
    values,
    write(value) {
      values.push(value);
    }
  };
}

describe("smarchitect validate", () => {
  it("validates golden authored syntax after entity-oriented edits", async () => {
    const source = readFileSync(new URL(
      "../../../packages/core/src/fixtures/authored-project-1.1.0.yaml",
      import.meta.url
    ), "utf8");
    const imported = ProjectWorkspace.importYaml(source);
    const proposal = imported.document.designProposals![0]!;
    const edited = imported
      .selectDesignProposal(proposal.id)
      .updateLevel({ name: "CLI edited proposal level" })
      .renameDesignProposal(proposal.id, "CLI edited proposal");
    const editedYaml = edited.exportYaml();
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["validate", "-"], {
      readFile: async () => {
        throw new Error("stdin validation must not read a file");
      },
      readStdin: async () => editedYaml,
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(editedYaml).toContain(
      "name: CLI edited proposal level # proposal level entity comment"
    );
    expect(editedYaml).toContain(
      "name: CLI edited proposal # design proposal entity comment"
    );
    expect(editedYaml).toContain("# proposal level entity comment");
    expect(editedYaml).toContain("authoredOrder: preserved");
    expect(editedYaml).toContain("reviewStatus: authored");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.values.join(""))).toEqual({
      ok: true,
      valid: true,
      diagnostics: []
    });
    expect(stderr.values).toEqual([]);
  });

  it("validates a project carried through the complete Project Workspace seam", async () => {
    const ids = [
      "project_00000000-0000-4000-8000-000000000001",
      "level_00000000-0000-4000-8000-000000000002"
    ];
    const created = ProjectWorkspace.create("Existing state", {
      idFactory: () => {
        const id = ids.shift();

        if (!id) {
          throw new Error("The acceptance test exhausted its stable IDs.");
        }

        return id;
      }
    });
    const renamed = created.rename("Kitchen proposal");
    const exportedYaml = renamed.exportYaml();
    const imported = ProjectWorkspace.importYaml(exportedYaml);
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["validate", "-"], {
      readFile: async () => {
        throw new Error("stdin validation must not read a file");
      },
      readStdin: async () => imported.exportYaml(),
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(imported.document).toEqual(renamed.document);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.values.join(""))).toEqual({
      ok: true,
      valid: true,
      diagnostics: []
    });
    expect(stderr.values).toEqual([]);
  });

  it("validates YAML from standard input", async () => {
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["validate", "-"], {
      readFile: async () => {
        throw new Error("stdin validation must not read a file");
      },
      readStdin: async () => validYaml,
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.values.join(""))).toEqual({
      ok: true,
      valid: true,
      diagnostics: []
    });
    expect(stderr.values).toEqual([]);
  });

  it("returns a validation failure for an invalid file", async () => {
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["validate", "broken.yaml"], {
      readFile: async (path) => {
        expect(path).toBe("broken.yaml");
        return "schemaVersion: 99.0.0";
      },
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.values.join(""))).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "schema-version.unsupported",
          severity: "error",
          path: "/schemaVersion"
        }
      ]
    });
    expect(stderr.values).toEqual([]);
  });
});

describe("smarchitect migrate", () => {
  it("preserves the golden authored syntax through the CLI entry point", async () => {
    const current = readFileSync(new URL(
      "../../../packages/core/src/fixtures/authored-project-1.1.0.yaml",
      import.meta.url
    ), "utf8");
    const legacy = current
      .replace("schemaVersion: 1.1.0", "schemaVersion: 1.0.0")
      .replace(
        "schemaDialect: https://json-schema.org/draft/2020-12/schema\n",
        ""
      );
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["migrate", "authored-project.yaml"], {
      readFile: async () => legacy,
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });
    const migrated = stdout.values.join("");

    expect(exitCode).toBe(0);
    expect(migrated).toContain("# golden project comment");
    expect(migrated).toContain("# wall entity comment");
    expect(migrated).toContain("plumbingZone: A");
    expect(migrated).toContain("# design proposal entity comment");
    expect(migrated).toContain("# proposal level entity comment");
    expect(migrated).toContain("reviewStatus: authored");
    expect(migrated.indexOf("name: Golden authored project"))
      .toBeLessThan(migrated.indexOf("schemaVersion: 1.1.0"));
    expect(ProjectWorkspace.importYaml(migrated).diagnostics)
      .toEqual(expect.not.arrayContaining([
        expect.objectContaining({ severity: "error" })
      ]));
    expect(stderr.values).toEqual([]);
  });

  it("writes a valid migrated document while leaving the input unchanged", async () => {
    const legacyYaml = validYaml
      .replace("schemaVersion: 1.1.0", "schemaVersion: 1.0.0")
      .replace(
        "schemaDialect: https://json-schema.org/draft/2020-12/schema\n",
        ""
      );
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["migrate", "legacy.yaml"], {
      readFile: async (path) => {
        expect(path).toBe("legacy.yaml");
        return legacyYaml;
      },
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(0);
    expect(stdout.values.join("")).toContain("schemaVersion: 1.1.0");
    expect(stdout.values.join("")).toContain(
      "schemaDialect: https://json-schema.org/draft/2020-12/schema"
    );
    expect(legacyYaml).not.toContain("schemaDialect:");
    expect(stderr.values).toEqual([]);
  });

  it("refuses unsupported newer schemas without echoing rewritten YAML", async () => {
    const source = "schemaVersion: 9.0.0\n";
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["migrate", "future.yaml"], {
      readFile: async () => source,
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(1);
    expect(stdout.values).toEqual([]);
    expect(JSON.parse(stderr.values.join(""))).toMatchObject({
      ok: false,
      migrated: false,
      diagnostics: [{ code: "schema-version.unsupported" }]
    });
  });
});

describe("complete AI CLI workflow", () => {
  it("inspects a complete document as stable JSON", async () => {
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["inspect", "project.yaml"], {
      readFile: async () => validYaml,
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.values.join(""))).toMatchObject({
      ok: true,
      document: {
        name: "CLI project",
        activeLevelId: "level_00000000-0000-4000-8000-000000000002"
      },
      activePlan: { kind: "existing-state" },
      activeLevel: { name: "Ground floor" },
      rooms: [],
      diagnostics: []
    });
    expect(stderr.values).toEqual([]);
  });

  it("applies a complete structured batch and preserves authored syntax", async () => {
    const source = readFileSync(new URL(
      "../../../packages/core/src/fixtures/authored-project-1.1.0.yaml",
      import.meta.url
    ), "utf8");
    const operations = JSON.stringify({
      version: 1,
      timestamp: "2026-08-03T12:00:00.000Z",
      operations: [
      {
        op: "wall.add",
        id: "wall_00000000-0000-4000-8000-000000000101",
        input: { start: { x: 0, y: 5000 }, end: { x: 4000, y: 5000 } }
      },
      {
        op: "opening.add",
        id: "opening_00000000-0000-4000-8000-000000000102",
        input: {
          kind: "passage",
          hostWallId: "wall_00000000-0000-4000-8000-000000000101",
          positionMm: 500,
          widthMm: 900,
          heightMm: 2100
        }
      },
      {
        op: "wall.updateResolvingOpenings",
        id: "wall_00000000-0000-4000-8000-000000000101",
        update: { lengthMm: 1000 },
        resolution: "fit"
      },
      {
        op: "roomLabel.add",
        id: "room-label_00000000-0000-4000-8000-000000000103",
        input: { name: "Dining room", position: { x: 500, y: 4500 } }
      },
      {
        op: "furniture.place",
        id: "furniture_placement_00000000-0000-4000-8000-000000000104",
        definition: {
          id: "furniture_definition_00000000-0000-4000-8000-000000000105",
          name: "AI desk",
          widthMm: 1200,
          depthMm: 700,
          heightMm: 750,
          extensions: {}
        },
        input: { position: { x: 800, y: 800 }, rotationDeg: 90 }
      },
      {
        op: "fixture.place",
        id: "fixture_placement_00000000-0000-4000-8000-000000000106",
        definition: {
          id: "fixture_definition_00000000-0000-4000-8000-000000000107",
          name: "AI sink",
          widthMm: 800,
          depthMm: 500,
          heightMm: 900,
          extensions: {}
        },
        input: { position: { x: 2000, y: 700 } }
      },
      {
        op: "furniture.makePlacementUnique",
        id: "furniture_placement_00000000-0000-4000-8000-000000000104",
        newDefinitionId: "furniture_definition_00000000-0000-4000-8000-000000000109"
      },
      {
        op: "fixture.makePlacementUnique",
        id: "fixture_placement_00000000-0000-4000-8000-000000000106",
        newDefinitionId: "fixture_definition_00000000-0000-4000-8000-000000000110"
      },
      {
        op: "proposal.create",
        id: "design_proposal_00000000-0000-4000-8000-000000000108",
        name: "AI alternative"
      },
      {
        op: "proposal.rename",
        id: "design_proposal_00000000-0000-4000-8000-000000000108",
        name: "AI alternative edited"
      }
    ]});
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli([
      "apply",
      "project.yaml",
      "--operations",
      "operations.json"
    ], {
      readFile: async (path) => path === "project.yaml" ? source : operations,
      readStdin: async () => "",
      stdout: stdout.write,
      stderr: stderr.write
    });
    const result = stdout.values.join("");
    const reopened = ProjectWorkspace.importYaml(result);

    expect(exitCode).toBe(0);
    expect(stderr.values).toEqual([]);
    expect(result).toContain("# golden project comment");
    expect(result).toContain("# wall entity comment");
    expect(result).toContain("plumbingZone: A");
    expect(result).toContain("reviewStatus: authored");
    expect(reopened.document.designProposals?.at(-1)?.name)
      .toBe("AI alternative edited");
    expect(reopened.activeLevel.openings).toContainEqual(expect.objectContaining({
      id: "opening_00000000-0000-4000-8000-000000000102",
      positionMm: 100,
      widthMm: 900
    }));
    expect(reopened.activeLevel.furniturePlacements).toContainEqual(
      expect.objectContaining({
        id: "furniture_placement_00000000-0000-4000-8000-000000000104",
        definitionId: "furniture_definition_00000000-0000-4000-8000-000000000109"
      })
    );
    expect(reopened.activeLevel.fixturePlacements).toContainEqual(
      expect.objectContaining({
        id: "fixture_placement_00000000-0000-4000-8000-000000000106",
        definitionId: "fixture_definition_00000000-0000-4000-8000-000000000110"
      })
    );
  });

  it("leaves an explicitly selected output byte-for-byte untouched on batch failure", async () => {
    const files = new Map([
      ["project.yaml", validYaml],
      ["operations.json", JSON.stringify({
        version: 1,
        operations: [
          { op: "project.rename", name: "Must roll back" },
          {
            op: "wall.update",
            id: "wall_00000000-0000-4000-8000-000000000999",
            update: { heightMm: 2800 }
          }
        ]
      })]
    ]);
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli([
      "apply",
      "project.yaml",
      "--operations",
      "operations.json",
      "--output",
      "project.yaml"
    ], {
      readFile: async (path) => files.get(path)!,
      readStdin: async () => "",
      writeFile: async (path, value) => { files.set(path, value); },
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(1);
    expect(files.get("project.yaml")).toBe(validYaml);
    expect(stdout.values).toEqual([]);
    expect(JSON.parse(stderr.values.join(""))).toMatchObject({
      ok: false,
      applied: false,
      failedOperation: 1,
      diagnostics: [{ code: "operation.invalid", path: "/1" }]
    });
  });

  it("reports invalid raw YAML as machine-readable diagnostics and exit 1", async () => {
    const stdout = outputCollector();
    const stderr = outputCollector();

    const exitCode = await runCli(["validate", "-"], {
      readFile: async () => "",
      readStdin: async () => "name: [unterminated",
      stdout: stdout.write,
      stderr: stderr.write
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.values.join(""))).toMatchObject({
      ok: false,
      valid: false,
      diagnostics: [{ severity: "error" }]
    });
    expect(stderr.values).toEqual([]);
  });

  it("reports semantic failures and rejects misspelled operation fields", async () => {
    const semanticStdout = outputCollector();
    const semanticSource = validYaml.replace(
      "activeLevelId: level_00000000-0000-4000-8000-000000000002",
      "activeLevelId: level_00000000-0000-4000-8000-000000000999"
    );
    expect(await runCli(["validate", "-"], {
      readFile: async () => "",
      readStdin: async () => semanticSource,
      stdout: semanticStdout.write,
      stderr: () => undefined
    })).toBe(1);
    expect(JSON.parse(semanticStdout.values.join(""))).toMatchObject({
      ok: false,
      diagnostics: [{ code: "active-level.missing", severity: "error" }]
    });

    const stderr = outputCollector();
    expect(await runCli(["apply", "project.yaml", "--operations", "-"], {
      readFile: async () => validYaml,
      readStdin: async () => JSON.stringify({
        version: 1,
        operations: [{
          op: "wall.add",
          id: "wall_00000000-0000-4000-8000-000000000003",
          imput: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }
        }]
      }),
      stdout: () => undefined,
      stderr: stderr.write
    })).toBe(1);
    expect(JSON.parse(stderr.values.join(""))).toMatchObject({
      ok: false,
      diagnostics: [{ code: "operations.invalid" }]
    });
  });

  it("previews migration without writing and performs it to an explicit file", async () => {
    const legacy = validYaml
      .replace("schemaVersion: 1.1.0", "schemaVersion: 1.0.0")
      .replace("schemaDialect: https://json-schema.org/draft/2020-12/schema\n", "");
    const previewStdout = outputCollector();
    const written = new Map<string, string>();

    expect(await runCli(["migrate", "-", "--preview"], {
      readFile: async () => "",
      readStdin: async () => legacy,
      stdout: previewStdout.write,
      stderr: () => undefined
    })).toBe(0);
    expect(JSON.parse(previewStdout.values.join(""))).toMatchObject({
      ok: true,
      migration: { sourceVersion: "1.0.0", targetVersion: "1.1.0" },
      document: { schemaVersion: "1.1.0" },
      diagnostics: []
    });

    const performStdout = outputCollector();
    expect(await runCli(["migrate", "legacy.yaml", "--output", "current.yaml"], {
      readFile: async () => legacy,
      readStdin: async () => "",
      writeFile: async (path, value) => { written.set(path, value); },
      stdout: performStdout.write,
      stderr: () => undefined
    })).toBe(0);
    expect(ProjectWorkspace.importYaml(written.get("current.yaml")!).diagnostics)
      .toEqual([]);
    expect(JSON.parse(performStdout.values.join(""))).toMatchObject({
      ok: true,
      migrated: true,
      output: "current.yaml"
    });
  });
});
