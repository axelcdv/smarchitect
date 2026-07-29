import {
  ProjectHistory,
  type ProjectHistorySnapshot,
  type ProjectWorkspace
} from "@smarchitect/core";

const DATABASE_NAME = "smarchitect";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "active-project";
const ACTIVE_PROJECT_KEY = "active";

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

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
      request.result.createObjectStore(PROJECT_STORE);
    }
  });
  return requestResult(request);
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
      await requestResult(
        transaction.objectStore(PROJECT_STORE).put(snapshot, ACTIVE_PROJECT_KEY)
      );
    } finally {
      database.close();
    }
  }
}

export class AutosavedProject {
  readonly #repository: ProjectRepository;
  readonly #history: ProjectHistory;
  #pendingSave: Promise<void> = Promise.resolve();

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

  static create(
    workspace: ProjectWorkspace,
    repository: ProjectRepository
  ): AutosavedProject {
    const project = new AutosavedProject(ProjectHistory.create(workspace), repository);
    project.#autosave();
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

  accept(workspace: ProjectWorkspace): void {
    this.#history.accept(workspace);
    this.#autosave();
  }

  undo(): ProjectWorkspace {
    const workspace = this.#history.undo();
    this.#autosave();
    return workspace;
  }

  redo(): ProjectWorkspace {
    const workspace = this.#history.redo();
    this.#autosave();
    return workspace;
  }

  flush(): Promise<void> {
    return this.#pendingSave;
  }

  #autosave(): void {
    const snapshot = this.#history.snapshot();
    this.#pendingSave = this.#pendingSave.then(
      () => this.#repository.save(snapshot),
      () => this.#repository.save(snapshot)
    );
    void this.#pendingSave.catch(() => undefined);
  }
}
