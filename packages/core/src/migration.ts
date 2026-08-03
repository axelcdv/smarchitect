import { parseDocument } from "yaml";
import { ProjectValidationError } from "./project-workspace.js";
import {
  CURRENT_SCHEMA_VERSION,
  PREVIOUS_SCHEMA_VERSION,
  PROJECT_DOCUMENT_SCHEMA_DIALECT,
  type Diagnostic,
  type ProjectDocumentMigrationPreview
} from "./types.js";
import { parseProjectDocument } from "./validation.js";

function migrationDiagnostic(message: string): Diagnostic {
  return {
    code: "schema-version.migration-unavailable",
    severity: "error",
    path: "/schemaVersion",
    message
  };
}

export function previewProjectDocumentMigration(
  source: string
): ProjectDocumentMigrationPreview {
  const parsed = parseProjectDocument(source);
  const migrationRequired = parsed.diagnostics.length === 1
    && parsed.diagnostics[0]?.code === "schema-version.migration-required";

  if (!migrationRequired) {
    throw new ProjectValidationError(
      parsed.diagnostics.length
        ? parsed.diagnostics
        : [migrationDiagnostic(
          `Project Document already uses current schema version "${CURRENT_SCHEMA_VERSION}".`
        )]
    );
  }

  const yamlDocument = parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    prettyErrors: true
  });
  yamlDocument.setIn(["schemaVersion"], CURRENT_SCHEMA_VERSION);
  yamlDocument.setIn(["schemaDialect"], PROJECT_DOCUMENT_SCHEMA_DIALECT);
  const migratedSource = yamlDocument.toString({ lineWidth: 0 });
  const migrated = parseProjectDocument(migratedSource);

  if (!migrated.document || migrated.diagnostics.length) {
    throw new ProjectValidationError(migrated.diagnostics);
  }

  return {
    sourceVersion: PREVIOUS_SCHEMA_VERSION,
    targetVersion: CURRENT_SCHEMA_VERSION,
    schemaDialect: PROJECT_DOCUMENT_SCHEMA_DIALECT,
    originalSource: source,
    migratedSource,
    document: migrated.document,
    changes: [
      `Update schemaVersion from ${PREVIOUS_SCHEMA_VERSION} to ${CURRENT_SCHEMA_VERSION}.`,
      `Declare schemaDialect as ${PROJECT_DOCUMENT_SCHEMA_DIALECT}.`
    ]
  };
}
