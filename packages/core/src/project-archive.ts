import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { previewProjectDocumentMigration } from "./migration.js";
import { ProjectValidationError, ProjectWorkspace } from "./project-workspace.js";
import type { ProjectDocumentMigrationPreview } from "./types.js";

const ARCHIVE_FORMAT = "smarchitect-project-archive";
const ARCHIVE_VERSION = 1;

export interface ProjectCheckpoint {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly source: string;
}

export interface ImportedProjectArchive {
  readonly workspace: ProjectWorkspace;
  readonly projectSource: string;
  readonly checkpoints: readonly ProjectCheckpoint[];
}

export interface ProjectArchiveDocumentMigrationPreview
  extends ProjectDocumentMigrationPreview {
  readonly path: string;
}

export interface ProjectArchiveMigrationPreview {
  readonly originalArchive: Uint8Array;
  readonly migratedArchive: Uint8Array;
  readonly imported: ImportedProjectArchive;
  readonly documents: readonly ProjectArchiveDocumentMigrationPreview[];
}

interface ProjectArchiveSources {
  projectSource: string;
  checkpoints: ProjectCheckpoint[];
}

interface ArchiveCheckpointManifest {
  id: string;
  name: string;
  createdAt: string;
  path: string;
}

interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  archiveVersion: typeof ARCHIVE_VERSION;
  checkpoints: ArchiveCheckpointManifest[];
}

export class ProjectArchiveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectArchiveError";
  }
}

function checkpointPath(id: string): string {
  return `checkpoints/${encodeURIComponent(id)}.yaml`;
}

function assertCheckpoint(checkpoint: ProjectCheckpoint): void {
  if (!checkpoint.id.trim()) throw new ProjectArchiveError("A Checkpoint id is required.");
  if (!checkpoint.name.trim()) {
    throw new ProjectArchiveError("A Checkpoint name is required.");
  }
  if (!Number.isFinite(Date.parse(checkpoint.createdAt))) {
    throw new ProjectArchiveError("A Checkpoint creation date is invalid.");
  }
  try {
    ProjectWorkspace.importYaml(checkpoint.source);
  } catch (cause) {
    throw new ProjectArchiveError(
      `Checkpoint “${checkpoint.name}” is malformed.`,
      { cause }
    );
  }
}

export function exportProjectArchive(
  projectSource: string,
  checkpoints: readonly ProjectCheckpoint[]
): Uint8Array {
  try {
    ProjectWorkspace.importYaml(projectSource);
  } catch (cause) {
    throw new ProjectArchiveError("The current Project Document is invalid.", {
      cause
    });
  }
  checkpoints.forEach(assertCheckpoint);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (ids.has(checkpoint.id)) {
      throw new ProjectArchiveError(`Duplicate Checkpoint id: ${checkpoint.id}.`);
    }
    const path = checkpointPath(checkpoint.id);
    if (names.has(path)) {
      throw new ProjectArchiveError(`Duplicate Checkpoint path: ${path}.`);
    }
    ids.add(checkpoint.id);
    names.add(path);
  }

  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    archiveVersion: ARCHIVE_VERSION,
    checkpoints: checkpoints.map(({ id, name, createdAt }) => ({
      id,
      name,
      createdAt,
      path: checkpointPath(id)
    }))
  };
  const files: Record<string, Uint8Array> = {
    "project.yaml": strToU8(projectSource),
    "archive.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  };
  for (const checkpoint of checkpoints) {
    files[checkpointPath(checkpoint.id)] = strToU8(checkpoint.source);
  }
  return zipSync(files, { level: 6 });
}

function assertSafeEntryName(name: string): void {
  if (
    !name
    || name.startsWith("/")
    || name.includes("\\")
    || name.includes("\0")
    || /^[A-Za-z]:/.test(name)
    || name.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ProjectArchiveError(`Unsafe Project Archive entry path: ${name}.`);
  }
}

function readManifest(source: Uint8Array | undefined): ArchiveManifest {
  if (!source) throw new ProjectArchiveError("Project Archive is missing archive.json.");
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(source));
  } catch (cause) {
    throw new ProjectArchiveError("Project Archive manifest is malformed.", {
      cause
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectArchiveError("Project Archive manifest is malformed.");
  }
  const manifest = value as Record<string, unknown>;
  const expectedKeys = ["archiveVersion", "checkpoints", "format"];
  if (
    Object.keys(manifest).sort().join("|") !== expectedKeys.join("|")
    || manifest.format !== ARCHIVE_FORMAT
  ) {
    throw new ProjectArchiveError("Project Archive manifest is unsupported.");
  }
  if (manifest.archiveVersion !== ARCHIVE_VERSION) {
    throw new ProjectArchiveError(
      `Unsupported Project Archive schema version: ${String(manifest.archiveVersion)}.`
    );
  }
  if (!Array.isArray(manifest.checkpoints)) {
    throw new ProjectArchiveError("Project Archive Checkpoint list is malformed.");
  }
  const checkpoints = manifest.checkpoints.map((candidate): ArchiveCheckpointManifest => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ProjectArchiveError("Project Archive Checkpoint metadata is malformed.");
    }
    const record = candidate as Record<string, unknown>;
    const keys = ["createdAt", "id", "name", "path"];
    if (
      Object.keys(record).sort().join("|") !== keys.join("|")
      || typeof record.id !== "string"
      || typeof record.name !== "string"
      || typeof record.createdAt !== "string"
      || typeof record.path !== "string"
    ) {
      throw new ProjectArchiveError("Project Archive Checkpoint metadata is malformed.");
    }
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      path: record.path
    };
  });
  return {
    format: ARCHIVE_FORMAT,
    archiveVersion: ARCHIVE_VERSION,
    checkpoints
  };
}

function readProjectArchiveSources(data: Uint8Array): ProjectArchiveSources {
  const names = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: ({ name }) => {
        assertSafeEntryName(name);
        if (names.has(name)) {
          throw new ProjectArchiveError(`Duplicate Project Archive entry: ${name}.`);
        }
        names.add(name);
        return true;
      }
    });
  } catch (cause) {
    if (cause instanceof ProjectArchiveError) throw cause;
    throw new ProjectArchiveError("Project Archive ZIP is malformed.", { cause });
  }

  const manifest = readManifest(files["archive.json"]);
  const allowedNames = new Set(["archive.json", "project.yaml"]);
  const ids = new Set<string>();
  const checkpoints: ProjectCheckpoint[] = manifest.checkpoints.map((entry) => {
    assertSafeEntryName(entry.path);
    if (entry.path !== checkpointPath(entry.id)) {
      throw new ProjectArchiveError(`Checkpoint path does not match its id: ${entry.path}.`);
    }
    if (ids.has(entry.id) || allowedNames.has(entry.path)) {
      throw new ProjectArchiveError(`Duplicate Checkpoint metadata: ${entry.id}.`);
    }
    ids.add(entry.id);
    allowedNames.add(entry.path);
    const source = files[entry.path];
    if (!source) {
      throw new ProjectArchiveError(`Project Archive is missing ${entry.path}.`);
    }
    const checkpoint: ProjectCheckpoint = {
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      source: strFromU8(source)
    };
    return checkpoint;
  });
  for (const name of names) {
    if (!allowedNames.has(name)) {
      throw new ProjectArchiveError(`Unexpected Project Archive entry: ${name}.`);
    }
  }
  const projectBytes = files["project.yaml"];
  if (!projectBytes) throw new ProjectArchiveError("Project Archive is missing project.yaml.");
  const projectSource = strFromU8(projectBytes);
  return { projectSource, checkpoints };
}

function importCurrentProjectSource(source: string, context: string): ProjectWorkspace {
  try {
    return ProjectWorkspace.importYaml(source);
  } catch (cause) {
    const message = cause instanceof ProjectValidationError
      ? cause.diagnostics.map(({ message }) => message).join(" ")
      : `${context} is malformed.`;
    throw new ProjectArchiveError(`${context}: ${message}`, { cause });
  }
}

export function importProjectArchive(data: Uint8Array): ImportedProjectArchive {
  const { projectSource, checkpoints } = readProjectArchiveSources(data);
  const workspace = importCurrentProjectSource(
    projectSource,
    "The current Project Document"
  );
  checkpoints.forEach((checkpoint) => assertCheckpoint(checkpoint));
  return { workspace, projectSource, checkpoints };
}

function migrateProjectSource(
  source: string,
  path: string,
  context: string,
  previews: ProjectArchiveDocumentMigrationPreview[]
): string {
  try {
    ProjectWorkspace.importYaml(source);
    return source;
  } catch (cause) {
    const migrationRequired = cause instanceof ProjectValidationError
      && cause.diagnostics.some(
        ({ code }) => code === "schema-version.migration-required"
      );
    if (!migrationRequired) {
      const message = cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : `${context} is malformed.`;
      throw new ProjectArchiveError(`${context}: ${message}`, { cause });
    }
    try {
      const preview = previewProjectDocumentMigration(source);
      previews.push({ path, ...preview });
      return preview.migratedSource;
    } catch (migrationCause) {
      throw new ProjectArchiveError(`${context} cannot be migrated.`, {
        cause: migrationCause
      });
    }
  }
}

export function previewProjectArchiveMigration(
  data: Uint8Array
): ProjectArchiveMigrationPreview | undefined {
  const sources = readProjectArchiveSources(data);
  const documents: ProjectArchiveDocumentMigrationPreview[] = [];
  const projectSource = migrateProjectSource(
    sources.projectSource,
    "project.yaml",
    "The current Project Document",
    documents
  );
  const checkpoints = sources.checkpoints.map((checkpoint) => ({
    ...checkpoint,
    source: migrateProjectSource(
      checkpoint.source,
      checkpointPath(checkpoint.id),
      `Checkpoint “${checkpoint.name}”`,
      documents
    )
  }));
  if (!documents.length) return undefined;
  const migratedArchive = exportProjectArchive(projectSource, checkpoints);
  return {
    originalArchive: new Uint8Array(data),
    migratedArchive,
    imported: importProjectArchive(migratedArchive),
    documents
  };
}
