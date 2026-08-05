import type {
  Diagnostic,
  ProjectCheckpoint,
  ProjectWorkspace
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent,
  type RefObject
} from "react";
import {
  PlanEditor,
  type PlanEditorHandle
} from "../plan-editor/PlanEditor.js";
import type { ItemLibraryController } from "../use-item-library.js";
import { ProjectDocumentPanel } from "./ProjectDocumentPanel.js";
import { ProjectSidebar } from "./ProjectSidebar.js";
import { WorkspaceHeader } from "./WorkspaceHeader.js";

export interface WorkspaceShellProps {
  workspace: ProjectWorkspace;
  yaml: string;
  error: string;
  operationError: string;
  isSaving: boolean;
  hasYamlDraft: boolean;
  isWriterLocked: boolean;
  writerState: "acquiring" | "writer" | "readonly" | "unsupported";
  storagePersistence: "checking" | "persistent" | "temporary" | "unavailable";
  canUndo: boolean;
  canRedo: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  library: ItemLibraryController;
  checkpoints: readonly ProjectCheckpoint[];
  isTransitionPending(): boolean;
  onCommit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined>;
  onCreateCheckpoint(name: string): Promise<boolean>;
  onApplyYaml(): void;
  onTakeOver(): void;
  onImport(event: ChangeEvent<HTMLInputElement>): void;
  onNavigateHistory(direction: "undo" | "redo"): Promise<boolean>;
  onOperationError(message: string): void;
  onRenameProject(value: string): void;
  onRestoreCheckpoint(checkpointId: string): Promise<boolean>;
  onYamlChange(value: string): void;
  yamlDiagnostics: Diagnostic[];
}

export function WorkspaceShell({
  workspace,
  yaml,
  error,
  operationError,
  isSaving,
  hasYamlDraft,
  isWriterLocked,
  writerState,
  storagePersistence,
  canUndo,
  canRedo,
  importInputRef,
  library,
  checkpoints,
  isTransitionPending,
  onCommit,
  onCreateCheckpoint,
  onApplyYaml,
  onTakeOver,
  onImport,
  onNavigateHistory,
  onOperationError,
  onRenameProject,
  onRestoreCheckpoint,
  onYamlChange,
  yamlDiagnostics
}: WorkspaceShellProps) {
  const [proposalName, setProposalName] = useState("");
  const planEditor = useRef<PlanEditorHandle>(null);
  const activeProposal = workspace.activeDesignProposal;
  const isEditingLocked = hasYamlDraft || isWriterLocked;

  async function changeActivePlan(next: ProjectWorkspace): Promise<void> {
    if (await onCommit(next)) planEditor.current?.clearSelection();
  }

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        canRedo={canRedo}
        canUndo={canUndo}
        checkpoints={checkpoints}
        importInputRef={importInputRef}
        isDesignProposal={Boolean(activeProposal)}
        isSaving={isSaving}
        isEditingLocked={isEditingLocked}
        writerState={writerState}
        storagePersistence={storagePersistence}
        onTakeOver={onTakeOver}
        onImport={onImport}
        onNavigateHistory={(direction) => {
          void onNavigateHistory(direction).then((restored) => {
            if (restored) planEditor.current?.clearSelection();
          });
        }}
        projectName={workspace.document.name}
        yaml={workspace.exportYaml()}
      />
      <section className="workspace-grid">
        <ProjectSidebar
          activeLevel={workspace.activeLevel}
          activeProposal={activeProposal}
          diagnostics={workspace.diagnostics}
          document={workspace.document}
          error={error}
          isSaving={isSaving}
          isEditingLocked={isEditingLocked}
          library={library}
          checkpoints={checkpoints}
          onCreateCheckpoint={onCreateCheckpoint}
          onCreateProposal={() => {
            void changeActivePlan(
              workspace.createDesignProposal(proposalName)
            ).then(() => setProposalName(""));
          }}
          onDeleteProposal={() => {
            if (activeProposal) {
              void changeActivePlan(
                workspace.deleteDesignProposal(activeProposal.id)
              );
            }
          }}
          onPlaceItem={(kind, definitionId) =>
            planEditor.current?.beginItemPlacement(kind, definitionId)}
          onProposalNameChange={setProposalName}
          onRenameProject={onRenameProject}
          onRestoreCheckpoint={(checkpointId) => {
            void onRestoreCheckpoint(checkpointId).then((restored) => {
              if (restored) planEditor.current?.clearSelection();
            });
          }}
          onRenameProposal={(value) => {
            if (activeProposal) {
              void onCommit(workspace.renameDesignProposal(
                activeProposal.id,
                value
              ));
            }
          }}
          onSelectExistingState={() =>
            void changeActivePlan(workspace.selectExistingState())}
          onSelectProposal={(proposalId) =>
            void changeActivePlan(workspace.selectDesignProposal(proposalId))}
          proposalName={proposalName}
          proposalStaleness={workspace.activeProposalStaleness}
        />
        <PlanEditor
          ref={planEditor}
          isSaving={isSaving}
          isReadOnly={isEditingLocked}
          isTransitionPending={() => isEditingLocked || isTransitionPending()}
          library={library}
          operationError={operationError}
          workspace={workspace}
          onCommit={onCommit}
          onOperationError={onOperationError}
        />
        <ProjectDocumentPanel
          diagnostics={yamlDiagnostics}
          hasDraft={hasYamlDraft}
          isSaving={isSaving}
          isReadOnly={isWriterLocked}
          yaml={yaml}
          onApply={onApplyYaml}
          onChange={onYamlChange}
        />
      </section>
    </main>
  );
}
