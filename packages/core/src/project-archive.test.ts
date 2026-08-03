import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  exportProjectArchive,
  importProjectArchive,
  previewProjectArchiveMigration,
  ProjectArchiveError,
  ProjectWorkspace,
  type ProjectCheckpoint
} from "./index.js";

function checkpoint(
  id: string,
  name: string,
  source: string
): ProjectCheckpoint {
  return {
    id,
    name,
    createdAt: "2026-08-03T10:00:00.000Z",
    source
  };
}

describe("Project Archives", () => {
  it("round-trips the current state and authored Checkpoint YAML losslessly", () => {
    const current = ProjectWorkspace.create("Current home").exportYaml()
      .replace("name: Current home", "name: Current home # current comment");
    const milestone = ProjectWorkspace.create("Measured home").exportYaml()
      .replace("name: Measured home", "name: Measured home # milestone comment");
    const checkpoints = [checkpoint("checkpoint-1", "Measurements done", milestone)];

    const archive = exportProjectArchive(current, checkpoints);
    const imported = importProjectArchive(archive);

    expect(imported.projectSource).toBe(current);
    expect(imported.checkpoints).toEqual(checkpoints);
    expect(imported.workspace.exportYaml()).toBe(current);
  });

  it.each([
    ["path traversal", "../project.yaml"],
    ["absolute paths", "/project.yaml"],
    ["Windows paths", "checkpoints\\checkpoint.yaml"]
  ])("rejects %s atomically", (_label, maliciousPath) => {
    const archive = zipSync({
      [maliciousPath]: strToU8("malicious"),
      "project.yaml": strToU8(ProjectWorkspace.create("Safe").exportYaml()),
      "archive.json": strToU8(JSON.stringify({
        format: "smarchitect-project-archive",
        archiveVersion: 1,
        checkpoints: []
      }))
    });

    expect(() => importProjectArchive(archive)).toThrow(ProjectArchiveError);
  });

  it("rejects duplicate ZIP entries before importing any state", () => {
    const project = ProjectWorkspace.create("Safe").exportYaml();
    const archive = exportProjectArchive(project, []);
    const duplicate = new Uint8Array(archive.length + 0);
    duplicate.set(archive);

    // The ZIP parser's duplicate-entry guard is separately exposed through a
    // deliberately malformed archive made by replacing archive.json's name in
    // the central and local records with project.yaml (same byte length).
    const needle = strToU8("archive.json");
    const replacement = strToU8("project.yaml");
    for (let offset = 0; offset <= duplicate.length - needle.length; offset += 1) {
      if (needle.every((byte, index) => duplicate[offset + index] === byte)) {
        duplicate.set(replacement, offset);
      }
    }

    expect(() => importProjectArchive(duplicate)).toThrow(/duplicate/i);
  });

  it("rejects malformed Checkpoints and unsupported schema versions", () => {
    const manifest = {
      format: "smarchitect-project-archive",
      archiveVersion: 1,
      checkpoints: [{
        id: "checkpoint-1",
        name: "Bad milestone",
        createdAt: "2026-08-03T10:00:00.000Z",
        path: "checkpoints/checkpoint-1.yaml"
      }]
    };
    const current = ProjectWorkspace.create("Safe").exportYaml();
    const malformed = zipSync({
      "project.yaml": strToU8(current),
      "archive.json": strToU8(JSON.stringify(manifest)),
      "checkpoints/checkpoint-1.yaml": strToU8("not: a project")
    });
    const future = zipSync({
      "project.yaml": strToU8(current.replace("1.1.0", "99.0.0")),
      "archive.json": strToU8(JSON.stringify({ ...manifest, checkpoints: [] }))
    });

    expect(() => importProjectArchive(malformed)).toThrow(/Checkpoint/i);
    expect(() => importProjectArchive(future)).toThrow(/schema version/i);
  });

  it("previews and atomically migrates every supported older document", () => {
    const toLegacy = (source: string) => source
      .replace("schemaVersion: 1.1.0", "schemaVersion: 1.0.0")
      .replace(
        "schemaDialect: https://json-schema.org/draft/2020-12/schema\n",
        ""
      );
    const project = toLegacy(
      ProjectWorkspace.create("Legacy current").exportYaml()
        .replace("name: Legacy current", "name: Legacy current # current")
    );
    const milestone = toLegacy(
      ProjectWorkspace.create("Legacy milestone").exportYaml()
        .replace("name: Legacy milestone", "name: Legacy milestone # saved")
    );
    const manifest = {
      format: "smarchitect-project-archive",
      archiveVersion: 1,
      checkpoints: [{
        id: "checkpoint-legacy",
        name: "Legacy saved",
        createdAt: "2026-08-03T10:00:00.000Z",
        path: "checkpoints/checkpoint-legacy.yaml"
      }]
    };
    const originalArchive = zipSync({
      "project.yaml": strToU8(project),
      "archive.json": strToU8(JSON.stringify(manifest)),
      "checkpoints/checkpoint-legacy.yaml": strToU8(milestone)
    });

    const preview = previewProjectArchiveMigration(originalArchive)!;

    expect(preview.documents.map(({ path }) => path)).toEqual([
      "project.yaml",
      "checkpoints/checkpoint-legacy.yaml"
    ]);
    expect(preview.originalArchive).toEqual(originalArchive);
    expect(preview.imported.projectSource).toContain("# current");
    expect(preview.imported.checkpoints[0]?.source).toContain("# saved");
    expect(preview.imported.workspace.document.schemaVersion).toBe("1.1.0");
    expect(() => importProjectArchive(originalArchive)).toThrow(/migration/i);
  });
});
