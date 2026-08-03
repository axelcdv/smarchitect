import { defaultIdFactory } from "./id-factory.js";
import {
  ProjectHistory,
  type ProjectHistorySnapshot
} from "./project-history.js";
import { ProjectWorkspace } from "./project-workspace.js";
import type { IdFactory } from "./types.js";
import type { ProjectCheckpoint } from "./project-archive.js";

export interface CheckpointHistoryEntry {
  readonly kind: "checkpoint-created" | "checkpoint-restored";
  readonly checkpointId: string;
  readonly checkpointName: string;
  readonly occurredAt: string;
  readonly historyEntryIndex: number;
}

export interface ProjectCheckpointState {
  readonly history: ProjectHistorySnapshot;
  readonly checkpoints: readonly ProjectCheckpoint[];
  readonly checkpointHistory: readonly CheckpointHistoryEntry[];
}

export interface ProjectCheckpointCommandOptions {
  readonly idFactory?: IdFactory;
  readonly now?: () => Date;
}

export interface CreateCheckpointResult {
  readonly checkpoint: ProjectCheckpoint;
  readonly state: ProjectCheckpointState;
}

export interface RestoreCheckpointResult {
  readonly state: ProjectCheckpointState;
}

function validateCheckpoints(checkpoints: readonly ProjectCheckpoint[]): void {
  const ids = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (ids.has(checkpoint.id)) {
      throw new Error(`Duplicate Checkpoint id: ${checkpoint.id}.`);
    }
    ids.add(checkpoint.id);
    ProjectWorkspace.importYaml(checkpoint.source);
  }
}

function cloneState(state: ProjectCheckpointState): ProjectCheckpointState {
  const history = ProjectHistory.restore(state.history).snapshot();
  validateCheckpoints(state.checkpoints);
  return {
    history,
    checkpoints: structuredClone([...state.checkpoints]),
    checkpointHistory: structuredClone([...state.checkpointHistory])
  };
}

export function createCheckpoint(
  current: ProjectCheckpointState,
  name: string,
  options: ProjectCheckpointCommandOptions = {}
): CreateCheckpointResult {
  const state = cloneState(current);
  const checkpointName = name.trim();
  if (!checkpointName) throw new Error("Checkpoint name is required.");

  const idFactory = options.idFactory ?? defaultIdFactory;
  const occurredAt = (options.now ?? (() => new Date()))().toISOString();
  const checkpoint: ProjectCheckpoint = {
    id: idFactory("checkpoint"),
    name: checkpointName,
    createdAt: occurredAt,
    source: ProjectHistory.restore(state.history).workspace.exportYaml()
  };
  if (state.checkpoints.some(({ id }) => id === checkpoint.id)) {
    throw new Error(`Duplicate Checkpoint id: ${checkpoint.id}.`);
  }

  return {
    checkpoint: structuredClone(checkpoint),
    state: {
      ...state,
      checkpoints: [...state.checkpoints, checkpoint],
      checkpointHistory: [
        ...state.checkpointHistory,
        {
          kind: "checkpoint-created",
          checkpointId: checkpoint.id,
          checkpointName: checkpoint.name,
          occurredAt,
          historyEntryIndex: state.history.cursor
        }
      ]
    }
  };
}

export function restoreCheckpoint(
  current: ProjectCheckpointState,
  checkpointId: string,
  options: Pick<ProjectCheckpointCommandOptions, "now"> = {}
): RestoreCheckpointResult {
  const state = cloneState(current);
  const checkpoint = state.checkpoints.find(({ id }) => id === checkpointId);
  if (!checkpoint) throw new Error("Checkpoint was not found.");

  const history = ProjectHistory.restore(state.history);
  history.restoreCheckpoint(checkpoint.source);
  const historySnapshot = history.snapshot();
  return {
    state: {
      history: historySnapshot,
      checkpoints: state.checkpoints,
      checkpointHistory: [
        ...state.checkpointHistory,
        {
          kind: "checkpoint-restored",
          checkpointId: checkpoint.id,
          checkpointName: checkpoint.name,
          occurredAt: (options.now ?? (() => new Date()))().toISOString(),
          historyEntryIndex: historySnapshot.cursor
        }
      ]
    }
  };
}
