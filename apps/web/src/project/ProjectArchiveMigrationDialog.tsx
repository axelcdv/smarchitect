import type { ProjectArchiveMigrationPreview } from "@smarchitect/core";
import { downloadProjectArchiveBytes } from "./project-file.js";

interface ProjectArchiveMigrationDialogProps {
  isSaving: boolean;
  preview: ProjectArchiveMigrationPreview;
  onCancel(): void;
  onConfirm(): void;
}

export function ProjectArchiveMigrationDialog({
  isSaving,
  preview,
  onCancel,
  onConfirm
}: ProjectArchiveMigrationDialogProps) {
  return (
    <div className="migration-backdrop">
      <section
        className="migration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-migration-title"
      >
        <p className="eyebrow">Project Archive migration preview</p>
        <h2 id="archive-migration-title">Review archive schema migration</h2>
        <p>
          The imported ZIP is unchanged. Confirming migrates the listed Project
          Documents together and imports them atomically.
        </p>
        {preview.documents.map((document) => (
          <section key={document.path} className="archive-migration-document">
            <h3>{document.path}</h3>
            <p>
              Schema {document.sourceVersion} to {document.targetVersion}
            </p>
            <ul>
              {document.changes.map((change) => <li key={change}>{change}</li>)}
            </ul>
            <div className="migration-sources">
              <label>
                <span>Original YAML</span>
                <textarea readOnly value={document.originalSource} />
              </label>
              <label>
                <span>Migrated YAML</span>
                <textarea readOnly value={document.migratedSource} />
              </label>
            </div>
          </section>
        ))}
        <div className="welcome-actions">
          <button type="button" disabled={isSaving} onClick={onCancel}>
            Cancel migration
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => downloadProjectArchiveBytes(
              preview.originalArchive,
              `${preview.imported.workspace.document.name}-original`
            )}
          >
            Download original Archive
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isSaving}
            onClick={onConfirm}
          >
            Confirm archive migration
          </button>
        </div>
      </section>
    </div>
  );
}
