import {
  ProjectValidationError,
  ProjectWorkspace
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  WorkspaceShell
} from "./project/WorkspaceShell.js";
import { WelcomeScreen } from "./project/WelcomeScreen.js";
import { useAutosavedProject } from "./use-autosaved-project.js";
import { useItemLibrary } from "./use-item-library.js";
import "./styles.css";

export function App() {
  const [draftName, setDraftName] = useState("");
  const [operationError, setOperationError] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const library = useItemLibrary(setOperationError);
  const autosavedProject = useAutosavedProject();
  const {
    workspace,
    yaml,
    persistenceError,
    isSaving,
    canUndo,
    canRedo,
    isTransitionPending
  } = autosavedProject;
  const error = persistenceError || operationError;

  async function commit(
    next: ProjectWorkspace
  ): Promise<ProjectWorkspace | undefined> {
    const durable = await autosavedProject.commit(next);
    if (durable) setOperationError("");
    return durable;
  }

  async function startAutosave(next: ProjectWorkspace): Promise<boolean> {
    const started = await autosavedProject.startAutosave(next);
    if (started) setOperationError("");
    return started;
  }

  async function navigateHistory(direction: "undo" | "redo"): Promise<void> {
    const restored = await autosavedProject.navigateHistory(direction);
    if (restored) setOperationError("");
  }

  async function createProject(): Promise<void> {
    try {
      await startAutosave(ProjectWorkspace.create(draftName));
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to create project.");
    }
  }

  async function renameProject(value: string): Promise<void> {
    if (!workspace) return;
    try {
      await commit(workspace.rename(value));
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to rename project.");
    }
  }

  async function importProject(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = ProjectWorkspace.importYaml(await file.text());
      if (await startAutosave(imported)) setDraftName(imported.document.name);
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to import project.");
    } finally {
      event.target.value = "";
    }
  }

  if (!workspace) {
    return (
      <WelcomeScreen
        draftName={draftName}
        error={error}
        importInputRef={importInput}
        isSaving={isSaving}
        onCreate={() => void createProject()}
        onDraftNameChange={setDraftName}
        onImport={(event) => void importProject(event)}
      />
    );
  }

  return (
    <WorkspaceShell
      canRedo={canRedo}
      canUndo={canUndo}
      error={error}
      importInputRef={importInput}
      isSaving={isSaving}
      isTransitionPending={isTransitionPending}
      library={library}
      workspace={workspace}
      yaml={yaml}
      onCommit={commit}
      onImport={(event) => void importProject(event)}
      onNavigateHistory={(direction) => void navigateHistory(direction)}
      onOperationError={setOperationError}
      onRenameProject={(value) => void renameProject(value)}
    />
  );
}
