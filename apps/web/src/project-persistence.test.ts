// @vitest-environment jsdom

import { ProjectWorkspace, type ProjectHistorySnapshot } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import {
  AutosavedProject,
  SerializedProjectRepository,
  type ProjectRepository
} from "./project-persistence.js";

class MemoryProjectRepository implements ProjectRepository {
  snapshot?: ProjectHistorySnapshot;

  async load(): Promise<ProjectHistorySnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: ProjectHistorySnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

describe("autosaved project recovery", () => {
  it("restores project state and Undo/Redo history across simulated reloads", async () => {
    const repository = new MemoryProjectRepository();
    const project = AutosavedProject.create(
      ProjectWorkspace.create("Persistent home"),
      repository
    );
    project.accept(project.workspace.addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    }));
    const wallId = project.workspace.activeLevel.walls[0]!.id;
    project.accept(project.workspace.moveWall(wallId, { x: 500, y: 250 }));
    project.undo();
    await project.flush();

    const reloaded = await AutosavedProject.restore(repository);

    expect(reloaded?.workspace.activeLevel.walls[0]!.path.start).toEqual({
      x: 0,
      y: 0
    });
    expect(reloaded?.canUndo).toBe(true);
    expect(reloaded?.canRedo).toBe(true);
    expect(reloaded?.redo().activeLevel.walls[0]!.path.start).toEqual({
      x: 500,
      y: 250
    });
    await reloaded?.flush();

    const reloadedAgain = await AutosavedProject.restore(repository);
    expect(reloadedAgain?.workspace.exportYaml()).toBe(
      reloaded?.workspace.exportYaml()
    );
    expect(reloadedAgain?.canUndo).toBe(true);
    expect(reloadedAgain?.canRedo).toBe(false);
  });

  it("does not expose routine autosaves as Checkpoints", async () => {
    const repository = new MemoryProjectRepository();
    const project = AutosavedProject.create(
      ProjectWorkspace.create("No checkpoint noise"),
      repository
    );
    project.accept(project.workspace.rename("Autosaved rename"));
    await project.flush();

    expect(repository.snapshot).toEqual({
      entries: expect.any(Array),
      cursor: 1
    });
    expect(repository.snapshot).not.toHaveProperty("checkpoints");
  });

  it("persists the active project when switching during a delayed autosave", async () => {
    const storage = new MemoryProjectRepository();
    let releaseFirstSave = () => {};
    let markFirstSaveStarted = () => {};
    const firstSaveStarted = new Promise<void>((resolve) => {
      markFirstSaveStarted = resolve;
    });
    let saveCount = 0;
    const delayedRepository: ProjectRepository = {
      load: () => storage.load(),
      save: async (snapshot) => {
        saveCount += 1;
        if (saveCount === 1) {
          markFirstSaveStarted();
          await new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          });
        }
        await storage.save(snapshot);
      }
    };
    const repository = new SerializedProjectRepository(delayedRepository);
    AutosavedProject.create(ProjectWorkspace.create("Old project"), repository);
    const active = AutosavedProject.create(
      ProjectWorkspace.create("Imported project"),
      repository
    );

    await firstSaveStarted;
    releaseFirstSave();
    await active.flush();

    const reloaded = await AutosavedProject.restore(repository);
    expect(reloaded?.workspace.document.name).toBe("Imported project");
  });
});
