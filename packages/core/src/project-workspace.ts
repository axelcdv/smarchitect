import { stringify } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type EntityKind,
  type IdFactory,
  type Level,
  type OpeningInput,
  type OpeningUpdate,
  type PointMm,
  type ProjectDocument,
  type WallInput,
  type WallUpdate
} from "./types.js";
import {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
import { normalizeAngleDeg } from "./wall-geometry.js";

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
    walls: [],
    openings: [],
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
  #idFactory: IdFactory;

  private constructor(document: ProjectDocument, idFactory: IdFactory = defaultIdFactory) {
    this.#document = cloneProjectDocument(document);
    this.#idFactory = idFactory;
  }

  static create(
    name: string,
    options: CreateProjectDocumentOptions = {}
  ): ProjectWorkspace {
    return new ProjectWorkspace(
      createProjectDocument(name, options),
      options.idFactory ?? defaultIdFactory
    );
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

    return new ProjectWorkspace(candidate, this.#idFactory);
  }

  #replaceActiveLevel(update: (level: Level) => void): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const level = candidate.levels.find(({ id }) => id === candidate.activeLevelId);

    if (!level) {
      throw new Error("The active Level is missing from the Project Document.");
    }

    update(level);
    const diagnostics = validateProjectDocument(candidate);
    if (diagnostics.length) {
      throw new ProjectValidationError(diagnostics);
    }
    return new ProjectWorkspace(candidate, this.#idFactory);
  }

  addWall(input: WallInput): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      level.walls.push({
        id: this.#idFactory("wall"),
        path: { kind: "straight", start: input.start, end: input.end },
        thicknessMm: input.thicknessMm ?? 150,
        heightMm: input.heightMm ?? level.defaultWallHeightMm,
        extensions: {}
      });
    });
  }

  updateWall(id: string, update: WallUpdate): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const wall = level.walls.find((candidate) => candidate.id === id);
      if (!wall) throw new Error(`Wall "${id}" does not exist.`);
      const start = update.start ?? wall.path.start;
      const currentEnd = update.end ?? wall.path.end;
      const length = update.lengthMm ?? Math.hypot(
        currentEnd.x - start.x,
        currentEnd.y - start.y
      );
      const angle = update.angleDeg === undefined
        ? Math.atan2(currentEnd.y - start.y, currentEnd.x - start.x)
        : normalizeAngleDeg(update.angleDeg) * Math.PI / 180;
      wall.path = {
        kind: "straight",
        start: { ...start },
        end: update.end && update.lengthMm === undefined && update.angleDeg === undefined
          ? { ...update.end }
          : {
              x: Math.round(start.x + Math.cos(angle) * length),
              y: Math.round(start.y + Math.sin(angle) * length)
            }
      };
      wall.thicknessMm = update.thicknessMm ?? wall.thicknessMm;
      wall.heightMm = update.heightMm ?? wall.heightMm;
    });
  }

  moveWall(id: string, delta: PointMm): ProjectWorkspace {
    const wall = this.activeLevel.walls.find((candidate) => candidate.id === id);
    if (!wall) throw new Error(`Wall "${id}" does not exist.`);
    return this.updateWall(id, {
      start: {
        x: wall.path.start.x + delta.x,
        y: wall.path.start.y + delta.y
      },
      end: {
        x: wall.path.end.x + delta.x,
        y: wall.path.end.y + delta.y
      }
    });
  }

  deleteWall(id: string): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const count = level.walls.length;
      level.walls = level.walls.filter((wall) => wall.id !== id);
      if (level.walls.length === count) throw new Error(`Wall "${id}" does not exist.`);
    });
  }

  addOpening(input: OpeningInput): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      level.openings.push({
        ...structuredClone(input),
        id: this.#idFactory("opening"),
        extensions: {}
      });
    });
  }

  updateOpening(id: string, update: OpeningUpdate): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const opening = level.openings.find((candidate) => candidate.id === id);
      if (!opening) throw new Error(`Opening "${id}" does not exist.`);
      Object.assign(opening, structuredClone(update));
    });
  }

  moveOpening(id: string, deltaMm: number): ProjectWorkspace {
    const opening = this.activeLevel.openings.find((candidate) => candidate.id === id);
    if (!opening) throw new Error(`Opening "${id}" does not exist.`);
    return this.updateOpening(id, {
      positionMm: opening.positionMm + Math.round(deltaMm)
    });
  }

  deleteOpening(id: string): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const count = level.openings.length;
      level.openings = level.openings.filter((opening) => opening.id !== id);
      if (level.openings.length === count) {
        throw new Error(`Opening "${id}" does not exist.`);
      }
    });
  }

  exportYaml(): string {
    return stringify(this.#document, {
      lineWidth: 0
    });
  }
}
