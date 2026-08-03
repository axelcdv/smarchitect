import {
  ProjectWorkspace,
  type EntityKind,
  type FixtureDefinition,
  type FixtureDefinitionUpdate,
  type FixturePlacementInput,
  type FixturePlacementUpdate,
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementInput,
  type FurniturePlacementUpdate,
  type LevelUpdate,
  type OpeningInput,
  type OpeningConflictResolution,
  type OpeningUpdate,
  type RoomLabelInput,
  type RoomLabelUpdate,
  type WallInput,
  type WallUpdate
} from "@smarchitect/core";

export type ProjectOperation =
  | { op: "project.rename"; name: string }
  | { op: "level.update"; update: LevelUpdate }
  | { op: "wall.add"; id: string; input: WallInput }
  | { op: "wall.update"; id: string; update: WallUpdate }
  | {
      op: "wall.updateResolvingOpenings";
      id: string;
      update: WallUpdate;
      resolution: OpeningConflictResolution;
    }
  | { op: "wall.delete"; id: string }
  | { op: "opening.add"; id: string; input: OpeningInput }
  | { op: "opening.update"; id: string; update: OpeningUpdate }
  | { op: "opening.delete"; id: string }
  | { op: "roomLabel.add"; id: string; input: RoomLabelInput }
  | { op: "roomLabel.update"; id: string; update: RoomLabelUpdate }
  | { op: "roomLabel.delete"; id: string }
  | {
      op: "furniture.place";
      id: string;
      definition: FurnitureDefinition;
      input: FurniturePlacementInput;
    }
  | {
      op: "furniture.updatePlacement";
      id: string;
      update: FurniturePlacementUpdate;
    }
  | {
      op: "furniture.updateDefinition";
      id: string;
      update: FurnitureDefinitionUpdate;
    }
  | { op: "furniture.deletePlacement"; id: string }
  | {
      op: "furniture.makePlacementUnique";
      id: string;
      newDefinitionId: string;
    }
  | {
      op: "fixture.place";
      id: string;
      definition: FixtureDefinition;
      input: FixturePlacementInput;
    }
  | {
      op: "fixture.updatePlacement";
      id: string;
      update: FixturePlacementUpdate;
    }
  | {
      op: "fixture.updateDefinition";
      id: string;
      update: FixtureDefinitionUpdate;
    }
  | { op: "fixture.deletePlacement"; id: string }
  | {
      op: "fixture.makePlacementUnique";
      id: string;
      newDefinitionId: string;
    }
  | { op: "proposal.create"; id: string; name: string }
  | { op: "proposal.rename"; id: string; name: string }
  | { op: "proposal.select"; id: string }
  | { op: "proposal.delete"; id: string }
  | { op: "existingState.select" };

export interface ProjectOperationBatch {
  version: 1;
  timestamp?: string;
  operations: ProjectOperation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class OperationBatchFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationBatchFormatError";
  }
}

type OperationName = ProjectOperation["op"];
type OperationWithName<Name extends OperationName> = Extract<
  ProjectOperation,
  { op: Name }
>;

interface OperationDefinition<Name extends OperationName> {
  fields: Array<Exclude<keyof OperationWithName<Name>, "op"> & string>;
  createdId?: (operation: OperationWithName<Name>) => {
    kind: EntityKind;
    id: string;
  };
  apply(
    workspace: ProjectWorkspace,
    operation: OperationWithName<Name>
  ): ProjectWorkspace;
}

type OperationDefinitions = {
  [Name in OperationName]: OperationDefinition<Name>;
};

const OPERATION_DEFINITIONS = {
  "project.rename": {
    fields: ["name"],
    apply: (workspace, operation) => workspace.rename(operation.name)
  },
  "level.update": {
    fields: ["update"],
    apply: (workspace, operation) => workspace.updateLevel(operation.update)
  },
  "wall.add": {
    fields: ["id", "input"],
    createdId: (operation) => ({ kind: "wall", id: operation.id }),
    apply: (workspace, operation) => workspace.addWall(operation.input)
  },
  "wall.update": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateWall(operation.id, operation.update)
  },
  "wall.updateResolvingOpenings": {
    fields: ["id", "update", "resolution"],
    apply: (workspace, operation) => workspace.updateWallResolvingOpenings(
      operation.id,
      operation.update,
      operation.resolution
    )
  },
  "wall.delete": {
    fields: ["id"],
    apply: (workspace, operation) => workspace.deleteWall(operation.id)
  },
  "opening.add": {
    fields: ["id", "input"],
    createdId: (operation) => ({ kind: "opening", id: operation.id }),
    apply: (workspace, operation) => workspace.addOpening(operation.input)
  },
  "opening.update": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateOpening(operation.id, operation.update)
  },
  "opening.delete": {
    fields: ["id"],
    apply: (workspace, operation) => workspace.deleteOpening(operation.id)
  },
  "roomLabel.add": {
    fields: ["id", "input"],
    createdId: (operation) => ({ kind: "room-label", id: operation.id }),
    apply: (workspace, operation) => workspace.addRoomLabel(operation.input)
  },
  "roomLabel.update": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateRoomLabel(operation.id, operation.update)
  },
  "roomLabel.delete": {
    fields: ["id"],
    apply: (workspace, operation) => workspace.deleteRoomLabel(operation.id)
  },
  "furniture.place": {
    fields: ["id", "definition", "input"],
    createdId: (operation) => ({
      kind: "furniture_placement",
      id: operation.id
    }),
    apply: (workspace, operation) =>
      workspace.placeFurniture(operation.definition, operation.input)
  },
  "furniture.updatePlacement": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateFurniturePlacement(operation.id, operation.update)
  },
  "furniture.updateDefinition": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateFurnitureDefinition(operation.id, operation.update)
  },
  "furniture.deletePlacement": {
    fields: ["id"],
    apply: (workspace, operation) =>
      workspace.deleteFurniturePlacement(operation.id)
  },
  "furniture.makePlacementUnique": {
    fields: ["id", "newDefinitionId"],
    createdId: (operation) => ({
      kind: "furniture_definition",
      id: operation.newDefinitionId
    }),
    apply: (workspace, operation) =>
      workspace.makeFurniturePlacementUnique(operation.id)
  },
  "fixture.place": {
    fields: ["id", "definition", "input"],
    createdId: (operation) => ({
      kind: "fixture_placement",
      id: operation.id
    }),
    apply: (workspace, operation) =>
      workspace.placeFixture(operation.definition, operation.input)
  },
  "fixture.updatePlacement": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateFixturePlacement(operation.id, operation.update)
  },
  "fixture.updateDefinition": {
    fields: ["id", "update"],
    apply: (workspace, operation) =>
      workspace.updateFixtureDefinition(operation.id, operation.update)
  },
  "fixture.deletePlacement": {
    fields: ["id"],
    apply: (workspace, operation) =>
      workspace.deleteFixturePlacement(operation.id)
  },
  "fixture.makePlacementUnique": {
    fields: ["id", "newDefinitionId"],
    createdId: (operation) => ({
      kind: "fixture_definition",
      id: operation.newDefinitionId
    }),
    apply: (workspace, operation) =>
      workspace.makeFixturePlacementUnique(operation.id)
  },
  "proposal.create": {
    fields: ["id", "name"],
    createdId: (operation) => ({ kind: "design_proposal", id: operation.id }),
    apply: (workspace, operation) =>
      workspace.createDesignProposal(operation.name)
  },
  "proposal.rename": {
    fields: ["id", "name"],
    apply: (workspace, operation) =>
      workspace.renameDesignProposal(operation.id, operation.name)
  },
  "proposal.select": {
    fields: ["id"],
    apply: (workspace, operation) => workspace.selectDesignProposal(operation.id)
  },
  "proposal.delete": {
    fields: ["id"],
    apply: (workspace, operation) => workspace.deleteDesignProposal(operation.id)
  },
  "existingState.select": {
    fields: [],
    apply: (workspace) => workspace.selectExistingState()
  }
} satisfies OperationDefinitions;

interface RuntimeOperationDefinition {
  fields: string[];
  createdId?: (operation: ProjectOperation) => {
    kind: EntityKind;
    id: string;
  };
  apply(
    workspace: ProjectWorkspace,
    operation: ProjectOperation
  ): ProjectWorkspace;
}

function operationDefinition(
  operation: ProjectOperation
): RuntimeOperationDefinition {
  return OPERATION_DEFINITIONS[operation.op] as unknown as
    RuntimeOperationDefinition;
}

function validateOperationShape(
  operation: Record<string, unknown> & { op: ProjectOperation["op"] },
  index: number
): void {
  const fields = operationDefinition(operation as ProjectOperation).fields;
  const unsupported = Object.keys(operation).filter(
    (key) => key !== "op" && !fields.includes(key)
  );
  const missing = fields.filter((key) => !(key in operation));
  if (unsupported.length || missing.length) {
    throw new OperationBatchFormatError(
      `Operation ${index} has ${unsupported.length ? `unsupported field(s): ${unsupported.join(", ")}` : `missing field(s): ${missing.join(", ")}`}.`
    );
  }
  if ("id" in operation && typeof operation.id !== "string") {
    throw new OperationBatchFormatError(`Operation ${index} ID must be a string.`);
  }
}

export function parseOperationBatch(source: string): ProjectOperationBatch {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new OperationBatchFormatError(
      `Operation batch is not valid JSON: ${error instanceof Error ? error.message : "parse failure"}`
    );
  }
  const batch = isRecord(value)
    && Object.keys(value).every((key) =>
      ["version", "timestamp", "operations"].includes(key)
    )
    && value.version === 1
    && Array.isArray(value.operations)
    && (value.timestamp === undefined || typeof value.timestamp === "string")
    ? {
        version: 1 as const,
        operations: value.operations,
        ...(typeof value.timestamp === "string" ? { timestamp: value.timestamp } : {})
      }
    : undefined;
  if (!batch || batch.operations.length === 0) {
    throw new OperationBatchFormatError(
      "Operation batch must be a version 1 object with a non-empty operations array."
    );
  }
  if (batch.timestamp && Number.isNaN(Date.parse(batch.timestamp))) {
    throw new OperationBatchFormatError(
      "Operation batch timestamp must be an ISO 8601 date-time."
    );
  }
  for (const [index, operation] of batch.operations.entries()) {
    if (
      !isRecord(operation)
      || typeof operation.op !== "string"
      || !Object.hasOwn(OPERATION_DEFINITIONS, operation.op)
    ) {
      throw new OperationBatchFormatError(
        `Operation ${index} has an unsupported or missing \"op\".`
      );
    }
    validateOperationShape(
      operation as Record<string, unknown> & { op: ProjectOperation["op"] },
      index
    );
  }
  return batch as ProjectOperationBatch;
}

function collectSuppliedCreationIds(
  operations: readonly ProjectOperation[]
): Map<EntityKind, string[]> {
  const ids = new Map<EntityKind, string[]>();
  const add = (kind: EntityKind, id: string): void => {
    ids.set(kind, [...ids.get(kind) ?? [], id]);
  };
  for (const operation of operations) {
    const creation = operationDefinition(operation).createdId?.(operation);
    if (creation) add(creation.kind, creation.id);
  }
  return ids;
}

export interface OperationBatchResult {
  workspace: ProjectWorkspace;
  applied: number;
}

export class OperationBatchError extends Error {
  readonly operationIndex: number;

  constructor(operationIndex: number, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Operation failed.", { cause });
    this.name = "OperationBatchError";
    this.operationIndex = operationIndex;
  }
}

export function applyOperationBatch(
  source: string,
  batch: ProjectOperationBatch
): OperationBatchResult {
  const { operations } = batch;
  const ids = collectSuppliedCreationIds(operations);
  let workspace = ProjectWorkspace.importYaml(source, {
    idFactory: (kind) => {
      const id = ids.get(kind)?.shift();
      if (!id) throw new Error(`Operation must provide an ID for new ${kind}.`);
      return id;
    },
    ...(batch.timestamp
      ? { now: () => new Date(batch.timestamp!) }
      : {})
  });

  for (const [index, operation] of operations.entries()) {
    try {
      workspace = operationDefinition(operation).apply(workspace, operation);
    } catch (error) {
      throw new OperationBatchError(index, error);
    }
  }

  return { workspace, applied: operations.length };
}
