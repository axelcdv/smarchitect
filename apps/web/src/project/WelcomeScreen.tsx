import {
  type ChangeEventHandler,
  type RefObject
} from "react";
import { ProjectImportControl } from "./ProjectImportControl.js";

interface WelcomeScreenProps {
  draftName: string;
  error: string;
  importInputRef: RefObject<HTMLInputElement | null>;
  isSaving: boolean;
  onCreate(): void;
  onDraftNameChange(value: string): void;
  onImport: ChangeEventHandler<HTMLInputElement>;
}

export function WelcomeScreen({
  draftName,
  error,
  importInputRef,
  isSaving,
  onCreate,
  onDraftNameChange,
  onImport
}: WelcomeScreenProps) {
  return (
    <main className="welcome-shell">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Open home planning</p>
        <h1 id="welcome-title">Shape the home you already know.</h1>
        <p className="welcome-copy">
          Start with one measured Level. Your plan stays local, readable, and
          yours.
        </p>
        <label className="field">
          <span>Project name</span>
          <input
            autoFocus
            value={draftName}
            disabled={isSaving}
            onChange={(event) => onDraftNameChange(event.target.value)}
            placeholder="Our apartment"
          />
        </label>
        <div className="welcome-actions">
          <button
            className="primary-button"
            type="button"
            disabled={isSaving || !draftName.trim()}
            onClick={onCreate}
          >
            Create project
          </button>
          <ProjectImportControl
            buttonClassName="secondary-button"
            disabled={isSaving}
            importInputRef={importInputRef}
            onImport={onImport}
          />
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        <p className="disclaimer">
          Smarchitect supports early-stage space planning, not permit or
          construction documentation.
        </p>
      </section>
    </main>
  );
}
