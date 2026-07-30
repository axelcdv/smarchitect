import { stringify } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type EntityKind,
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementInput,
  type FurniturePlacementUpdate,
  type IdFactory,
  type Level,
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
    furniturePlacements: [],
    extensions: {}
  };
  const document: ProjectDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projectId,
    name: assertNonEmptyName(name, "Project"),
    units: "metric",
    activeLevelId: level.id,
    furnitureDefinitions: [],
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

  placeFurniture(
    definition: FurnitureDefinition,
    input: FurniturePlacementInput
  ): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const level = candidate.levels.find(({ id }) => id === candidate.activeLevelId);
    if (!level) throw new Error("The active Level is missing from the Project Document.");

    const embedded = candidate.furnitureDefinitions.find(
      ({ id }) => id === definition.id
    );
    if (embedded && JSON.stringify(embedded) !== JSON.stringify(definition)) {
      throw new Error(
        `Furniture Definition "${definition.id}" differs from the embedded snapshot.`
      );
    }
    if (!embedded) candidate.furnitureDefinitions.push(structuredClone(definition));
    level.furniturePlacements.push({
      id: this.#idFactory("furniture_placement"),
      definitionId: definition.id,
      position: { ...input.position },
      rotationDeg: normalizeAngleDeg(input.rotationDeg ?? 0),
      elevationMm: input.elevationMm ?? 0,
      extensions: {}
    });
    const diagnostics = validateProjectDocument(candidate);
    if (diagnostics.length) throw new ProjectValidationError(diagnostics);
    return new ProjectWorkspace(candidate, this.#idFactory);
  }

  updateFurniturePlacement(
    id: string,
    update: FurniturePlacementUpdate
  ): ProjectWorkspace {
    const unsupportedKeys = Object.keys(update).filter(
      (key) => !["position", "rotationDeg", "elevationMm"].includes(key)
    );
    if (unsupportedKeys.length) {
      throw new Error("Furniture Placement dimension overrides are not supported.");
    }
    return this.#replaceActiveLevel((level) => {
      const placement = level.furniturePlacements.find(
        (candidate) => candidate.id === id
      );
      if (!placement) throw new Error(`Furniture Placement "${id}" does not exist.`);
      if (update.position) placement.position = { ...update.position };
      if (update.rotationDeg !== undefined) {
        placement.rotationDeg = normalizeAngleDeg(update.rotationDeg);
      }
      if (update.elevationMm !== undefined) placement.elevationMm = update.elevationMm;
    });
  }

  updateFurnitureDefinition(
    id: string,
    update: FurnitureDefinitionUpdate
  ): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const definition = candidate.furnitureDefinitions.find(
      (item) => item.id === id
    );
    if (!definition) throw new Error(`Furniture Definition "${id}" does not exist.`);
    if (update.name !== undefined) {
      definition.name = assertNonEmptyName(update.name, "Furniture Definition");
    }
    if (update.widthMm !== undefined) definition.widthMm = update.widthMm;
    if (update.depthMm !== undefined) definition.depthMm = update.depthMm;
    if (update.heightMm !== undefined) definition.heightMm = update.heightMm;
    const diagnostics = validateProjectDocument(candidate);
    if (diagnostics.length) throw new ProjectValidationError(diagnostics);
    return new ProjectWorkspace(candidate, this.#idFactory);
  }

  makeFurniturePlacementUnique(id: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const level = candidate.levels.find(({ id: levelId }) =>
      levelId === candidate.activeLevelId
    );
    if (!level) throw new Error("The active Level is missing from the Project Document.");
    const placement = level.furniturePlacements.find(({ id: placementId }) =>
      placementId === id
    );
    if (!placement) throw new Error(`Furniture Placement "${id}" does not exist.`);
    const definition = candidate.furnitureDefinitions.find(
      ({ id: definitionId }) => definitionId === placement.definitionId
    );
    if (!definition) {
      throw new Error(`Furniture Definition "${placement.definitionId}" does not exist.`);
    }
    const copy = {
      ...structuredClone(definition),
      id: this.#idFactory("furniture_definition"),
      name: `${definition.name} copy`
    };
    candidate.furnitureDefinitions.push(copy);
    placement.definitionId = copy.id;
    const diagnostics = validateProjectDocument(candidate);
    if (diagnostics.length) throw new ProjectValidationError(diagnostics);
    return new ProjectWorkspace(candidate, this.#idFactory);
  }

  deleteFurniturePlacement(id: string): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const count = level.furniturePlacements.length;
      level.furniturePlacements = level.furniturePlacements.filter(
        (placement) => placement.id !== id
      );
      if (count === level.furniturePlacements.length) {
        throw new Error(`Furniture Placement "${id}" does not exist.`);
      }
    });
  }

  exportYaml(): string {
    return stringify(this.#document, {
      lineWidth: 0
    });
  }
}
