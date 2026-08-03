// @vitest-environment jsdom

import "fake-indexeddb/auto";
import {
  ProjectWorkspace
} from "@smarchitect/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AutosavedItemLibrary,
  AutosavedProject,
  IndexedDbItemLibraryRepository,
  IndexedDbProjectRepository,
  SerializedProjectRepository,
  type ItemLibraryHistorySnapshot,
  type ItemLibraryRepository,
  type PersistedProjectSnapshot,
  type ProjectRepository
} from "./project-persistence.js";

class MemoryProjectRepository implements ProjectRepository {
  snapshot?: PersistedProjectSnapshot;

  async load(): Promise<PersistedProjectSnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: PersistedProjectSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

class MemoryItemLibraryRepository implements ItemLibraryRepository {
  snapshot?: ItemLibraryHistorySnapshot;

  async load(): Promise<ItemLibraryHistorySnapshot | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: ItemLibraryHistorySnapshot): Promise<void> {
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
  it("persists a raw draft and clears it in the same save that applies it", async () => {
    const repository = new MemoryProjectRepository();
    let project = await AutosavedProject.create(
      ProjectWorkspace.create("Draft persistence"),
      repository
    );
    const invalidDraft = "schemaVersion: [";

    await project.saveDraft(invalidDraft);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.draft).toBe(invalidDraft);
    expect(project.workspace.document.name).toBe("Draft persistence");
    expect(repository.snapshot?.cursor).toBe(0);

    const validDraft = project.workspace.rename("Applied draft").exportYaml();
    await project.saveDraft(validDraft);
    await project.acceptDraft(ProjectWorkspace.importYaml(validDraft));

    expect(repository.snapshot?.draft).toBeUndefined();
    expect(repository.snapshot?.cursor).toBe(1);
    expect(repository.snapshot?.entries).toHaveLength(2);
    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.document.name).toBe("Applied draft");
    expect((await project.undo()).document.name).toBe("Draft persistence");
  });

  it("persists one chronological Item Library history across item kinds", async () => {
    const repository = new IndexedDbItemLibraryRepository();
    const furniture = [{
      id: "furniture_definition_00000000-0000-4000-8000-000000000005",
      name: "Sofa",
      widthMm: 2200,
      depthMm: 950,
      heightMm: 850,
      extensions: {}
    }];
    const fixtures = [{
      id: "fixture_definition_00000000-0000-4000-8000-000000000006",
      name: "Radiator",
      widthMm: 1000,
      depthMm: 150,
      heightMm: 600,
      extensions: {}
    }];

    let library = await AutosavedItemLibrary.create(repository);
    await library.transactFurniture(() => furniture);
    await library.transactFixture(() => fixtures);
    library = (await AutosavedItemLibrary.restore(
      new IndexedDbItemLibraryRepository()
    ))!;
    expect(library.furnitureDefinitions).toEqual(furniture);
    expect(library.fixtureDefinitions).toEqual(fixtures);
    expect(library.canUndo).toBe(true);
    expect(await library.undo()).toMatchObject({
      kind: "furniture",
      furnitureDefinitions: furniture,
      fixtureDefinitions: []
    });
    library = (await AutosavedItemLibrary.restore(
      new IndexedDbItemLibraryRepository()
    ))!;
    expect(library.canRedo).toBe(true);
    expect(await library.redo()).toMatchObject({
      kind: "fixture",
      furnitureDefinitions: furniture,
      fixtureDefinitions: fixtures
    });
  });

  it("serializes concurrent Item Library transactions without losing edits", async () => {
    const repository = new MemoryItemLibraryRepository();
    const library = await AutosavedItemLibrary.create(repository);
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

    const addingSofa = library.transactFurniture(
      (definitions) => [...definitions, sofa]
    );
    const addingChair = library.transactFurniture(
      (definitions) => [...definitions, chair]
    );
    await Promise.all([addingSofa, addingChair]);

    expect(library.furnitureDefinitions).toEqual([sofa, chair]);
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

  it("restores Room Label edits and their Undo/Redo history", async () => {
    const repository = new SerializedProjectRepository(
      new IndexedDbProjectRepository()
    );
    let project = await AutosavedProject.create(
      ProjectWorkspace.create("Persistent labels"),
      repository
    );
    await project.accept(project.workspace.addRoomLabel({
      name: "Kitchen",
      position: { x: 1000, y: 1200 }
    }));
    const addedYaml = project.workspace.exportYaml();
    const labelId = project.workspace.activeLevel.roomLabels[0]!.id;
    await project.accept(project.workspace.updateRoomLabel(labelId, {
      name: "Dining room",
      position: { x: 1800, y: 1400 }
    }));
    const editedYaml = project.workspace.exportYaml();

    project = (await AutosavedProject.restore(repository))!;
    expect(project.workspace.exportYaml()).toBe(editedYaml);
    expect((await project.undo()).exportYaml()).toBe(addedYaml);
    project = (await AutosavedProject.restore(repository))!;
    expect((await project.redo()).exportYaml()).toBe(editedYaml);
  });

  it("persists Opening operations and their Undo/Redo states across reloads", async () => {
    const repository = new SerializedProjectRepository(
      new IndexedDbProjectRepository()
    );
    let project = await AutosavedProject.create(
      ProjectWorkspace.create("Persistent openings").addWall({
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        heightMm: 2800
      }),
      repository
    );
    const wallId = project.workspace.activeLevel.walls[0]!.id;
    const states = [project.workspace.exportYaml()];

    await project.accept(project.workspace.addOpening({
      kind: "door",
      hostWallId: wallId,
      positionMm: 400,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    }));
    states.push(project.workspace.exportYaml());
    project = (await AutosavedProject.restore(repository))!;
    const openingId = project.workspace.activeLevel.openings[0]!.id;

    await project.accept(project.workspace.updateOpening(openingId, {
      widthMm: 1000,
      operation: { kind: "sliding", slideDirection: "end" }
    }));
    states.push(project.workspace.exportYaml());
    project = (await AutosavedProject.restore(repository))!;

    await project.accept(project.workspace.moveOpening(openingId, 500));
    states.push(project.workspace.exportYaml());
    project = (await AutosavedProject.restore(repository))!;

    await project.accept(project.workspace.deleteOpening(openingId));
    states.push(project.workspace.exportYaml());
    project = (await AutosavedProject.restore(repository))!;

    for (let index = states.length - 2; index >= 0; index -= 1) {
      expect((await project.undo()).exportYaml()).toBe(states[index]);
      project = (await AutosavedProject.restore(repository))!;
      expect(project.workspace.exportYaml()).toBe(states[index]);
    }
    for (let index = 1; index < states.length; index += 1) {
      expect((await project.redo()).exportYaml()).toBe(states[index]);
      project = (await AutosavedProject.restore(repository))!;
      expect(project.workspace.exportYaml()).toBe(states[index]);
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
