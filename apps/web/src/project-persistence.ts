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
