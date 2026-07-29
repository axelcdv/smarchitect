import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  ProjectWorkspace,
  createProjectDocument,
  parseProjectDocument,
  validateProjectDocument
} from "./index.js";

function deterministicIdFactory(): () => string {
  const ids = [
    "project_00000000-0000-4000-8000-000000000001",
    "level_00000000-0000-4000-8000-000000000002"
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
          extensions: {}
        }
      ],
      extensions: {}
    });
    expect(validateProjectDocument(document)).toEqual([]);
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
