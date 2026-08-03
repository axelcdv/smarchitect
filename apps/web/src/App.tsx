import {
  ProjectValidationError,
  ProjectWorkspace,
  previewProjectDocumentMigration,
  type ProjectDocumentMigrationPreview
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  WorkspaceShell
} from "./project/WorkspaceShell.js";
import { SchemaMigrationDialog } from "./project/SchemaMigrationDialog.js";
import type { ProjectRepository } from "./project-persistence.js";
import { WelcomeScreen } from "./project/WelcomeScreen.js";
import { useAutosavedProject } from "./use-autosaved-project.js";
import { useItemLibrary } from "./use-item-library.js";
import "./styles.css";

export interface AppProps {
  projectRepository?: ProjectRepository;
}

export function App({ projectRepository }: AppProps = {}) {
  const [draftName, setDraftName] = useState("");
  const [operationError, setOperationError] = useState("");
  const [migrationPreview, setMigrationPreview] =
    useState<ProjectDocumentMigrationPreview>();
  const importInput = useRef<HTMLInputElement>(null);
  const library = useItemLibrary(setOperationError);
  const autosavedProject = useAutosavedProject(projectRepository);
  const {
    workspace,
    yaml,
    yamlDiagnostics,
    hasYamlDraft,
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

  async function navigateHistory(direction: "undo" | "redo"): Promise<boolean> {
    const restored = await autosavedProject.navigateHistory(direction);
    if (restored) setOperationError("");
    return restored !== undefined;
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
      const source = await file.text();
      let imported: ProjectWorkspace;
      try {
        imported = ProjectWorkspace.importYaml(source);
      } catch (cause) {
        if (
          cause instanceof ProjectValidationError
          && cause.diagnostics.some(
            ({ code }) => code === "schema-version.migration-required"
          )
        ) {
          setMigrationPreview(previewProjectDocumentMigration(source));
          setOperationError("");
          return;
        }
        throw cause;
      }
      if (await startAutosave(imported)) setDraftName(imported.document.name);
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to import project.");
    } finally {
      event.target.value = "";
    }
  }

  async function confirmMigration(): Promise<void> {
    if (!migrationPreview) return;
    try {
      const imported = ProjectWorkspace.importYaml(
        migrationPreview.migratedSource
      );
      if (await startAutosave(imported)) {
        setDraftName(imported.document.name);
        setMigrationPreview(undefined);
      }
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to migrate project.");
    }
  }

  const migrationDialog = migrationPreview ? (
    <SchemaMigrationDialog
      isSaving={isSaving}
      preview={migrationPreview}
      onCancel={() => setMigrationPreview(undefined)}
      onConfirm={() => void confirmMigration()}
    />
  ) : null;

  if (!workspace) {
    return (
      <>
        <WelcomeScreen
          draftName={draftName}
          error={error}
          importInputRef={importInput}
          isSaving={isSaving}
          onCreate={() => void createProject()}
          onDraftNameChange={setDraftName}
          onImport={(event) => void importProject(event)}
        />
        {migrationDialog}
      </>
    );
  }

  return (
    <>
      <WorkspaceShell
      canRedo={canRedo}
      canUndo={canUndo}
      error={error}
      operationError={operationError}
      importInputRef={importInput}
      isSaving={isSaving}
      hasYamlDraft={hasYamlDraft}
      isTransitionPending={isTransitionPending}
      library={library}
      workspace={workspace}
      yaml={yaml}
      yamlDiagnostics={yamlDiagnostics}
      onApplyYaml={() => void autosavedProject.applyYaml()}
      onCommit={commit}
      onImport={(event) => void importProject(event)}
      onNavigateHistory={navigateHistory}
      onOperationError={setOperationError}
      onRenameProject={(value) => void renameProject(value)}
      onYamlChange={autosavedProject.editYaml}
      />
      {migrationDialog}
    </>
  );
}
