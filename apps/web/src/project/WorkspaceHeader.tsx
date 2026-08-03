import {
  type ChangeEventHandler,
  type RefObject
} from "react";
import { ProjectImportControl } from "./ProjectImportControl.js";
import { downloadProjectYaml } from "./project-file.js";

interface WorkspaceHeaderProps {
  canRedo: boolean;
  canUndo: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  isDesignProposal: boolean;
  isSaving: boolean;
  isEditingLocked: boolean;
  onImport: ChangeEventHandler<HTMLInputElement>;
  onNavigateHistory(direction: "undo" | "redo"): void;
  projectName: string;
  yaml: string;
}

export function WorkspaceHeader({
  canRedo,
  canUndo,
  importInputRef,
  isDesignProposal,
  isSaving,
  isEditingLocked,
  onImport,
  onNavigateHistory,
  projectName,
  yaml
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
      </div>
    </header>
  );
}
