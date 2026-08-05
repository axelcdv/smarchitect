import {
  type ChangeEventHandler,
  type RefObject
} from "react";
import type { ProjectCheckpoint } from "@smarchitect/core";
import { ProjectImportControl } from "./ProjectImportControl.js";
import {
  downloadProjectArchive,
  downloadProjectYaml
} from "./project-file.js";

interface WorkspaceHeaderProps {
  canRedo: boolean;
  canUndo: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  isDesignProposal: boolean;
  isSaving: boolean;
  isEditingLocked: boolean;
  writerState: "acquiring" | "writer" | "readonly" | "unsupported";
  storagePersistence: "checking" | "persistent" | "temporary" | "unavailable";
  onImport: ChangeEventHandler<HTMLInputElement>;
  onNavigateHistory(direction: "undo" | "redo"): void;
  onTakeOver(): void;
  projectName: string;
  yaml: string;
  checkpoints: readonly ProjectCheckpoint[];
}

export function WorkspaceHeader({
  canRedo,
  canUndo,
  importInputRef,
  isDesignProposal,
  isSaving,
  isEditingLocked,
  writerState,
  storagePersistence,
  onImport,
  onNavigateHistory,
  onTakeOver,
  projectName,
  yaml,
  checkpoints
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">
          {isDesignProposal ? "Design Proposal" : "Existing State"}
        </p>
        <h1>{projectName}</h1>
      </div>
      <div className="header-actions">
        {writerState === "readonly" ? (
          <button type="button" className="secondary-button" onClick={onTakeOver}>
            Take over editing
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          disabled={isSaving || isEditingLocked || !canUndo}
          onClick={() => onNavigateHistory("undo")}
        >
          Undo
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isSaving || isEditingLocked || !canRedo}
          onClick={() => onNavigateHistory("redo")}
        >
          Redo
        </button>
        <ProjectImportControl
          buttonClassName="secondary-button"
          disabled={isSaving || isEditingLocked}
          importInputRef={importInputRef}
          onImport={onImport}
        />
        <button
          type="button"
          className="primary-button"
          onClick={() => downloadProjectYaml(yaml, projectName)}
        >
          Export YAML
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => downloadProjectArchive(yaml, checkpoints, projectName)}
        >
          Export Archive
        </button>
      </div>
      <div className="offline-status" role="status">
        {writerState === "writer" ? "Editing in this tab" : null}
        {writerState === "readonly" ? "Read-only: another tab is editing" : null}
        {writerState === "acquiring" ? "Checking project writer…" : null}
        {writerState === "unsupported" ? "Editing (browser lock unavailable)" : null}
        {storagePersistence === "persistent" ? " · Storage protected" : null}
        {storagePersistence === "temporary" ? " · Storage may be cleared" : null}
        {storagePersistence === "unavailable"
          ? " · Storage protection unavailable; export archives regularly"
          : null}
      </div>
    </header>
  );
}
