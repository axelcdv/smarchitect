import { stringify } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type EntityKind,
  type IdFactory,
  type Level,
  type ProjectDocument
} from "./types.js";
import {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";

const DEFAULT_LEVEL_NAME = "Ground floor";
const DEFAULT_WALL_HEIGHT_MM = 2500;

function defaultIdFactory(kind: EntityKind): string {
  return `${kind}_${globalThis.crypto.randomUUID()}`;
}

function cloneProjectDocument(document: ProjectDocument): ProjectDocument {
  return structuredClone(document);
}

function assertNonEmptyName(name: string, subject: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error(`${subject} name must not be empty.`);
  }

  return normalizedName;
}

export function createProjectDocument(
  name: string,
  options: CreateProjectDocumentOptions = {}
): ProjectDocument {
  const idFactory: IdFactory = options.idFactory ?? defaultIdFactory;
  const projectId = idFactory("project");
  const level: Level = {
    id: idFactory("level"),
    name: DEFAULT_LEVEL_NAME,
    baseElevationMm: 0,
    defaultWallHeightMm: DEFAULT_WALL_HEIGHT_MM,
    extensions: {}
  };
  const document: ProjectDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projectId,
    name: assertNonEmptyName(name, "Project"),
    units: "metric",
    activeLevelId: level.id,
    levels: [level],
    extensions: {}
  };
  const diagnostics = validateProjectDocument(document);

  if (diagnostics.length) {
    throw new ProjectValidationError(diagnostics);
  }

  return document;
}

export class ProjectValidationError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super("Project Document validation failed.");
    this.name = "ProjectValidationError";
    this.diagnostics = diagnostics;
  }
}

export class ProjectWorkspace {
  #document: ProjectDocument;

  private constructor(document: ProjectDocument) {
    this.#document = cloneProjectDocument(document);
  }

  static create(
    name: string,
    options: CreateProjectDocumentOptions = {}
  ): ProjectWorkspace {
    return new ProjectWorkspace(createProjectDocument(name, options));
  }

  static importYaml(source: string): ProjectWorkspace {
    const result = parseProjectDocument(source);

    if (!result.document) {
      throw new ProjectValidationError(result.diagnostics);
    }

    return new ProjectWorkspace(result.document);
  }

  get document(): ProjectDocument {
    return cloneProjectDocument(this.#document);
  }

  get activeLevel(): Level {
    const level = this.#document.levels.find(
      ({ id }) => id === this.#document.activeLevelId
    );

    if (!level) {
      throw new Error("The active Level is missing from the Project Document.");
    }

    return structuredClone(level);
  }

  get diagnostics(): Diagnostic[] {
    return validateProjectDocument(this.#document);
  }

  rename(name: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    candidate.name = assertNonEmptyName(name, "Project");
    const diagnostics = validateProjectDocument(candidate);

    if (diagnostics.length) {
      throw new ProjectValidationError(diagnostics);
    }

    return new ProjectWorkspace(candidate);
  }

  exportYaml(): string {
    return stringify(this.#document, {
      lineWidth: 0
    });
  }
}
