import type { ProjectDocumentMigrationPreview } from "@smarchitect/core";
import { downloadProjectYaml } from "./project-file.js";

interface SchemaMigrationDialogProps {
  isSaving: boolean;
  preview: ProjectDocumentMigrationPreview;
  onCancel(): void;
  onConfirm(): void;
}

export function SchemaMigrationDialog({
  isSaving,
  preview,
  onCancel,
  onConfirm
}: SchemaMigrationDialogProps) {
  return (
    <div className="migration-backdrop">
      <section
        className="migration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-title"
      >
        <p className="eyebrow">Schema migration preview</p>
        <h2 id="migration-title">
          Review migration from {preview.sourceVersion} to {preview.targetVersion}
        </h2>
        <p>
          The imported file is unchanged. Confirming creates a current Project
          Document; you can download the exact original first.
        </p>
        <ul>
          {preview.changes.map((change) => <li key={change}>{change}</li>)}
        </ul>
        <div className="migration-sources">
          <label>
            <span>Original YAML</span>
            <textarea readOnly value={preview.originalSource} />
          </label>
          <label>
            <span>Migrated YAML</span>
            <textarea readOnly value={preview.migratedSource} />
          </label>
        </div>
        <div className="welcome-actions">
          <button type="button" disabled={isSaving} onClick={onCancel}>
            Cancel migration
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => downloadProjectYaml(
              preview.originalSource,
              `${preview.document.name}-original`
            )}
          >
            Download original YAML
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isSaving}
            onClick={onConfirm}
          >
            Confirm migration
          </button>
        </div>
      </section>
    </div>
  );
}
