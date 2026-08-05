import type { Diagnostic } from "@smarchitect/core";

interface ProjectDocumentPanelProps {
  diagnostics: Diagnostic[];
  hasDraft: boolean;
  isSaving: boolean;
  isReadOnly: boolean;
  yaml: string;
  onApply(): void;
  onChange(value: string): void;
}

export function ProjectDocumentPanel({
  diagnostics,
  hasDraft,
  isSaving,
  isReadOnly,
  yaml,
  onApply,
  onChange
}: ProjectDocumentPanelProps) {
  return (
    <section className="yaml-panel" aria-labelledby="yaml-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source of truth</p>
          <h2 id="yaml-title">Project Document</h2>
        </div>
        <span className={hasDraft ? "draft-chip" : "valid-chip"}>
          {hasDraft ? "Draft not applied" : "Valid YAML"}
        </span>
      </div>
      <textarea
        aria-label="Project Document YAML"
        value={yaml}
        spellCheck={false}
        readOnly={isReadOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="yaml-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!hasDraft || isSaving || isReadOnly}
          onClick={onApply}
        >
          Apply YAML
        </button>
        {hasDraft ? (
          <p>Apply a completely valid document to unlock graphical editing.</p>
        ) : null}
      </div>
      {diagnostics.length ? (
        <ul className="yaml-diagnostics" role="alert" aria-label="YAML diagnostics">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
              <strong>{diagnostic.severity}</strong>{" "}
              <code>{diagnostic.path}</code>{" "}
              <span>
                line {diagnostic.line ?? 1}, column {diagnostic.column ?? 1}
              </span>
              <p>{diagnostic.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
