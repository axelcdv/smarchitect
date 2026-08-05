import { describe, expect, it } from "vitest";
import {
  createCheckpoint,
  ProjectHistory,
  ProjectWorkspace,
  restoreCheckpoint,
  type IdFactory
} from "./index.js";

describe("project Checkpoint commands", () => {
  it("creates a complete named Checkpoint and its history event deterministically", () => {
    const workspace = ProjectWorkspace.create("Measured home")
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } })
      .createDesignProposal("Kitchen option");
    const history = ProjectHistory.create(workspace).snapshot();
    const idFactory: IdFactory = (kind) => `${kind}_fixed`;

    const result = createCheckpoint(
      { history, checkpoints: [], checkpointHistory: [] },
      "  Measured baseline  ",
      { idFactory, now: () => new Date("2026-08-03T10:00:00.000Z") }
    );

    expect(result.checkpoint).toEqual({
      id: "checkpoint_fixed",
      name: "Measured baseline",
      createdAt: "2026-08-03T10:00:00.000Z",
      source: workspace.exportYaml()
    });
    expect(result.state.checkpoints).toEqual([result.checkpoint]);
    expect(result.state.checkpointHistory).toEqual([{
      kind: "checkpoint-created",
      checkpointId: "checkpoint_fixed",
      checkpointName: "Measured baseline",
      occurredAt: "2026-08-03T10:00:00.000Z",
      historyEntryIndex: 0
    }]);
    expect(() => createCheckpoint(result.state, "   ", { idFactory }))
      .toThrow("Checkpoint name is required.");
  });

  it("restores a Checkpoint without deleting later project history", () => {
    const original = ProjectWorkspace.create("Original");
    const created = createCheckpoint(
      {
        history: ProjectHistory.create(original).snapshot(),
        checkpoints: [],
        checkpointHistory: []
      },
      "Before changes",
      {
        idFactory: () => "checkpoint_fixed",
        now: () => new Date("2026-08-03T10:00:00.000Z")
      }
    );
    const laterHistory = ProjectHistory.restore(created.state.history);
    laterHistory.accept(original.rename("Later"));

    const restored = restoreCheckpoint(
      { ...created.state, history: laterHistory.snapshot() },
      created.checkpoint.id,
      { now: () => new Date("2026-08-03T11:00:00.000Z") }
    );

    expect(ProjectHistory.restore(restored.state.history).workspace.document.name)
      .toBe("Original");
    expect(restored.state.history.entries).toHaveLength(3);
    expect(restored.state.checkpoints).toEqual([created.checkpoint]);
    expect(restored.state.checkpointHistory.at(-1)).toEqual({
      kind: "checkpoint-restored",
      checkpointId: "checkpoint_fixed",
      checkpointName: "Before changes",
      occurredAt: "2026-08-03T11:00:00.000Z",
      historyEntryIndex: 2
    });
  });
});
