import { ProjectWorkspace } from "./project-workspace.js";

export interface ProjectHistorySnapshot {
  readonly entries: readonly string[];
  readonly cursor: number;
}

function restoreWorkspace(source: string): ProjectWorkspace {
  return ProjectWorkspace.importYaml(source);
}

export class ProjectHistory {
  #entries: string[];
  #cursor: number;

  private constructor(entries: string[], cursor: number) {
    if (!entries.length || cursor < 0 || cursor >= entries.length) {
      throw new Error("Project history snapshot is invalid.");
    }

    entries.forEach(restoreWorkspace);
    this.#entries = [...entries];
    this.#cursor = cursor;
  }

  static create(workspace: ProjectWorkspace): ProjectHistory {
    return new ProjectHistory([workspace.exportYaml()], 0);
  }

  static restore(snapshot: ProjectHistorySnapshot): ProjectHistory {
    return new ProjectHistory([...snapshot.entries], snapshot.cursor);
  }

  get workspace(): ProjectWorkspace {
    return restoreWorkspace(this.#entries[this.#cursor]!);
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#entries.length - 1;
  }

  accept(workspace: ProjectWorkspace): void {
    const source = workspace.exportYaml();
    restoreWorkspace(source);
    this.#entries = [...this.#entries.slice(0, this.#cursor + 1), source];
    this.#cursor += 1;
  }

  transact(operation: (workspace: ProjectWorkspace) => ProjectWorkspace): void {
    const candidate = operation(this.workspace);
    this.accept(candidate);
  }

  undo(): ProjectWorkspace {
    if (!this.canUndo) {
      throw new Error("There is no transaction to undo.");
    }

    this.#cursor -= 1;
    return this.workspace;
  }

  redo(): ProjectWorkspace {
    if (!this.canRedo) {
      throw new Error("There is no transaction to redo.");
    }

    this.#cursor += 1;
    return this.workspace;
  }

  snapshot(): ProjectHistorySnapshot {
    return {
      entries: [...this.#entries],
      cursor: this.#cursor
    };
  }
}
