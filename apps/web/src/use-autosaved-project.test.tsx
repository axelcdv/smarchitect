// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import {
  AutosavedProject,
  type PersistedProjectSnapshot,
  type ProjectRepository
} from "./project-persistence.js";
import { useAutosavedProject } from "./use-autosaved-project.js";

class MemoryProjectRepository implements ProjectRepository {
  snapshot?: PersistedProjectSnapshot;

  async load(): Promise<PersistedProjectSnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: PersistedProjectSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

class DelayedProjectRepository extends MemoryProjectRepository {
  #delayedSave?: {
    started: () => void;
    completion: Promise<void>;
  };

  delayNextSave(): { started: Promise<void>; complete: () => void } {
    let announceStart!: () => void;
    let complete!: () => void;
    const started = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    this.#delayedSave = { started: announceStart, completion };
    return { started, complete };
  }

  override async save(snapshot: PersistedProjectSnapshot): Promise<void> {
    const delayedSave = this.#delayedSave;
    this.#delayedSave = undefined;
    if (delayedSave) {
      delayedSave.started();
      await delayedSave.completion;
    }
    await super.save(snapshot);
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

  it("retains edits made while an applied YAML draft is being persisted", async () => {
    const repository = new DelayedProjectRepository();
    await AutosavedProject.create(
      ProjectWorkspace.create("Original home"),
      repository
    );
    const { result } = renderHook(() => useAutosavedProject(repository));
    await waitFor(() => expect(result.current.workspace?.document.name)
      .toBe("Original home"));

    const appliedDraft = result.current.workspace!
      .rename("Applied home")
      .exportYaml();
    act(() => result.current.editYaml(appliedDraft));
    await waitFor(() => expect(repository.snapshot?.draft).toBe(appliedDraft));

    const delayedSave = repository.delayNextSave();
    let applying!: Promise<ProjectWorkspace | undefined>;
    act(() => {
      applying = result.current.applyYaml();
    });
    await delayedSave.started;

    const newerDraft = result.current.workspace!
      .rename("Newer draft")
      .exportYaml();
    act(() => result.current.editYaml(newerDraft));
    delayedSave.complete();
    await act(() => applying);

    expect(result.current.workspace?.document.name).toBe("Applied home");
    expect(result.current.yaml).toBe(newerDraft);
    expect(result.current.hasYamlDraft).toBe(true);
    await waitFor(() => expect(repository.snapshot?.draft).toBe(newerDraft));
  });
});
