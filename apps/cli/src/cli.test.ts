import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

const validYaml = `schemaVersion: 1.0.0
id: project_00000000-0000-4000-8000-000000000001
name: CLI project
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
