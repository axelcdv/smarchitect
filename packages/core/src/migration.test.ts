import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_DOCUMENT_SCHEMA_DIALECT,
  ProjectValidationError,
  ProjectWorkspace,
  parseProjectDocument,
  previewProjectDocumentMigration
} from "./index.js";

const legacySource = `# authored migration fixture
name: Legacy kitchen # preserve this comment
schemaVersion: 1.0.0
extensions:
  https://example.com/project:
    untouched: true
id: project_00000000-0000-4000-8000-000000000001
units: metric
levels:
  - name: Ground floor
    id: level_00000000-0000-4000-8000-000000000002
    walls:
      - thicknessMm: 150 # site measurement
        id: wall_00000000-0000-4000-8000-000000000003
        path:
          kind: straight
          start: { x: 0, y: 0 }
          end: { x: 3000, y: 0 }
        heightMm: 2500
        extensions:
          https://example.com/wall:
            material: brick
    defaultWallHeightMm: 2500
    baseElevationMm: 0
    extensions: {}
activeLevelId: level_00000000-0000-4000-8000-000000000002
`;

describe("Project Document schema migration", () => {
  it("previews the supported migration without modifying the original source", () => {
    const preview = previewProjectDocumentMigration(legacySource);

    expect(preview.originalSource).toBe(legacySource);
    expect(preview.sourceVersion).toBe("1.0.0");
    expect(preview.targetVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(preview.schemaDialect).toBe(PROJECT_DOCUMENT_SCHEMA_DIALECT);
    expect(preview.migratedSource).toContain("# authored migration fixture");
    expect(preview.migratedSource).toContain(
      "thicknessMm: 150 # site measurement"
    );
    expect(preview.migratedSource).toContain("material: brick");
    expect(preview.migratedSource.indexOf("name: Legacy kitchen"))
      .toBeLessThan(preview.migratedSource.indexOf("schemaVersion: 1.1.0"));
    expect(parseProjectDocument(preview.migratedSource).document)
      .toEqual(preview.document);
  });

  it("requires migration rather than interpreting an older document", () => {
    const parsed = parseProjectDocument(legacySource);

    expect(parsed.document).toBeUndefined();
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: "schema-version.migration-required",
      path: "/schemaVersion",
      message: expect.stringMatching(/previewed migration/i)
    }));
  });

  it("rejects invalid legacy structure during preview", () => {
    const invalid = legacySource.replace(
      "name: Legacy kitchen # preserve this comment",
      "name: Legacy kitchen # preserve this comment\nunknownCoreField: true"
    );

    expect(() => previewProjectDocumentMigration(invalid)).toThrow(
      ProjectValidationError
    );
    try {
      previewProjectDocumentMigration(invalid);
    } catch (error) {
      expect((error as ProjectValidationError).diagnostics).toContainEqual(
        expect.objectContaining({
          code: "schema.invalid",
          path: "/unknownCoreField"
        })
      );
    }
  });

  it("leaves newer unsupported source untouched with a compatibility diagnostic", () => {
    const future = legacySource.replace("1.0.0", "9.0.0");
    const parsed = parseProjectDocument(future);

    expect(parsed.document).toBeUndefined();
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: "schema-version.unsupported",
      message: expect.stringMatching(/left untouched/i)
    }));
    expect(() => previewProjectDocumentMigration(future)).toThrow(
      ProjectValidationError
    );
    expect(future).toContain("schemaVersion: 9.0.0");
  });
});
