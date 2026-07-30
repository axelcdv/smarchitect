import { parseDocument, stringify, type Document } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type EntityKind,
  type IdFactory,
  type Level,
  type PointMm,
  type ProjectDocument,
  type Room,
  type RoomLabelInput,
  type RoomLabelUpdate,
  type WallInput,
  type WallUpdate
} from "./types.js";
import {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
import { normalizeAngleDeg } from "./wall-geometry.js";
import { deriveRooms, findRoomContainingPoint } from "./room-geometry.js";

const DEFAULT_LEVEL_NAME = "Ground floor";
const DEFAULT_WALL_HEIGHT_MM = 2500;

function defaultIdFactory(kind: EntityKind): string {
  return `${kind}_${globalThis.crypto.randomUUID()}`;
}

function cloneProjectDocument(document: ProjectDocument): ProjectDocument {
  return structuredClone(document);
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reconcileYamlNode(
  yamlDocument: Document,
  path: readonly (string | number)[],
  previous: unknown,
  next: unknown
): void {
  if (valuesMatch(previous, next)) return;

  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length === next.length) {
      next.forEach((value, index) => {
        reconcileYamlNode(yamlDocument, [...path, index], previous[index], value);
      });
      return;
    }
    if (
      next.length === previous.length + 1
      && valuesMatch(previous, next.slice(0, -1))
    ) {
      yamlDocument.setIn([...path, previous.length], next.at(-1));
      return;
    }
    if (previous.length === next.length + 1) {
      const removedIndex = previous.findIndex((_value, index) =>
        valuesMatch(
          [...previous.slice(0, index), ...previous.slice(index + 1)],
          next
        )
      );
      if (removedIndex >= 0) {
        yamlDocument.deleteIn([...path, removedIndex]);
        return;
      }
    }
    yamlDocument.setIn(path, next);
    return;
  }

  if (isRecord(previous) && isRecord(next)) {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) yamlDocument.deleteIn([...path, key]);
    }
    for (const [key, value] of Object.entries(next)) {
      if (!(key in previous)) {
        yamlDocument.setIn([...path, key], value);
      } else {
        reconcileYamlNode(yamlDocument, [...path, key], previous[key], value);
      }
    }
    return;
  }

  yamlDocument.setIn(path, next);
}

function updateYamlSource(
  source: string,
  previous: ProjectDocument,
  next: ProjectDocument
): string {
  const yamlDocument = parseDocument(source);
  reconcileYamlNode(yamlDocument, [], previous, next);
  return yamlDocument.toString({ lineWidth: 0 });
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
    roomLabels: [],
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
  #source: string;

  private constructor(
    document: ProjectDocument,
    idFactory: IdFactory = defaultIdFactory,
    source: string = stringify(document, { lineWidth: 0 })
  ) {
    this.#document = cloneProjectDocument(document);
    this.#idFactory = idFactory;
    this.#source = source;
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

    const document = cloneProjectDocument(result.document);
    for (const level of document.levels) {
      level.roomLabels ??= [];
    }
    return new ProjectWorkspace(document, defaultIdFactory, source);
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
    const diagnostics = validateProjectDocument(this.#document);
    const levelIndex = this.#document.levels.findIndex(
      ({ id }) => id === this.#document.activeLevelId
    );
    const level = this.#document.levels[levelIndex];
    if (!level) return diagnostics;
    const rooms = deriveRooms(level.walls, level.roomLabels);
    for (const [labelIndex, label] of level.roomLabels.entries()) {
      if (!findRoomContainingPoint(label.position, rooms)) {
        diagnostics.push({
          code: "room-label.outside-room",
          severity: "warning",
          path: `/levels/${levelIndex}/roomLabels/${labelIndex}/position`,
          message: `Room Label "${label.name}" is outside every enclosed Room. Move it inside a Room or delete it.`
        });
      }
    }
    for (const room of rooms) {
      if (room.labelIds.length > 1) {
        const names = level.roomLabels
          .filter(({ id }) => room.labelIds.includes(id))
          .map(({ name }) => `"${name}"`)
          .join(", ");
        diagnostics.push({
          code: "room-label.merge-conflict",
          severity: "warning",
          path: `/levels/${levelIndex}/roomLabels`,
          message: `Merged Room contains multiple labels (${names}). Move or delete labels to choose one explicitly.`
        });
      }
    }
    return diagnostics;
  }

  get rooms(): Room[] {
    const level = this.activeLevel;
    return deriveRooms(level.walls, level.roomLabels);
  }

  rename(name: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    candidate.name = assertNonEmptyName(name, "Project");
    const diagnostics = validateProjectDocument(candidate);

    if (diagnostics.length) {
      throw new ProjectValidationError(diagnostics);
    }

    return new ProjectWorkspace(
      candidate,
      this.#idFactory,
      updateYamlSource(this.#source, this.#document, candidate)
    );
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
    return new ProjectWorkspace(
      candidate,
      this.#idFactory,
      updateYamlSource(this.#source, this.#document, candidate)
    );
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

  addRoomLabel(input: RoomLabelInput): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      level.roomLabels.push({
        id: this.#idFactory("room-label"),
        name: assertNonEmptyName(input.name, "Room Label"),
        position: { ...input.position },
        extensions: {}
      });
    });
  }

  updateRoomLabel(id: string, update: RoomLabelUpdate): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const label = level.roomLabels.find((candidate) => candidate.id === id);
      if (!label) throw new Error(`Room Label "${id}" does not exist.`);
      if (update.name !== undefined) {
        label.name = assertNonEmptyName(update.name, "Room Label");
      }
      if (update.position) label.position = { ...update.position };
    });
  }

  moveRoomLabel(id: string, delta: PointMm): ProjectWorkspace {
    const label = this.activeLevel.roomLabels.find((candidate) => candidate.id === id);
    if (!label) throw new Error(`Room Label "${id}" does not exist.`);
    return this.updateRoomLabel(id, {
      position: {
        x: label.position.x + delta.x,
        y: label.position.y + delta.y
      }
    });
  }

  deleteRoomLabel(id: string): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const count = level.roomLabels.length;
      level.roomLabels = level.roomLabels.filter((label) => label.id !== id);
      if (level.roomLabels.length === count) {
        throw new Error(`Room Label "${id}" does not exist.`);
      }
    });
  }

  exportYaml(): string {
    return this.#source;
  }
}
