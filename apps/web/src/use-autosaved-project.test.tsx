// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  ProjectWorkspace,
  type ProjectHistorySnapshot
} from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import {
  AutosavedProject,
  type ProjectRepository
} from "./project-persistence.js";
import { useAutosavedProject } from "./use-autosaved-project.js";

class MemoryProjectRepository implements ProjectRepository {
  snapshot?: ProjectHistorySnapshot;

  async load(): Promise<ProjectHistorySnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: ProjectHistorySnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

describe("autosaved project lifecycle", () => {
  it("recovers a project and orchestrates durable edits, Undo, and Redo", async () => {
    const repository = new MemoryProjectRepository();
    await AutosavedProject.create(
      ProjectWorkspace.create("Recovered home"),
      repository
    );

    const { result } = renderHook(() => useAutosavedProject(repository));
    await waitFor(() => expect(result.current.workspace?.document.name)
      .toBe("Recovered home"));

    await act(() => result.current.commit(
      result.current.workspace!.rename("Durable edit")
    ));
    expect(result.current.workspace?.document.name).toBe("Durable edit");
    expect(result.current.canUndo).toBe(true);

    await act(() => result.current.navigateHistory("undo"));
    expect(result.current.workspace?.document.name).toBe("Recovered home");
    expect(result.current.canRedo).toBe(true);

    await act(() => result.current.navigateHistory("redo"));
    expect(result.current.workspace?.document.name).toBe("Durable edit");
    expect(repository.snapshot?.cursor).toBe(1);
  });

  it("keeps the visible project unchanged and reports durability failures", async () => {
    const storage = new MemoryProjectRepository();
    await AutosavedProject.create(
      ProjectWorkspace.create("Safe home"),
      storage
    );
    const failingRepository: ProjectRepository = {
      load: () => storage.load(),
      save: async () => {
        throw new Error("storage unavailable");
      }
    };
    const { result } = renderHook(() =>
      useAutosavedProject(failingRepository)
    );
    await waitFor(() => expect(result.current.workspace?.document.name)
      .toBe("Safe home"));

    await act(() => result.current.commit(
      result.current.workspace!.rename("Lost edit")
    ));

    expect(result.current.workspace?.document.name).toBe("Safe home");
    expect(result.current.persistenceError)
      .toBe("Autosave failed: storage unavailable");
    expect(result.current.canUndo).toBe(false);
  });
});
