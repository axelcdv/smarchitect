import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "smarchitect-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function executeCli(
  args: string[],
  input = ""
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

const validYaml = `schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
id: project_00000000-0000-4000-8000-000000000001
name: Black-box project
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

describe("smarchitect executable", () => {
  it("validates standard input and reports invalid raw YAML with stable statuses", async () => {
    const valid = await executeCli(["validate", "-"], validYaml);
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toEqual({ ok: true, valid: true, diagnostics: [] });
    expect(valid.stderr).toBe("");

    const invalid = await executeCli(["validate", "-"], "name: [broken");
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false,
      valid: false,
      diagnostics: [{ severity: "error" }]
    });

    const semantic = await executeCli(["validate", "-"], validYaml.replace(
      "activeLevelId: level_00000000-0000-4000-8000-000000000002",
      "activeLevelId: level_00000000-0000-4000-8000-000000000999"
    ));
    expect(semantic.status).toBe(1);
    expect(JSON.parse(semantic.stdout)).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "active-level.missing",
        severity: "error",
        path: "/activeLevelId"
      }]
    });
  });

  it("inspects files and emits the complete semantic document", async () => {
    const directory = await temporaryDirectory();
    const projectPath = join(directory, "project.yaml");
    await writeFile(projectPath, validYaml, "utf8");

    const result = await executeCli(["inspect", projectPath]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      document: { name: "Black-box project", levels: [{ name: "Ground floor" }] },
      activeLevel: { name: "Ground floor" }
    });
  });

  it("atomically applies a batch to an explicit file", async () => {
    const directory = await temporaryDirectory();
    const projectPath = join(directory, "project.yaml");
    const operationsPath = join(directory, "operations.json");
    const resultPath = join(directory, "result.yaml");
    await writeFile(projectPath, validYaml, "utf8");
    await writeFile(operationsPath, JSON.stringify({
      version: 1,
      timestamp: "2026-08-03T12:00:00.000Z",
      operations: [{
        op: "wall.add",
        id: "wall_00000000-0000-4000-8000-000000000003",
        input: { start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } }
      }]
    }), "utf8");

    const success = await executeCli([
      "apply", projectPath, "--operations", operationsPath, "--output", resultPath
    ]);
    expect(success.status).toBe(0);
    expect(JSON.parse(success.stdout)).toMatchObject({ ok: true, applied: 1, output: resultPath });
    expect(await readFile(resultPath, "utf8")).toContain(
      "id: wall_00000000-0000-4000-8000-000000000003"
    );

    await writeFile(operationsPath, JSON.stringify({
      version: 1,
      operations: [{
        op: "wall.update",
        id: "wall_00000000-0000-4000-8000-000000000999",
        update: { heightMm: 3000 }
      }]
    }), "utf8");
    const original = await readFile(projectPath, "utf8");
    const failure = await executeCli([
      "apply", projectPath, "--operations", operationsPath, "--output", projectPath
    ]);
    expect(failure.status).toBe(1);
    expect(await readFile(projectPath, "utf8")).toBe(original);
    expect(JSON.parse(failure.stderr)).toMatchObject({
      ok: false,
      applied: false,
      failedOperation: 0
    });
  });

  it("previews and performs migration without mutating the legacy input", async () => {
    const directory = await temporaryDirectory();
    const legacyPath = join(directory, "legacy.yaml");
    const migratedPath = join(directory, "migrated.yaml");
    const legacy = validYaml
      .replace("schemaVersion: 1.1.0", "schemaVersion: 1.0.0")
      .replace("schemaDialect: https://json-schema.org/draft/2020-12/schema\n", "");
    await writeFile(legacyPath, legacy, "utf8");

    const preview = await executeCli(["migrate", legacyPath, "--preview"]);
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      ok: true,
      migration: { sourceVersion: "1.0.0", targetVersion: "1.1.0" }
    });
    const perform = await executeCli([
      "migrate", legacyPath, "--output", migratedPath
    ]);
    expect(perform.status).toBe(0);
    expect(await readFile(legacyPath, "utf8")).toBe(legacy);
    expect(await readFile(migratedPath, "utf8")).toContain("schemaVersion: 1.1.0");
  });
});
