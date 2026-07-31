import type { ProjectWorkspace } from "@smarchitect/core";
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
  canUndo: boolean;
  canRedo: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  library: ItemLibraryController;
  isTransitionPending(): boolean;
  onCommit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined>;
  onImport(event: ChangeEvent<HTMLInputElement>): void;
  onNavigateHistory(direction: "undo" | "redo"): Promise<boolean>;
  onOperationError(message: string): void;
  onRenameProject(value: string): void;
}

export function WorkspaceShell({
  workspace,
  yaml,
  error,
  operationError,
  isSaving,
  canUndo,
  canRedo,
  importInputRef,
  library,
  isTransitionPending,
  onCommit,
  onImport,
  onNavigateHistory,
  onOperationError,
  onRenameProject
}: WorkspaceShellProps) {
  const [proposalName, setProposalName] = useState("");
  const planEditor = useRef<PlanEditorHandle>(null);
  const activeProposal = workspace.activeDesignProposal;

  async function changeActivePlan(next: ProjectWorkspace): Promise<void> {
    if (await onCommit(next)) planEditor.current?.clearSelection();
  }

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        canRedo={canRedo}
        canUndo={canUndo}
        importInputRef={importInputRef}
        isDesignProposal={Boolean(activeProposal)}
        isSaving={isSaving}
        onImport={onImport}
        onNavigateHistory={(direction) => {
          void onNavigateHistory(direction).then((restored) => {
            if (restored) planEditor.current?.clearSelection();
          });
        }}
        projectName={workspace.document.name}
        yaml={yaml}
      />
      <section className="workspace-grid">
        <ProjectSidebar
          activeLevel={workspace.activeLevel}
          activeProposal={activeProposal}
          diagnostics={workspace.diagnostics}
          document={workspace.document}
          error={error}
          isSaving={isSaving}
          library={library}
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
          isTransitionPending={isTransitionPending}
          library={library}
          operationError={operationError}
          workspace={workspace}
          onCommit={onCommit}
          onOperationError={onOperationError}
        />
        <ProjectDocumentPanel yaml={yaml} />
      </section>
    </main>
  );
}
