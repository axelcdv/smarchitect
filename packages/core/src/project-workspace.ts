import { isSeq, parseDocument, stringify, type Document } from "yaml";
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_DOCUMENT_SCHEMA_DIALECT,
  type CreateProjectDocumentOptions,
  type ActivePlanSelection,
  type DesignProposal,
  type Diagnostic,
  type FixtureDefinition,
  type FixtureDefinitionUpdate,
  type FixturePlacement,
  type FixturePlacementInput,
  type FixturePlacementUpdate,
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacement,
  type FurniturePlacementInput,
  type FurniturePlacementUpdate,
  type IdFactory,
  type Level,
  type LevelUpdate,
  type Opening,
  type OpeningConflictResolution,
  type OpeningInput,
  type OpeningUpdate,
  type PointMm,
  type PlanSnapshot,
  type ProposalStaleness,
  type ProjectDocument,
  type Room,
  type RoomLabelInput,
  type RoomLabelUpdate,
  type WallInput,
  type WallUpdate
} from "./types.js";
import { defaultIdFactory } from "./id-factory.js";
import {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
import { normalizeAngleDeg } from "./wall-geometry.js";
import { deriveRooms } from "./room-geometry.js";
import { wallPathLength } from "./opening-geometry.js";
import { designDiagnostics } from "./design-diagnostics.js";

const DEFAULT_LEVEL_NAME = "Ground floor";
const DEFAULT_WALL_HEIGHT_MM = 2500;

interface PlacementMechanics<
  Definition extends FurnitureDefinition | FixtureDefinition,
  Placement extends FurniturePlacement | FixturePlacement
> {
  label: "Furniture" | "Fixture";
  definitionIdKind: "furniture_definition" | "fixture_definition";
  placementIdKind: "furniture_placement" | "fixture_placement";
  definitions(plan: PlanSnapshot): Definition[] | undefined;
  ensureDefinitions(plan: PlanSnapshot): Definition[];
  placements(level: Level): Placement[] | undefined;
  ensurePlacements(level: Level): Placement[];
  replacePlacements(level: Level, placements: Placement[]): void;
  createPlacement(
    id: string,
    definitionId: string,
    input: FurniturePlacementInput
  ): Placement;
  copyDefinition(definition: Definition, id: string): Definition;
}

function createItemPlacement(
  id: string,
  definitionId: string,
  input: FurniturePlacementInput
): FurniturePlacement {
  return {
    id,
    definitionId,
    position: { ...input.position },
    rotationDeg: normalizeAngleDeg(input.rotationDeg ?? 0),
    elevationMm: input.elevationMm ?? 0,
    extensions: {}
  };
}

function copyItemDefinition(
  definition: FurnitureDefinition,
  id: string
): FurnitureDefinition {
  return {
    ...structuredClone(definition),
    id,
    name: `${definition.name} copy`
  };
}

const FURNITURE_PLACEMENT_MECHANICS: PlacementMechanics<
  FurnitureDefinition,
  FurniturePlacement
> = {
  label: "Furniture",
  definitionIdKind: "furniture_definition",
  placementIdKind: "furniture_placement",
  definitions: (document) => document.furnitureDefinitions,
  ensureDefinitions: (document) => document.furnitureDefinitions ??= [],
  placements: (level) => level.furniturePlacements,
  ensurePlacements: (level) => level.furniturePlacements ??= [],
  replacePlacements: (level, placements) => {
    level.furniturePlacements = placements;
  },
  createPlacement: createItemPlacement,
  copyDefinition: copyItemDefinition
};

const FIXTURE_PLACEMENT_MECHANICS: PlacementMechanics<
  FixtureDefinition,
  FixturePlacement
> = {
  label: "Fixture",
  definitionIdKind: "fixture_definition",
  placementIdKind: "fixture_placement",
  definitions: (document) => document.fixtureDefinitions,
  ensureDefinitions: (document) => document.fixtureDefinitions ??= [],
  placements: (level) => level.fixturePlacements,
  ensurePlacements: (level) => level.fixturePlacements ??= [],
  replacePlacements: (level, placements) => {
    level.fixturePlacements = placements;
  },
  createPlacement: createItemPlacement,
  copyDefinition: copyItemDefinition
};

function cloneProjectDocument(document: ProjectDocument): ProjectDocument {
  return structuredClone(document);
}

function selectedProposal(document: ProjectDocument): DesignProposal | undefined {
  if (document.activePlan?.kind !== "design-proposal") return undefined;
  const proposalId = document.activePlan.proposalId;
  return document.designProposals?.find(
    ({ id }) => id === proposalId
  );
}

function selectedPlan(document: ProjectDocument): PlanSnapshot {
  return selectedProposal(document) ?? document;
}

function selectedPlanPath(document: ProjectDocument): string {
  if (document.activePlan?.kind !== "design-proposal") return "";
  const proposalId = document.activePlan.proposalId;
  const proposalIndex = document.designProposals?.findIndex(
    ({ id }) => id === proposalId
  ) ?? -1;
  return proposalIndex >= 0 ? `/designProposals/${proposalIndex}` : "";
}

function revisionOf(document: ProjectDocument): number {
  return document.existingStateRevision ?? 0;
}

function revisedAtOf(document: ProjectDocument): string {
  return document.existingStateRevisedAt ?? new Date(0).toISOString();
}

function normalizePlan(plan: PlanSnapshot): void {
  for (const level of plan.levels) {
    level.roomLabels ??= [];
    level.openings ??= [];
  }
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === "string"
    ? value.id
    : undefined;
}

function reconcileYamlNode(
  yamlDocument: Document,
  path: readonly (string | number)[],
  previous: unknown,
  next: unknown
): void {
  if (valuesMatch(previous, next)) return;

  if (Array.isArray(previous) && Array.isArray(next)) {
    const previousIds = previous.map(entityId);
    const nextIds = next.map(entityId);
    const sequence = yamlDocument.getIn(path, true);
    if (
      previous.length > 0
      && previousIds.every((id): id is string => id !== undefined)
      && nextIds.every((id): id is string => id !== undefined)
      && new Set(previousIds).size === previousIds.length
      && new Set(nextIds).size === nextIds.length
      && isSeq(sequence)
    ) {
      const previousById = new Map(
        previousIds.map((id, index) => [id, previous[index]])
      );
      const nodesById = new Map(
        previousIds.map((id, index) => [id, sequence.items[index]])
      );
      sequence.items = next.map((value, index) =>
        nodesById.get(nextIds[index]!) ?? yamlDocument.createNode(value)
      );
      next.forEach((value, index) => {
        const oldValue = previousById.get(nextIds[index]!);
        if (oldValue !== undefined) {
          reconcileYamlNode(yamlDocument, [...path, index], oldValue, value);
        }
      });
      return;
    }
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

function openingFitsWall(opening: Opening, wall: Level["walls"][number]): boolean {
  const bottom = opening.kind === "window" ? opening.sillHeightMm : 0;
  return opening.positionMm + opening.widthMm <= wallPathLength(wall)
    && bottom + opening.heightMm <= wall.heightMm;
}

function fitOpeningToWall(opening: Opening, wall: Level["walls"][number]): void {
  opening.widthMm = Math.max(
    1,
    Math.min(opening.widthMm, Math.floor(wallPathLength(wall)))
  );
  opening.positionMm = Math.max(
    0,
    Math.min(
      opening.positionMm,
      Math.floor(wallPathLength(wall) - opening.widthMm)
    )
  );
  if (opening.kind === "window") {
    opening.sillHeightMm = Math.min(opening.sillHeightMm, wall.heightMm - 1);
    opening.heightMm = Math.max(
      1,
      Math.min(opening.heightMm, wall.heightMm - opening.sillHeightMm)
    );
  } else {
    opening.heightMm = Math.max(1, Math.min(opening.heightMm, wall.heightMm));
  }
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
    openings: [],
    furniturePlacements: [],
    fixturePlacements: [],
    extensions: {}
  };
  const document: ProjectDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    schemaDialect: PROJECT_DOCUMENT_SCHEMA_DIALECT,
    id: projectId,
    name: assertNonEmptyName(name, "Project"),
    units: "metric",
    activeLevelId: level.id,
    furnitureDefinitions: [],
    fixtureDefinitions: [],
    levels: [level],
    existingStateRevision: 0,
    existingStateRevisedAt: (options.now ?? (() => new Date()))().toISOString(),
    activePlan: { kind: "existing-state" },
    designProposals: [],
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
  #diagnostics?: Diagnostic[];
  #activeDiagnostics?: Diagnostic[];
  #idFactory: IdFactory;
  #source: string;
  #now: () => Date;

  private constructor(
    document: ProjectDocument,
    idFactory: IdFactory = defaultIdFactory,
    source: string = stringify(document, { lineWidth: 0 }),
    now: () => Date = () => new Date()
  ) {
    this.#document = cloneProjectDocument(document);
    this.#idFactory = idFactory;
    this.#source = source;
    this.#now = now;
  }

  static create(
    name: string,
    options: CreateProjectDocumentOptions = {}
  ): ProjectWorkspace {
    return new ProjectWorkspace(
      createProjectDocument(name, options),
      options.idFactory ?? defaultIdFactory,
      undefined,
      options.now
    );
  }

  static importYaml(
    source: string,
    options: Pick<CreateProjectDocumentOptions, "idFactory" | "now"> = {}
  ): ProjectWorkspace {
    const result = parseProjectDocument(source);

    if (!result.document) {
      throw new ProjectValidationError(result.diagnostics);
    }

    const document = cloneProjectDocument(result.document);
    normalizePlan(document);
    for (const proposal of document.designProposals ?? []) normalizePlan(proposal);
    document.existingStateRevision ??= 0;
    document.existingStateRevisedAt ??= new Date(0).toISOString();
    document.activePlan ??= { kind: "existing-state" };
    document.designProposals ??= [];
    return new ProjectWorkspace(
      document,
      options.idFactory ?? defaultIdFactory,
      source,
      options.now
    );
  }

  get document(): ProjectDocument {
    return cloneProjectDocument(this.#document);
  }

  get activeLevel(): Level {
    const plan = selectedPlan(this.#document);
    const level = plan.levels.find(
      ({ id }) => id === plan.activeLevelId
    );

    if (!level) {
      throw new Error("The active Level is missing from the Project Document.");
    }

    return structuredClone(level);
  }

  get diagnostics(): Diagnostic[] {
    if (this.#diagnostics) return structuredClone(this.#diagnostics);
    const diagnostics = validateProjectDocument(this.#document);
    const plans: Array<{ plan: PlanSnapshot; pathPrefix: string }> = [
      { plan: this.#document, pathPrefix: "" },
      ...(this.#document.designProposals ?? []).map((plan, index) => ({
        plan,
        pathPrefix: `/designProposals/${index}`
      }))
    ];
    for (const { plan, pathPrefix } of plans) {
      for (const [levelIndex, level] of plan.levels.entries()) {
        diagnostics.push(...designDiagnostics(
          level,
          plan.furnitureDefinitions ?? [],
          plan.fixtureDefinitions ?? [],
          { pathPrefix, levelIndex }
        ));
      }
    }
    this.#diagnostics = diagnostics;
    return structuredClone(diagnostics);
  }

  get activeDiagnostics(): Diagnostic[] {
    if (this.#activeDiagnostics) return structuredClone(this.#activeDiagnostics);
    const plan = selectedPlan(this.#document);
    const planPath = selectedPlanPath(this.#document);
    const levelIndex = plan.levels.findIndex(({ id }) => id === plan.activeLevelId);
    const levelPath = `${planPath}/levels/${levelIndex}`;
    this.#activeDiagnostics = this.diagnostics.filter((diagnostic) =>
      diagnostic.severity === "error" || diagnostic.path.startsWith(`${levelPath}/`)
    );
    return structuredClone(this.#activeDiagnostics);
  }

  get rooms(): Room[] {
    const level = this.activeLevel;
    return deriveRooms(level.walls, level.roomLabels);
  }

  get activePlanSelection(): ActivePlanSelection {
    return structuredClone(
      this.#document.activePlan ?? { kind: "existing-state" }
    );
  }

  get activePlan(): PlanSnapshot {
    return structuredClone(selectedPlan(this.#document));
  }

  get activeDesignProposal(): DesignProposal | undefined {
    const proposal = selectedProposal(this.#document);
    return proposal ? structuredClone(proposal) : undefined;
  }

  get activeProposalStaleness(): ProposalStaleness | undefined {
    const proposal = selectedProposal(this.#document);
    if (!proposal) return undefined;
    const currentRevision = revisionOf(this.#document);
    return {
      stale: proposal.sourceRevision < currentRevision,
      sourceRevision: proposal.sourceRevision,
      sourceRevisedAt: proposal.sourceRevisedAt,
      currentRevision,
      currentRevisedAt: revisedAtOf(this.#document)
    };
  }

  #acceptCandidate(candidate: ProjectDocument): ProjectWorkspace {
    const diagnostics = validateProjectDocument(candidate);

    if (diagnostics.length) {
      throw new ProjectValidationError(diagnostics);
    }

    return new ProjectWorkspace(
      candidate,
      this.#idFactory,
      updateYamlSource(this.#source, this.#document, candidate),
      this.#now
    );
  }

  rename(name: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    candidate.name = assertNonEmptyName(name, "Project");
    return this.#acceptCandidate(candidate);
  }

  updateLevel(update: LevelUpdate): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      if (update.name !== undefined) {
        level.name = assertNonEmptyName(update.name, "Level");
      }
      if (update.baseElevationMm !== undefined) {
        level.baseElevationMm = update.baseElevationMm;
      }
      if (update.defaultWallHeightMm !== undefined) {
        level.defaultWallHeightMm = update.defaultWallHeightMm;
      }
    });
  }

  #replaceActiveLevel(update: (level: Level) => void): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const plan = selectedPlan(candidate);
    const level = plan.levels.find(({ id }) => id === plan.activeLevelId);

    if (!level) {
      throw new Error("The active Level is missing from the Project Document.");
    }

    update(level);
    this.#recordExistingStateCorrection(candidate);
    return this.#acceptCandidate(candidate);
  }

  #recordExistingStateCorrection(candidate: ProjectDocument): void {
    if ((candidate.activePlan?.kind ?? "existing-state") !== "existing-state") {
      return;
    }
    candidate.existingStateRevision = revisionOf(candidate) + 1;
    candidate.existingStateRevisedAt = this.#now().toISOString();
  }

  createDesignProposal(name: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const proposal: DesignProposal = {
      id: this.#idFactory("design_proposal"),
      name: assertNonEmptyName(name, "Design Proposal"),
      sourceRevision: revisionOf(candidate),
      sourceRevisedAt: revisedAtOf(candidate),
      activeLevelId: candidate.activeLevelId,
      furnitureDefinitions: structuredClone(candidate.furnitureDefinitions ?? []),
      fixtureDefinitions: structuredClone(candidate.fixtureDefinitions ?? []),
      levels: structuredClone(candidate.levels),
      extensions: {}
    };
    candidate.designProposals ??= [];
    candidate.designProposals.push(proposal);
    candidate.activePlan = {
      kind: "design-proposal",
      proposalId: proposal.id
    };
    return this.#acceptCandidate(candidate);
  }

  renameDesignProposal(id: string, name: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const proposal = candidate.designProposals?.find(
      ({ id: proposalId }) => proposalId === id
    );
    if (!proposal) throw new Error(`Design Proposal "${id}" does not exist.`);
    proposal.name = assertNonEmptyName(name, "Design Proposal");
    return this.#acceptCandidate(candidate);
  }

  selectExistingState(): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    candidate.activePlan = { kind: "existing-state" };
    return this.#acceptCandidate(candidate);
  }

  selectDesignProposal(id: string): ProjectWorkspace {
    if (!this.#document.designProposals?.some(
      ({ id: proposalId }) => proposalId === id
    )) {
      throw new Error(`Design Proposal "${id}" does not exist.`);
    }
    const candidate = cloneProjectDocument(this.#document);
    candidate.activePlan = { kind: "design-proposal", proposalId: id };
    return this.#acceptCandidate(candidate);
  }

  navigateToDiagnostic(diagnostic: Diagnostic): ProjectWorkspace {
    const proposalMatch = diagnostic.path.match(
      /^\/designProposals\/(\d+)\/levels\/(\d+)(?:\/|$)/
    );
    const existingStateMatch = diagnostic.path.match(/^\/levels\/(\d+)(?:\/|$)/);
    const candidate = cloneProjectDocument(this.#document);
    let plan: PlanSnapshot;
    let levelIndex: number;

    if (proposalMatch) {
      const proposalIndex = Number(proposalMatch[1]);
      levelIndex = Number(proposalMatch[2]);
      const proposal = candidate.designProposals?.[proposalIndex];
      if (!proposal) throw new Error("The diagnostic Design Proposal is missing.");
      candidate.activePlan = {
        kind: "design-proposal",
        proposalId: proposal.id
      };
      plan = proposal;
    } else if (existingStateMatch) {
      levelIndex = Number(existingStateMatch[1]);
      candidate.activePlan = { kind: "existing-state" };
      plan = candidate;
    } else {
      throw new Error("The diagnostic does not identify a Plan Level.");
    }

    const level = plan.levels[levelIndex];
    if (!level) throw new Error("The diagnostic Level is missing.");
    plan.activeLevelId = level.id;
    return this.#acceptCandidate(candidate);
  }

  deleteDesignProposal(id: string): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const proposals = candidate.designProposals ?? [];
    const remaining = proposals.filter(({ id: proposalId }) => proposalId !== id);
    if (remaining.length === proposals.length) {
      throw new Error(`Design Proposal "${id}" does not exist.`);
    }
    candidate.designProposals = remaining;
    if (
      candidate.activePlan?.kind === "design-proposal"
      && candidate.activePlan.proposalId === id
    ) {
      candidate.activePlan = { kind: "existing-state" };
    }
    return this.#acceptCandidate(candidate);
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
      this.#applyWallUpdate(wall, update);
    });
  }

  #applyWallUpdate(wall: Level["walls"][number], update: WallUpdate): void {
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
  }

  updateWallResolvingOpenings(
    id: string,
    update: WallUpdate,
    resolution: OpeningConflictResolution
  ): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const wall = level.walls.find((candidate) => candidate.id === id);
      if (!wall) throw new Error(`Wall "${id}" does not exist.`);
      this.#applyWallUpdate(wall, update);
      const invalidIds = new Set(
        level.openings
          .filter((opening) =>
            opening.hostWallId === id && !openingFitsWall(opening, wall)
          )
          .map(({ id: openingId }) => openingId)
      );
      if (resolution === "delete") {
        level.openings = level.openings.filter(({ id: openingId }) =>
          !invalidIds.has(openingId)
        );
      } else {
        for (const opening of level.openings) {
          if (invalidIds.has(opening.id)) fitOpeningToWall(opening, wall);
        }
      }
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

  addOpening(input: OpeningInput): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      level.openings ??= [];
      level.openings.push({
        ...structuredClone(input),
        id: this.#idFactory("opening"),
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

  updateOpening(id: string, update: OpeningUpdate): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const opening = level.openings?.find((candidate) => candidate.id === id);
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

  deleteRoomLabel(id: string): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const count = level.roomLabels.length;
      level.roomLabels = level.roomLabels.filter((label) => label.id !== id);
      if (level.roomLabels.length === count) {
        throw new Error(`Room Label "${id}" does not exist.`);
      }
    });
  }

  placeFurniture(
    definition: FurnitureDefinition,
    input: FurniturePlacementInput
  ): ProjectWorkspace {
    return this.#placeItem(definition, input, FURNITURE_PLACEMENT_MECHANICS);
  }

  updateFurniturePlacement(
    id: string,
    update: FurniturePlacementUpdate
  ): ProjectWorkspace {
    return this.#updateItemPlacement(
      id,
      update,
      FURNITURE_PLACEMENT_MECHANICS
    );
  }

  updateFurnitureDefinition(
    id: string,
    update: FurnitureDefinitionUpdate
  ): ProjectWorkspace {
    return this.#updateItemDefinition(
      id,
      update,
      FURNITURE_PLACEMENT_MECHANICS
    );
  }

  makeFurniturePlacementUnique(id: string): ProjectWorkspace {
    return this.#makeItemPlacementUnique(
      id,
      FURNITURE_PLACEMENT_MECHANICS
    );
  }

  deleteFurniturePlacement(id: string): ProjectWorkspace {
    return this.#deleteItemPlacement(id, FURNITURE_PLACEMENT_MECHANICS);
  }

  placeFixture(
    definition: FixtureDefinition,
    input: FixturePlacementInput
  ): ProjectWorkspace {
    return this.#placeItem(definition, input, FIXTURE_PLACEMENT_MECHANICS);
  }

  updateFixturePlacement(
    id: string,
    update: FixturePlacementUpdate
  ): ProjectWorkspace {
    return this.#updateItemPlacement(id, update, FIXTURE_PLACEMENT_MECHANICS);
  }

  updateFixtureDefinition(
    id: string,
    update: FixtureDefinitionUpdate
  ): ProjectWorkspace {
    return this.#updateItemDefinition(
      id,
      update,
      FIXTURE_PLACEMENT_MECHANICS
    );
  }

  makeFixturePlacementUnique(id: string): ProjectWorkspace {
    return this.#makeItemPlacementUnique(id, FIXTURE_PLACEMENT_MECHANICS);
  }

  deleteFixturePlacement(id: string): ProjectWorkspace {
    return this.#deleteItemPlacement(id, FIXTURE_PLACEMENT_MECHANICS);
  }

  #placeItem<
    Definition extends FurnitureDefinition | FixtureDefinition,
    Placement extends FurniturePlacement | FixturePlacement
  >(
    definition: Definition,
    input: FurniturePlacementInput,
    mechanics: PlacementMechanics<Definition, Placement>
  ): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const plan = selectedPlan(candidate);
    const level = plan.levels.find(({ id }) => id === plan.activeLevelId);
    if (!level) throw new Error("The active Level is missing from the Project Document.");

    if (!mechanics.definitions(plan)?.some(({ id }) => id === definition.id)) {
      mechanics.ensureDefinitions(plan).push(structuredClone(definition));
    }
    mechanics.ensurePlacements(level).push(mechanics.createPlacement(
      this.#idFactory(mechanics.placementIdKind),
      definition.id,
      input
    ));
    this.#recordExistingStateCorrection(candidate);
    return this.#acceptCandidate(candidate);
  }

  #updateItemPlacement<
    Definition extends FurnitureDefinition | FixtureDefinition,
    Placement extends FurniturePlacement | FixturePlacement
  >(
    id: string,
    update: FurniturePlacementUpdate,
    mechanics: PlacementMechanics<Definition, Placement>
  ): ProjectWorkspace {
    const unsupportedKeys = Object.keys(update).filter(
      (key) => !["position", "rotationDeg", "elevationMm"].includes(key)
    );
    if (unsupportedKeys.length) {
      throw new Error(
        `${mechanics.label} Placement dimension overrides are not supported.`
      );
    }
    return this.#replaceActiveLevel((level) => {
      const placement = mechanics.placements(level)?.find(
        (candidate) => candidate.id === id
      );
      if (!placement) {
        throw new Error(`${mechanics.label} Placement "${id}" does not exist.`);
      }
      if (update.position) placement.position = { ...update.position };
      if (update.rotationDeg !== undefined) {
        placement.rotationDeg = normalizeAngleDeg(update.rotationDeg);
      }
      if (update.elevationMm !== undefined) placement.elevationMm = update.elevationMm;
    });
  }

  #updateItemDefinition<
    Definition extends FurnitureDefinition | FixtureDefinition,
    Placement extends FurniturePlacement | FixturePlacement
  >(
    id: string,
    update: FurnitureDefinitionUpdate,
    mechanics: PlacementMechanics<Definition, Placement>
  ): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const plan = selectedPlan(candidate);
    const definition = mechanics.definitions(plan)?.find(
      (item) => item.id === id
    );
    if (!definition) {
      throw new Error(`${mechanics.label} Definition "${id}" does not exist.`);
    }
    if (update.name !== undefined) {
      definition.name = assertNonEmptyName(
        update.name,
        `${mechanics.label} Definition`
      );
    }
    if (update.widthMm !== undefined) definition.widthMm = update.widthMm;
    if (update.depthMm !== undefined) definition.depthMm = update.depthMm;
    if (update.heightMm !== undefined) definition.heightMm = update.heightMm;
    this.#recordExistingStateCorrection(candidate);
    return this.#acceptCandidate(candidate);
  }

  #makeItemPlacementUnique<
    Definition extends FurnitureDefinition | FixtureDefinition,
    Placement extends FurniturePlacement | FixturePlacement
  >(
    id: string,
    mechanics: PlacementMechanics<Definition, Placement>
  ): ProjectWorkspace {
    const candidate = cloneProjectDocument(this.#document);
    const plan = selectedPlan(candidate);
    const level = plan.levels.find(
      ({ id: levelId }) => levelId === plan.activeLevelId
    );
    if (!level) throw new Error("The active Level is missing from the Project Document.");
    const placement = mechanics.placements(level)?.find(
      ({ id: placementId }) => placementId === id
    );
    if (!placement) {
      throw new Error(`${mechanics.label} Placement "${id}" does not exist.`);
    }
    const definition = mechanics.definitions(plan)?.find(
      ({ id: definitionId }) => definitionId === placement.definitionId
    );
    if (!definition) {
      throw new Error(
        `${mechanics.label} Definition "${placement.definitionId}" does not exist.`
      );
    }
    const copy = mechanics.copyDefinition(
      definition,
      this.#idFactory(mechanics.definitionIdKind)
    );
    mechanics.ensureDefinitions(plan).push(copy);
    placement.definitionId = copy.id;
    this.#recordExistingStateCorrection(candidate);
    return this.#acceptCandidate(candidate);
  }

  #deleteItemPlacement<
    Definition extends FurnitureDefinition | FixtureDefinition,
    Placement extends FurniturePlacement | FixturePlacement
  >(
    id: string,
    mechanics: PlacementMechanics<Definition, Placement>
  ): ProjectWorkspace {
    return this.#replaceActiveLevel((level) => {
      const placements = mechanics.placements(level) ?? [];
      const remaining = placements.filter(
        (placement) => placement.id !== id
      );
      if (placements.length === remaining.length) {
        throw new Error(`${mechanics.label} Placement "${id}" does not exist.`);
      }
      mechanics.replacePlacements(level, remaining);
    });
  }

  exportYaml(): string {
    return this.#source;
  }
}
