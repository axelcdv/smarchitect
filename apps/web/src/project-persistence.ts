import {
  ProjectHistory,
  type FurnitureDefinition,
  type ProjectHistorySnapshot,
  type ProjectWorkspace
} from "@smarchitect/core";

const DATABASE_NAME = "smarchitect";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "active-project";
const ACTIVE_PROJECT_KEY = "active";
const ITEM_LIBRARY_STORE = "item-library";
const FURNITURE_LIBRARY_KEY = "furniture";

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

export interface FurnitureLibraryRepository {
  load(): Promise<FurnitureLibraryHistorySnapshot | undefined>;
  save(snapshot: FurnitureLibraryHistorySnapshot): Promise<void>;
}

export interface FurnitureLibraryHistorySnapshot {
  entries: FurnitureDefinition[][];
  cursor: number;
}

export class IndexedDbFurnitureLibraryRepository
implements FurnitureLibraryRepository {
  async load(): Promise<FurnitureLibraryHistorySnapshot | undefined> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(ITEM_LIBRARY_STORE, "readonly");
      const stored = await requestResult<
        FurnitureLibraryHistorySnapshot | FurnitureDefinition[] | undefined
      >(
        transaction.objectStore(ITEM_LIBRARY_STORE).get(FURNITURE_LIBRARY_KEY)
      );
      if (!stored) return undefined;
      if (Array.isArray(stored)) {
        return {
          entries: [[], structuredClone(stored)],
          cursor: 1
        };
      }
      return structuredClone(stored);
    } finally {
      database.close();
    }
  }

  async save(snapshot: FurnitureLibraryHistorySnapshot): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(ITEM_LIBRARY_STORE, "readwrite");
      transaction.objectStore(ITEM_LIBRARY_STORE).put(
        structuredClone(snapshot),
        FURNITURE_LIBRARY_KEY
      );
      await transactionCompletion(transaction);
    } finally {
      database.close();
    }
  }
}

export class AutosavedFurnitureLibrary {
  readonly #repository: FurnitureLibraryRepository;
  #entries: FurnitureDefinition[][];
  #cursor: number;
  #pendingTransition: Promise<void> = Promise.resolve();

  private constructor(
    snapshot: FurnitureLibraryHistorySnapshot,
    repository: FurnitureLibraryRepository
  ) {
    this.#entries = structuredClone(snapshot.entries);
    this.#cursor = snapshot.cursor;
    this.#repository = repository;
  }

  static async restore(
    repository: FurnitureLibraryRepository
  ): Promise<AutosavedFurnitureLibrary | undefined> {
    const snapshot = await repository.load();
    return snapshot ? new AutosavedFurnitureLibrary(snapshot, repository) : undefined;
  }

  static async create(
    repository: FurnitureLibraryRepository
  ): Promise<AutosavedFurnitureLibrary> {
    const library = new AutosavedFurnitureLibrary({
      entries: [[]],
      cursor: 0
    }, repository);
    await repository.save(library.snapshot());
    return library;
  }

  get definitions(): FurnitureDefinition[] {
    return structuredClone(this.#entries[this.#cursor] ?? []);
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#entries.length - 1;
  }

  snapshot(): FurnitureLibraryHistorySnapshot {
    return {
      entries: structuredClone(this.#entries),
      cursor: this.#cursor
    };
  }

  async accept(definitions: FurnitureDefinition[]): Promise<FurnitureDefinition[]> {
    const accepted = structuredClone(definitions);
    return this.transact(() => accepted);
  }

  async transact(
    transition: (definitions: FurnitureDefinition[]) => FurnitureDefinition[]
  ): Promise<FurnitureDefinition[]> {
    return this.#enqueue((candidate) => {
      const current = structuredClone(candidate.entries[candidate.cursor] ?? []);
      const accepted = structuredClone(transition(current));
      candidate.entries = candidate.entries.slice(0, candidate.cursor + 1);
      candidate.entries.push(accepted);
      candidate.cursor += 1;
    });
  }

  async undo(): Promise<FurnitureDefinition[]> {
    return this.#enqueue((candidate) => {
      if (candidate.cursor > 0) candidate.cursor -= 1;
    });
  }

  async redo(): Promise<FurnitureDefinition[]> {
    return this.#enqueue((candidate) => {
      if (candidate.cursor < candidate.entries.length - 1) candidate.cursor += 1;
    });
  }

  #enqueue(
    transition: (snapshot: FurnitureLibraryHistorySnapshot) => void
  ): Promise<FurnitureDefinition[]> {
    const operation = this.#pendingTransition.then(async () => {
      const candidate = this.snapshot();
      transition(candidate);
      await this.#repository.save(candidate);
      this.#entries = candidate.entries;
      this.#cursor = candidate.cursor;
      return this.definitions;
    });
    this.#pendingTransition = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
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
