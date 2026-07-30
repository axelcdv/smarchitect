import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import {
  isAlias,
  isNode,
  parseDocument,
  visit,
  type Document,
  type Node
} from "yaml";
import projectDocumentSchema from "./project-document.schema.json" with {
  type: "json"
};
import {
  CURRENT_SCHEMA_VERSION,
  type Diagnostic,
  type ParseProjectDocumentResult,
  type ProjectDocument
} from "./types.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});
const validateStructure = ajv.compile<ProjectDocument>(projectDocumentSchema);

function schemaErrorPath(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = String(error.params.missingProperty);
    return `${error.instancePath}/${missingProperty}`;
  }

  return error.instancePath || "/";
}

function schemaErrorCode(error: ErrorObject): string {
  const path = schemaErrorPath(error);

  if (
    error.keyword === "pattern" &&
    (path === "/id" ||
      path === "/activeLevelId" ||
      /^\/levels\/\d+\/id$/.test(path))
  ) {
    return "stable-id.invalid";
  }

  if (
    error.keyword === "exclusiveMinimum" &&
    /^\/levels\/\d+\/defaultWallHeightMm$/.test(path)
  ) {
    return "dimension.non-positive";
  }

  return "schema.invalid";
}

function schemaDiagnostics(): Diagnostic[] {
  return (validateStructure.errors ?? []).map((error) => ({
    code: schemaErrorCode(error),
    severity: "error",
    path: schemaErrorPath(error),
    message: error.message
      ? `Project Document ${error.message}.`
      : "Project Document does not match the published schema."
  }));
}

function semanticDiagnostics(document: ProjectDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const levelIds = new Set<string>();

  for (const [index, level] of document.levels.entries()) {
    if (levelIds.has(level.id)) {
      diagnostics.push({
        code: "level.id.duplicate",
        severity: "error",
        path: `/levels/${index}/id`,
        message: `Level ID "${level.id}" must be unique within the Project Document.`
      });
    }
    levelIds.add(level.id);

    for (const [wallIndex, wall] of level.walls.entries()) {
      if (
        wall.path.start.x === wall.path.end.x
        && wall.path.start.y === wall.path.end.y
      ) {
        diagnostics.push({
          code: "wall.length.zero",
          severity: "error",
          path: `/levels/${index}/walls/${wallIndex}/path/end`,
          message: "Wall path must have distinct start and end points."
        });
      }
    }
    const roomLabelIds = new Set<string>();
    for (const [labelIndex, label] of (level.roomLabels ?? []).entries()) {
      if (roomLabelIds.has(label.id)) {
        diagnostics.push({
          code: "room-label.id.duplicate",
          severity: "error",
          path: `/levels/${index}/roomLabels/${labelIndex}/id`,
          message: `Room Label ID "${label.id}" must be unique within its Level.`
        });
      }
      roomLabelIds.add(label.id);
    }
  }

  if (!levelIds.has(document.activeLevelId)) {
    diagnostics.push({
      code: "active-level.missing",
      severity: "error",
      path: "/activeLevelId",
      message: `Active Level "${document.activeLevelId}" does not exist in levels.`
    });
  }

  return diagnostics;
}

function unsupportedSchemaVersionDiagnostic(value: unknown): Diagnostic | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion !== CURRENT_SCHEMA_VERSION
  ) {
    return {
      code: "schema-version.unsupported",
      severity: "error",
      path: "/schemaVersion",
      message: `Unsupported schema version "${String(value.schemaVersion)}". Expected "${CURRENT_SCHEMA_VERSION}".`
    };
  }

  return undefined;
}

function nodeUsesRestrictedSyntax(node: Node): boolean {
  if (isAlias(node) || node.anchor) {
    return true;
  }

  return Boolean(node.tag && !node.tag.startsWith("tag:yaml.org,2002:"));
}

function restrictedSyntaxDiagnostics(document: Document): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  visit(document, (_key, value) => {
    if (isNode(value) && nodeUsesRestrictedSyntax(value)) {
      diagnostics.push({
        code: "yaml.restricted-syntax",
        severity: "error",
        path: "/",
        message:
          "Project Documents do not allow YAML aliases, anchors, or custom tags."
      });
    }
  });

  for (const error of document.errors) {
    if (error.code === "TAG_RESOLVE_FAILED") {
      diagnostics.push({
        code: "yaml.restricted-syntax",
        severity: "error",
        path: "/",
        message: "Project Documents do not allow custom YAML tags.",
        line: error.linePos?.[0]?.line,
        column: error.linePos?.[0]?.col
      });
    }
  }

  return diagnostics;
}

export function validateProjectDocument(value: unknown): Diagnostic[] {
  const unsupportedVersion = unsupportedSchemaVersionDiagnostic(value);

  if (unsupportedVersion) {
    return [unsupportedVersion];
  }

  if (!validateStructure(value)) {
    return schemaDiagnostics();
  }

  return semanticDiagnostics(value as ProjectDocument);
}

export function parseProjectDocument(
  source: string
): ParseProjectDocumentResult {
  const yamlDocument = parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    prettyErrors: true
  });
  const syntaxDiagnostics = restrictedSyntaxDiagnostics(yamlDocument);
  const parseDiagnostics: Diagnostic[] = yamlDocument.errors
    .filter((error) => error.code !== "TAG_RESOLVE_FAILED")
    .map((error) => ({
      code: "yaml.invalid",
      severity: "error",
      path: "/",
      message: error.message,
      line: error.linePos?.[0]?.line,
      column: error.linePos?.[0]?.col
    }));

  if (syntaxDiagnostics.length || parseDiagnostics.length) {
    return {
      diagnostics: [...syntaxDiagnostics, ...parseDiagnostics]
    };
  }

  const value: unknown = yamlDocument.toJS({
    maxAliasCount: 0
  });
  const diagnostics = validateProjectDocument(value);

  if (diagnostics.length) {
    return { diagnostics };
  }

  return {
    document: value as ProjectDocument,
    diagnostics: []
  };
}
