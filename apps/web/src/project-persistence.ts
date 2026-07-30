import {
  ProjectHistory,
  type FixtureDefinition,
  type FurnitureDefinition,
  type ProjectHistorySnapshot,
  type ProjectWorkspace
} from "@smarchitect/core";

const DATABASE_NAME = "smarchitect";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "active-project";
const ACTIVE_PROJECT_KEY = "active";
const ITEM_LIBRARY_STORE = "item-library";
const ITEM_LIBRARY_KEY = "items";
const FURNITURE_LIBRARY_KEY = "furniture";
const FIXTURE_LIBRARY_KEY = "fixtures";

export interface ProjectRepository {
  load(): Promise<ProjectHistorySnapshot | undefined>;
  save(snapshot: ProjectHistorySnapshot): Promise<void>;
}

export class SerializedProjectRepository implements ProjectRepository {
  readonly #repository: ProjectRepository;
  #pendingSave: Promise<void> = Promise.resolve();

  constructor(repository: ProjectRepository) {
    this.#repository = repository;
  }

  load(): Promise<ProjectHistorySnapshot | undefined> {
    return this.#pendingSave.then(() => this.#repository.load());
  }

  save(snapshot: ProjectHistorySnapshot): Promise<void> {
    this.#pendingSave = this.#pendingSave.then(
      () => this.#repository.save(snapshot),
      () => this.#repository.save(snapshot)
    );
    return this.#pendingSave;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(
      transaction.error ?? new Error("IndexedDB transaction was aborted.")
    ));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
      request.result.createObjectStore(PROJECT_STORE);
    }
    if (!request.result.objectStoreNames.contains(ITEM_LIBRARY_STORE)) {
      request.result.createObjectStore(ITEM_LIBRARY_STORE);
    }
  });
  return requestResult(request);
}

export type ItemKind = "furniture" | "fixture";

export interface ItemLibraryHistoryEntry {
  kind: ItemKind | "initial";
  furnitureDefinitions: FurnitureDefinition[];
  fixtureDefinitions: FixtureDefinition[];
}

export interface ItemLibraryHistorySnapshot {
  entries: ItemLibraryHistoryEntry[];
  cursor: number;
}

export interface ItemLibraryRepository {
  load(): Promise<ItemLibraryHistorySnapshot | undefined>;
  save(snapshot: ItemLibraryHistorySnapshot): Promise<void>;
}

interface LegacyDefinitionLibraryHistorySnapshot<T> {
  entries: T[][];
  cursor: number;
}

function currentLegacyDefinitions<T>(
  stored: LegacyDefinitionLibraryHistorySnapshot<T> | T[] | undefined
): T[] {
  if (!stored) return [];
  if (Array.isArray(stored)) return stored;
  return stored.entries[stored.cursor] ?? [];
}

export class IndexedDbItemLibraryRepository implements ItemLibraryRepository {
  async load(): Promise<ItemLibraryHistorySnapshot | undefined> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(ITEM_LIBRARY_STORE, "readonly");
      const store = transaction.objectStore(ITEM_LIBRARY_STORE);
      const combinedRequest = store.get(ITEM_LIBRARY_KEY);
      const furnitureRequest = store.get(FURNITURE_LIBRARY_KEY);
      const fixtureRequest = store.get(FIXTURE_LIBRARY_KEY);
      const [combined, furniture, fixtures] = await Promise.all([
        requestResult<ItemLibraryHistorySnapshot | undefined>(combinedRequest),
        requestResult<
          LegacyDefinitionLibraryHistorySnapshot<FurnitureDefinition>
          | FurnitureDefinition[]
          | undefined
        >(furnitureRequest),
        requestResult<
          LegacyDefinitionLibraryHistorySnapshot<FixtureDefinition>
          | FixtureDefinition[]
          | undefined
        >(fixtureRequest)
      ]);
      if (combined) return structuredClone(combined);
      if (furniture || fixtures) {
        return {
          entries: [{
            kind: "initial",
            furnitureDefinitions: structuredClone(
              currentLegacyDefinitions(furniture)
            ),
            fixtureDefinitions: structuredClone(
              currentLegacyDefinitions(fixtures)
            )
          }],
          cursor: 0
        };
      }
      return undefined;
    } finally {
      database.close();
    }
  }

  async save(snapshot: ItemLibraryHistorySnapshot): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(ITEM_LIBRARY_STORE, "readwrite");
      transaction.objectStore(ITEM_LIBRARY_STORE).put(
        structuredClone(snapshot),
        ITEM_LIBRARY_KEY
      );
      await transactionCompletion(transaction);
    } finally {
      database.close();
    }
  }
}

export class AutosavedItemLibrary {
  readonly #repository: ItemLibraryRepository;
  #entries: ItemLibraryHistoryEntry[];
  #cursor: number;
  #pendingTransition: Promise<void> = Promise.resolve();

  private constructor(
    snapshot: ItemLibraryHistorySnapshot,
    repository: ItemLibraryRepository
  ) {
    this.#entries = structuredClone(snapshot.entries);
    this.#cursor = snapshot.cursor;
    this.#repository = repository;
  }

  static async restore(
    repository: ItemLibraryRepository
  ): Promise<AutosavedItemLibrary | undefined> {
    const snapshot = await repository.load();
    return snapshot
      ? new AutosavedItemLibrary(snapshot, repository)
      : undefined;
  }

  static async create(
    repository: ItemLibraryRepository
  ): Promise<AutosavedItemLibrary> {
    const library = new AutosavedItemLibrary({
      entries: [{
        kind: "initial",
        furnitureDefinitions: [],
        fixtureDefinitions: []
      }],
      cursor: 0
    }, repository);
    await repository.save(library.snapshot());
    return library;
  }

  get furnitureDefinitions(): FurnitureDefinition[] {
    return structuredClone(this.#currentEntry().furnitureDefinitions);
  }

  get fixtureDefinitions(): FixtureDefinition[] {
    return structuredClone(this.#currentEntry().fixtureDefinitions);
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#entries.length - 1;
  }

  snapshot(): ItemLibraryHistorySnapshot {
    return {
      entries: structuredClone(this.#entries),
      cursor: this.#cursor
    };
  }

  async transactFurniture(
    transition: (definitions: FurnitureDefinition[]) => FurnitureDefinition[]
  ): Promise<ItemLibraryHistoryEntry> {
    return this.#transact("furniture", (entry) => {
      entry.furnitureDefinitions = transition(entry.furnitureDefinitions);
    });
  }

  async transactFixture(
    transition: (definitions: FixtureDefinition[]) => FixtureDefinition[]
  ): Promise<ItemLibraryHistoryEntry> {
    return this.#transact("fixture", (entry) => {
      entry.fixtureDefinitions = transition(entry.fixtureDefinitions);
    });
  }

  #transact(
    kind: ItemKind,
    transition: (entry: ItemLibraryHistoryEntry) => void
  ): Promise<ItemLibraryHistoryEntry> {
    return this.#enqueue((candidate) => {
      const current = structuredClone(
        candidate.entries[candidate.cursor] ?? this.#emptyEntry()
      );
      transition(current);
      current.kind = kind;
      candidate.entries = candidate.entries.slice(0, candidate.cursor + 1);
      candidate.entries.push(current);
      candidate.cursor += 1;
    });
  }

  async undo(): Promise<ItemLibraryHistoryEntry> {
    return this.#enqueue((candidate) => {
      if (candidate.cursor > 0) candidate.cursor -= 1;
    });
  }

  async redo(): Promise<ItemLibraryHistoryEntry> {
    return this.#enqueue((candidate) => {
      if (candidate.cursor < candidate.entries.length - 1) candidate.cursor += 1;
    });
  }

  #enqueue(
    transition: (snapshot: ItemLibraryHistorySnapshot) => void
  ): Promise<ItemLibraryHistoryEntry> {
    const operation = this.#pendingTransition.then(async () => {
      const candidate = this.snapshot();
      transition(candidate);
      await this.#repository.save(candidate);
      this.#entries = candidate.entries;
      this.#cursor = candidate.cursor;
      return structuredClone(this.#currentEntry());
    });
    this.#pendingTransition = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  #currentEntry(): ItemLibraryHistoryEntry {
    return this.#entries[this.#cursor] ?? this.#emptyEntry();
  }

  #emptyEntry(): ItemLibraryHistoryEntry {
    return {
      kind: "initial",
      furnitureDefinitions: [],
      fixtureDefinitions: []
    };
  }
}

export class IndexedDbProjectRepository implements ProjectRepository {
  async load(): Promise<ProjectHistorySnapshot | undefined> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      return await requestResult<ProjectHistorySnapshot | undefined>(
        transaction.objectStore(PROJECT_STORE).get(ACTIVE_PROJECT_KEY)
      );
    } finally {
      database.close();
    }
  }

  async save(snapshot: ProjectHistorySnapshot): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).put(snapshot, ACTIVE_PROJECT_KEY);
      await transactionCompletion(transaction);
    } finally {
      database.close();
    }
  }
}

export class AutosavedProject {
  readonly #repository: ProjectRepository;
  #history: ProjectHistory;

  private constructor(history: ProjectHistory, repository: ProjectRepository) {
    this.#history = history;
    this.#repository = repository;
  }

  static async restore(
    repository: ProjectRepository
  ): Promise<AutosavedProject | undefined> {
    const snapshot = await repository.load();
    return snapshot
      ? new AutosavedProject(ProjectHistory.restore(snapshot), repository)
      : undefined;
  }

  static async create(
    workspace: ProjectWorkspace,
    repository: ProjectRepository
  ): Promise<AutosavedProject> {
    const project = new AutosavedProject(ProjectHistory.create(workspace), repository);
    await repository.save(project.#history.snapshot());
    return project;
  }

  get workspace(): ProjectWorkspace {
    return this.#history.workspace;
  }

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  async accept(workspace: ProjectWorkspace): Promise<ProjectWorkspace> {
    return this.#persistTransition((history) => history.accept(workspace));
  }

  async undo(): Promise<ProjectWorkspace> {
    return this.#persistTransition((history) => {
      history.undo();
    });
  }

  async redo(): Promise<ProjectWorkspace> {
    return this.#persistTransition((history) => {
      history.redo();
    });
  }

  async #persistTransition(
    transition: (history: ProjectHistory) => void
  ): Promise<ProjectWorkspace> {
    const candidate = ProjectHistory.restore(this.#history.snapshot());
    transition(candidate);
    await this.#repository.save(candidate.snapshot());
    this.#history = candidate;
    return this.workspace;
  }
}
