import {
  type DesignProposal,
  type Diagnostic,
  type Level,
  type ProjectDocument,
  type ProjectCheckpoint,
  type ProposalStaleness
} from "@smarchitect/core";
import { BufferedInput } from "../BufferedInput.js";
import { useState } from "react";
import { ItemLibrary } from "../ItemLibrary.js";
import {
  type ItemKind,
  type ItemLibraryController
} from "../use-item-library.js";

interface ProjectSidebarProps {
  activeLevel: Level;
  activeProposal?: DesignProposal;
  diagnostics: Diagnostic[];
  document: ProjectDocument;
  error: string;
  isSaving: boolean;
  isEditingLocked: boolean;
  library: ItemLibraryController;
  checkpoints: readonly ProjectCheckpoint[];
  onCreateCheckpoint(name: string): Promise<boolean>;
  onRestoreCheckpoint(checkpointId: string): void;
  onCreateProposal(): void;
  onDeleteProposal(): void;
  onPlaceItem(kind: ItemKind, definitionId: string): void;
  onProposalNameChange(value: string): void;
  onRenameProject(value: string): void;
  onRenameProposal(value: string): void;
  onSelectExistingState(): void;
  onSelectProposal(proposalId: string): void;
  proposalName: string;
  proposalStaleness?: ProposalStaleness;
}

export function ProjectSidebar({
  activeLevel,
  activeProposal,
  diagnostics,
  document,
  error,
  isSaving,
  isEditingLocked,
  library,
  checkpoints,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onCreateProposal,
  onDeleteProposal,
  onPlaceItem,
  onProposalNameChange,
  onRenameProject,
  onRenameProposal,
  onSelectExistingState,
  onSelectProposal,
  proposalName,
  proposalStaleness
}: ProjectSidebarProps) {
  const errorCount = diagnostics.filter(({ severity }) => severity === "error").length;
  const warningCount = diagnostics.filter(({ severity }) => severity === "warning").length;
  const [checkpointName, setCheckpointName] = useState("");
  return (
    <aside className="project-panel" aria-label="Project properties">
      <label className="field">
        <span>Rename project</span>
        <BufferedInput
          aria-label="Rename project"
          disabled={isSaving || isEditingLocked}
          value={document.name}
          onCommit={onRenameProject}
        />
      </label>
      <section className="proposal-manager" aria-labelledby="proposal-title">
        <div className="proposal-heading">
          <h2 id="proposal-title">Plans</h2>
          <span>{document.designProposals?.length ?? 0} proposals</span>
        </div>
        <button
          type="button"
          className={activeProposal ? "proposal-option" : "proposal-option active"}
          disabled={isSaving || isEditingLocked}
          onClick={onSelectExistingState}
        >
          <strong>Existing State</strong>
          <small>Revision {document.existingStateRevision ?? 0}</small>
        </button>
        {(document.designProposals ?? []).map((proposal) => (
          <button
            type="button"
            key={proposal.id}
            className={activeProposal?.id === proposal.id
              ? "proposal-option active"
              : "proposal-option"}
            disabled={isSaving || isEditingLocked}
            onClick={() => onSelectProposal(proposal.id)}
          >
            <strong>{proposal.name}</strong>
            <small>From revision {proposal.sourceRevision}</small>
          </button>
        ))}
        <div className="proposal-create">
          <input
            aria-label="New Design Proposal name"
            value={proposalName}
            disabled={isSaving || isEditingLocked}
            placeholder="Proposal name"
            onChange={(event) => onProposalNameChange(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || isEditingLocked || !proposalName.trim()}
            onClick={onCreateProposal}
          >
            Create from Existing State
          </button>
        </div>
        {activeProposal ? (
          <div className="active-proposal-actions">
            <label className="field">
              <span>Rename Design Proposal</span>
              <input
                aria-label="Rename Design Proposal"
                disabled={isSaving || isEditingLocked}
                value={activeProposal.name}
                onChange={(event) => onRenameProposal(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="danger-button"
              disabled={isSaving || isEditingLocked}
              onClick={onDeleteProposal}
            >
              Delete Design Proposal
            </button>
          </div>
        ) : null}
        {proposalStaleness?.stale ? (
          <p className="proposal-stale" role="status">
            This proposal is stale. It was cloned from Existing State
            revision {proposalStaleness.sourceRevision} on{" "}
            {new Date(proposalStaleness.sourceRevisedAt).toLocaleString()}.
            Existing State is now revision {proposalStaleness.currentRevision},
            revised{" "}
            {new Date(proposalStaleness.currentRevisedAt).toLocaleString()}.
          </p>
        ) : null}
      </section>
      <section className="checkpoint-manager" aria-labelledby="checkpoint-title">
        <div className="proposal-heading">
          <h2 id="checkpoint-title">Checkpoints</h2>
          <span>{checkpoints.length} named</span>
        </div>
        <div className="proposal-create">
          <input
            aria-label="New Checkpoint name"
            value={checkpointName}
            disabled={isSaving || isEditingLocked}
            placeholder="Milestone name"
            onChange={(event) => setCheckpointName(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || isEditingLocked || !checkpointName.trim()}
            onClick={() => {
              void onCreateCheckpoint(checkpointName).then((created) => {
                if (created) setCheckpointName("");
              });
            }}
          >
            Create Checkpoint
          </button>
        </div>
        {checkpoints.length ? (
          <ol className="checkpoint-list">
            {checkpoints.map((checkpoint) => (
              <li key={checkpoint.id}>
                <div>
                  <strong>{checkpoint.name}</strong>
                  <small>{new Date(checkpoint.createdAt).toLocaleString()}</small>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSaving || isEditingLocked}
                  onClick={() => onRestoreCheckpoint(checkpoint.id)}
                  aria-label={`Restore Checkpoint ${checkpoint.name}`}
                >
                  Restore
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="panel-note">Autosaves stay separate from named milestones.</p>
        )}
      </section>
      <div className="level-card">
        <span className="level-index">01</span>
        <div>
          <strong>{activeLevel.name}</strong>
          <small>
            {activeLevel.defaultWallHeightMm / 1000} m default wall height
          </small>
        </div>
      </div>
      <ItemLibrary
        controller={library}
        disabled={isSaving || isEditingLocked || library.isSaving}
        onPlace={onPlaceItem}
      />
      <dl className="project-facts">
        <div>
          <dt>Units</dt>
          <dd>Metric</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{document.schemaVersion}</dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd className={errorCount
            ? "status-error"
            : warningCount ? "status-warning" : "status-valid"}
          >
            {errorCount
              ? `${errorCount} document error${errorCount === 1 ? "" : "s"}`
              : warningCount
                ? `Valid · ${warningCount} advisory warning${warningCount === 1 ? "" : "s"}`
                : "Valid"}
          </dd>
        </div>
      </dl>
      {error ? <p className="error-message">{error}</p> : null}
      <p className="panel-note">
        Your project stays in this browser. Export a Project Archive regularly:
        browser storage can be cleared even when persistent storage is requested.
      </p>
      <p className="panel-note">
        For early-stage space planning only. Consult qualified professionals
        before construction.
      </p>
    </aside>
  );
}
