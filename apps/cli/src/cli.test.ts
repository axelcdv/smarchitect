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
      migrated: false,
      diagnostics: [{ code: "schema-version.unsupported" }]
    });
  });
});
