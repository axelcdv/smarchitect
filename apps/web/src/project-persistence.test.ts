// @vitest-environment jsdom

import "fake-indexeddb/auto";
import {
  ProjectWorkspace,
  type ProjectHistorySnapshot
} from "@smarchitect/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AutosavedProject,
  AutosavedFurnitureLibrary,
  IndexedDbFurnitureLibraryRepository,
  IndexedDbProjectRepository,
  SerializedProjectRepository,
  type FurnitureLibraryHistorySnapshot,
  type FurnitureLibraryRepository,
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

class MemoryFurnitureLibraryRepository implements FurnitureLibraryRepository {
  snapshot?: FurnitureLibraryHistorySnapshot;

  async load(): Promise<FurnitureLibraryHistorySnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: FurnitureLibraryHistorySnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("smarchitect");
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

beforeEach(deleteTestDatabase);

describe("autosaved project recovery", () => {
  it("persists reusable Furniture Definitions independently of a project", async () => {
    const repository = new IndexedDbFurnitureLibraryRepository();
    const definitions = [{
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Sofa",
      widthMm: 2200,
      depthMm: 950,
      heightMm: 850,
      extensions: {}
    }];

    let library = await AutosavedFurnitureLibrary.create(repository);
    await library.accept(definitions);
    library = (await AutosavedFurnitureLibrary.restore(
      new IndexedDbFurnitureLibraryRepository()
    ))!;
    expect(library.definitions).toEqual(definitions);
    expect(library.canUndo).toBe(true);
    expect(await library.undo()).toEqual([]);
    library = (await AutosavedFurnitureLibrary.restore(
      new IndexedDbFurnitureLibraryRepository()
    ))!;
    expect(library.canRedo).toBe(true);
    expect(await library.redo()).toEqual(definitions);
  });

  it("serializes concurrent Item Library transactions without losing edits", async () => {
    const repository = new MemoryFurnitureLibraryRepository();
    const library = await AutosavedFurnitureLibrary.create(repository);
    const sofa = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Sofa",
      widthMm: 2200,
      depthMm: 950,
      heightMm: 850,
      extensions: {}
    };
    const chair = {
      ...sofa,
      id: "furniture_definition_00000000-0000-4000-8000-000000000006",
      name: "Chair",
      widthMm: 750
    };

    const addingSofa = library.transact((definitions) => [...definitions, sofa]);
    const addingChair = library.transact((definitions) => [...definitions, chair]);
    await Promise.all([addingSofa, addingChair]);

    expect(library.definitions).toEqual([sofa, chair]);
    expect(library.snapshot().entries).toHaveLength(3);
  });

  it("restores exact add, edit, move, and delete states between IndexedDB reloads", async () => {
    const repository = new SerializedProjectRepository(
      new IndexedDbProjectRepository()
    );
    let project = await AutosavedProject.create(
      ProjectWorkspace.create("Persistent home"),
      repository
    );
    const states: ProjectWorkspace[] = [project.workspace];

    await project.accept(project.workspace.addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    }));
    states.push(project.workspace);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.exportYaml()).toBe(states[1]!.exportYaml());

    const wallId = project.workspace.activeLevel.walls[0]!.id;
    await project.accept(project.workspace.updateWall(wallId, {
      thicknessMm: 220,
      heightMm: 2800
    }));
    states.push(project.workspace);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.document).toEqual(states[2]!.document);
    expect(project.workspace.exportYaml()).toBe(states[2]!.exportYaml());

    await project.accept(project.workspace.moveWall(wallId, { x: 500, y: 250 }));
    states.push(project.workspace);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.document).toEqual(states[3]!.document);
    expect(project.workspace.exportYaml()).toBe(states[3]!.exportYaml());

    await project.accept(project.workspace.deleteWall(wallId));
    states.push(project.workspace);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.document).toEqual(states[4]!.document);
    expect(project.workspace.exportYaml()).toBe(states[4]!.exportYaml());

    for (let index = 3; index >= 0; index -= 1) {
      expect((await project.undo()).exportYaml()).toBe(states[index]!.exportYaml());
      project = (await AutosavedProject.restore(repository))!;
      expect(project.workspace.document).toEqual(states[index]!.document);
      expect(project.workspace.exportYaml()).toBe(states[index]!.exportYaml());
    }

    for (let index = 1; index < states.length; index += 1) {
      expect((await project.redo()).exportYaml()).toBe(states[index]!.exportYaml());
      project = (await AutosavedProject.restore(repository))!;
      expect(project.workspace.document).toEqual(states[index]!.document);
      expect(project.workspace.exportYaml()).toBe(states[index]!.exportYaml());
    }
  });

  it("keeps state unchanged and surfaces a persistence failure", async () => {
    const storage = new MemoryProjectRepository();
    let rejectWrites = false;
    const repository: ProjectRepository = {
      load: () => storage.load(),
      save: async (snapshot) => {
        if (rejectWrites) throw new Error("storage unavailable");
        await storage.save(snapshot);
      }
    };
    const project = await AutosavedProject.create(
      ProjectWorkspace.create("Safe home"),
      repository
    );
    const before = project.workspace.exportYaml();
    rejectWrites = true;

    await expect(project.accept(project.workspace.rename("Lost edit")))
      .rejects.toThrow("storage unavailable");

    expect(project.workspace.exportYaml()).toBe(before);
    expect(project.canUndo).toBe(false);
    expect(storage.snapshot?.entries[storage.snapshot.cursor]).toBe(before);
  });

  it("does not accept an edit until its durable write completes", async () => {
    const storage = new MemoryProjectRepository();
    let releaseWrite = () => {};
    let delayWrites = false;
    const repository: ProjectRepository = {
      load: () => storage.load(),
      save: async (snapshot) => {
        if (delayWrites) {
          await new Promise<void>((resolve) => {
            releaseWrite = resolve;
          });
        }
        await storage.save(snapshot);
      }
    };
    const project = await AutosavedProject.create(
      ProjectWorkspace.create("Durable home"),
      repository
    );
    const before = project.workspace.exportYaml();
    delayWrites = true;
    const accepting = project.accept(project.workspace.rename("Durable edit"));
    await Promise.resolve();

    expect(project.workspace.exportYaml()).toBe(before);

    releaseWrite();
    await accepting;
    expect(project.workspace.document.name).toBe("Durable edit");
    expect((await AutosavedProject.restore(repository))?.workspace.document.name)
      .toBe("Durable edit");
  });

  it("does not expose routine autosaves as Checkpoints", async () => {
    const repository = new MemoryProjectRepository();
    const project = await AutosavedProject.create(
      ProjectWorkspace.create("No checkpoint noise"),
      repository
    );
    await project.accept(project.workspace.rename("Autosaved rename"));

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
    const oldProject = AutosavedProject.create(
      ProjectWorkspace.create("Old project"),
      repository
    );
    const active = AutosavedProject.create(
      ProjectWorkspace.create("Imported project"),
      repository
    );

    await firstSaveStarted;
    releaseFirstSave();
    await oldProject;
    await active;

    const reloaded = await AutosavedProject.restore(repository);
    expect(reloaded?.workspace.document.name).toBe("Imported project");
  });
});
