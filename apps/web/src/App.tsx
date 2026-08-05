import {
  ProjectValidationError,
  ProjectWorkspace,
  importProjectArchive,
  previewProjectArchiveMigration,
  previewProjectDocumentMigration,
  type ProjectArchiveMigrationPreview,
  type ProjectCheckpoint,
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
import { ProjectArchiveMigrationDialog } from "./project/ProjectArchiveMigrationDialog.js";
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
  const [archiveMigrationPreview, setArchiveMigrationPreview] =
    useState<ProjectArchiveMigrationPreview>();
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
    checkpoints,
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

  async function startAutosave(
    next: ProjectWorkspace,
    importedCheckpoints: readonly ProjectCheckpoint[] = []
  ): Promise<boolean> {
    const started = await autosavedProject.startAutosave(next, importedCheckpoints);
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
      if (
        file.name.toLowerCase().endsWith(".zip")
        || file.type === "application/zip"
      ) {
        const archiveBytes = new Uint8Array(await file.arrayBuffer());
        const archivePreview = previewProjectArchiveMigration(archiveBytes);
        if (archivePreview) {
          setArchiveMigrationPreview(archivePreview);
          setOperationError("");
          return;
        }
        const importedArchive = importProjectArchive(archiveBytes);
        if (await startAutosave(
          importedArchive.workspace,
          importedArchive.checkpoints
        )) {
          setDraftName(importedArchive.workspace.document.name);
        }
        return;
      }
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
      if (await startAutosave(imported)) {
        setDraftName(imported.document.name);
      }
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

  async function confirmArchiveMigration(): Promise<void> {
    if (!archiveMigrationPreview) return;
    const { imported } = archiveMigrationPreview;
    if (await startAutosave(imported.workspace, imported.checkpoints)) {
      setDraftName(imported.workspace.document.name);
      setArchiveMigrationPreview(undefined);
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
  const archiveMigrationDialog = archiveMigrationPreview ? (
    <ProjectArchiveMigrationDialog
      isSaving={isSaving}
      preview={archiveMigrationPreview}
      onCancel={() => setArchiveMigrationPreview(undefined)}
      onConfirm={() => void confirmArchiveMigration()}
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
        {archiveMigrationDialog}
      </>
    );
  }

  return (
    <>
      <WorkspaceShell
      canRedo={canRedo}
      canUndo={canUndo}
      checkpoints={checkpoints}
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
      onCreateCheckpoint={autosavedProject.createCheckpoint}
      onImport={(event) => void importProject(event)}
      onNavigateHistory={navigateHistory}
      onOperationError={setOperationError}
      onRenameProject={(value) => void renameProject(value)}
      onRestoreCheckpoint={autosavedProject.restoreCheckpoint}
      onYamlChange={autosavedProject.editYaml}
      />
      {migrationDialog}
      {archiveMigrationDialog}
    </>
  );
}
