import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import {
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  visit,
  type Document,
  type Node,
  type Pair
} from "yaml";
import projectDocumentSchema from "./project-document.schema.json" with {
  type: "json"
};
import {
  CURRENT_SCHEMA_VERSION,
  type Diagnostic,
  type ParseProjectDocumentResult,
  type PlanSnapshot,
  type ProjectDocument
} from "./types.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});
ajv.addFormat("date-time", {
  type: "string",
  validate: (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
    && Number.isFinite(Date.parse(value))
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
      path === "/activePlan/proposalId" ||
      /^\/designProposals\/\d+\/id$/.test(path) ||
      /^(?:\/designProposals\/\d+)?\/levels\/\d+\/id$/.test(path) ||
      /^(?:\/designProposals\/\d+)?\/levels\/\d+\/openings\/\d+\/(id|hostWallId)$/.test(path) ||
      /^(?:\/designProposals\/\d+)?\/furnitureDefinitions\/\d+\/id$/.test(path) ||
      /^(?:\/designProposals\/\d+)?\/fixtureDefinitions\/\d+\/id$/.test(path) ||
      /^(?:\/designProposals\/\d+)?\/levels\/\d+\/(furniturePlacements|fixturePlacements)\/\d+\/(id|definitionId)$/.test(path))
  ) {
    return "stable-id.invalid";
  }

  if (
    error.keyword === "exclusiveMinimum" &&
    (
      /^\/levels\/\d+\/defaultWallHeightMm$/.test(path) ||
      /^\/levels\/\d+\/openings\/\d+\/(widthMm|heightMm)$/.test(path) ||
      /^\/furnitureDefinitions\/\d+\/(widthMm|depthMm|heightMm)$/.test(path)
      || /^\/fixtureDefinitions\/\d+\/(widthMm|depthMm|heightMm)$/.test(path)
    )
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

function planSemanticDiagnostics(document: PlanSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const levelIds = new Set<string>();
  const definitionIds = new Set<string>();
  const fixtureDefinitionIds = new Set<string>();

  for (const [index, definition] of (document.furnitureDefinitions ?? []).entries()) {
    if (definitionIds.has(definition.id)) {
      diagnostics.push({
        code: "furniture-definition.id.duplicate",
        severity: "error",
        path: `/furnitureDefinitions/${index}/id`,
        message: `Furniture Definition ID "${definition.id}" must be unique within the Project Document.`
      });
    }
    definitionIds.add(definition.id);
  }

  for (const [index, definition] of (document.fixtureDefinitions ?? []).entries()) {
    if (fixtureDefinitionIds.has(definition.id)) {
      diagnostics.push({
        code: "fixture-definition.id.duplicate",
        severity: "error",
        path: `/fixtureDefinitions/${index}/id`,
        message: `Fixture Definition ID "${definition.id}" must be unique within the Project Document.`
      });
    }
    fixtureDefinitionIds.add(definition.id);
  }

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
    const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));
    const openingIds = new Set<string>();

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

    for (const [openingIndex, opening] of (level.openings ?? []).entries()) {
      const openingPath = `/levels/${index}/openings/${openingIndex}`;
      if (openingIds.has(opening.id)) {
        diagnostics.push({
          code: "opening.id.duplicate",
          severity: "error",
          path: `${openingPath}/id`,
          message: `Opening ID "${opening.id}" must be unique within the Level.`
        });
      }
      openingIds.add(opening.id);
      const host = wallsById.get(opening.hostWallId);
      if (!host) {
        diagnostics.push({
          code: "opening.host.missing",
          severity: "error",
          path: `${openingPath}/hostWallId`,
          message: `Opening host Wall "${opening.hostWallId}" does not exist in the Level.`
        });
        continue;
      }
      const wallLength = Math.hypot(
        host.path.end.x - host.path.start.x,
        host.path.end.y - host.path.start.y
      );
      if (opening.positionMm + opening.widthMm > wallLength) {
        diagnostics.push({
          code: "opening.bounds.horizontal",
          severity: "error",
          path: `${openingPath}/positionMm`,
          message: "Opening must fit within its host Wall path."
        });
      }
      const bottom = opening.kind === "window" ? opening.sillHeightMm : 0;
      if (bottom + opening.heightMm > host.heightMm) {
        diagnostics.push({
          code: "opening.bounds.vertical",
          severity: "error",
          path: `${openingPath}/heightMm`,
          message: "Opening must fit within the height of its host Wall."
        });
      }
    }

    const placementIds = new Set<string>();
    for (const [placementIndex, placement] of (level.furniturePlacements ?? []).entries()) {
      if (placementIds.has(placement.id)) {
        diagnostics.push({
          code: "furniture-placement.id.duplicate",
          severity: "error",
          path: `/levels/${index}/furniturePlacements/${placementIndex}/id`,
          message: `Furniture Placement ID "${placement.id}" must be unique within its Level.`
        });
      }
      placementIds.add(placement.id);
      if (!definitionIds.has(placement.definitionId)) {
        diagnostics.push({
          code: "furniture-placement.definition.missing",
          severity: "error",
          path: `/levels/${index}/furniturePlacements/${placementIndex}/definitionId`,
          message: `Furniture Definition "${placement.definitionId}" is not embedded in the Project Document.`
        });
      }
    }

    const fixturePlacementIds = new Set<string>();
    for (const [placementIndex, placement] of (level.fixturePlacements ?? []).entries()) {
      if (fixturePlacementIds.has(placement.id)) {
        diagnostics.push({
          code: "fixture-placement.id.duplicate",
          severity: "error",
          path: `/levels/${index}/fixturePlacements/${placementIndex}/id`,
          message: `Fixture Placement ID "${placement.id}" must be unique within its Level.`
        });
      }
      fixturePlacementIds.add(placement.id);
      if (!fixtureDefinitionIds.has(placement.definitionId)) {
        diagnostics.push({
          code: "fixture-placement.definition.missing",
          severity: "error",
          path: `/levels/${index}/fixturePlacements/${placementIndex}/definitionId`,
          message: `Fixture Definition "${placement.definitionId}" is not embedded in the Project Document.`
        });
      }
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

function semanticDiagnostics(document: ProjectDocument): Diagnostic[] {
  const diagnostics = planSemanticDiagnostics(document);
  const proposalIds = new Set<string>();
  const proposals = document.designProposals ?? [];

  if (proposals.length && document.existingStateRevision === undefined) {
    diagnostics.push({
      code: "design-proposal.provenance.missing",
      severity: "error",
      path: "/existingStateRevision",
      message:
        "Existing State revision is required when Design Proposals exist."
    });
  }
  if (proposals.length && document.existingStateRevisedAt === undefined) {
    diagnostics.push({
      code: "design-proposal.provenance.missing",
      severity: "error",
      path: "/existingStateRevisedAt",
      message:
        "Existing State revision date is required when Design Proposals exist."
    });
  }

  for (const [index, proposal] of proposals.entries()) {
    if (proposalIds.has(proposal.id)) {
      diagnostics.push({
        code: "design-proposal.id.duplicate",
        severity: "error",
        path: `/designProposals/${index}/id`,
        message: `Design Proposal ID "${proposal.id}" must be unique within the Project Document.`
      });
    }
    proposalIds.add(proposal.id);
    if (
      document.existingStateRevision !== undefined
      && proposal.sourceRevision > document.existingStateRevision
    ) {
      diagnostics.push({
        code: "design-proposal.source-revision.future",
        severity: "error",
        path: `/designProposals/${index}/sourceRevision`,
        message:
          "Design Proposal source revision must not be newer than the Existing State."
      });
    }
    diagnostics.push(...planSemanticDiagnostics(proposal).map((diagnostic) => ({
      ...diagnostic,
      path: `/designProposals/${index}${diagnostic.path}`
    })));
  }

  if (
    document.activePlan?.kind === "design-proposal"
    && !proposalIds.has(document.activePlan.proposalId)
  ) {
    diagnostics.push({
      code: "active-plan.proposal.missing",
      severity: "error",
      path: "/activePlan/proposalId",
      message: `Active Design Proposal "${document.activePlan.proposalId}" does not exist.`
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

function escapeJsonPointerSegment(value: string | number): string {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function restrictedNodePath(
  key: number | "key" | "value" | null,
  path: readonly (Document | Node | Pair)[]
): string {
  const segments: (string | number)[] = [];
  for (const [index, ancestor] of path.entries()) {
    if (!isPair(ancestor)) continue;
    const parent = path[index - 1];
    if (isMap(parent) && isScalar(ancestor.key)) {
      segments.push(String(ancestor.key.value));
    } else if (isSeq(parent)) {
      segments.push(parent.items.indexOf(ancestor));
    }
  }
  if (typeof key === "number" && isSeq(path.at(-1))) segments.push(key);
  return segments.length
    ? `/${segments.map(escapeJsonPointerSegment).join("/")}`
    : "/";
}

function restrictedSyntaxDiagnostics(
  document: Document,
  lineCounter: LineCounter
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  visit(document, (key, value, path) => {
    if (isNode(value) && nodeUsesRestrictedSyntax(value)) {
      const position = value.range
        ? lineCounter.linePos(value.range[0])
        : { line: 1, col: 1 };
      diagnostics.push({
        code: "yaml.restricted-syntax",
        severity: "error",
        path: restrictedNodePath(key, path),
        message:
          "Remove the YAML alias, anchor, or custom tag; Project Documents allow only plain restricted YAML.",
        line: position.line,
        column: position.col
      });
    }
  });

  for (const error of document.errors) {
    if (error.code === "TAG_RESOLVE_FAILED" && diagnostics.length === 0) {
      diagnostics.push({
        code: "yaml.restricted-syntax",
        severity: "error",
        path: "/",
        message: "Remove the custom YAML tag; Project Documents allow only standard restricted YAML.",
        line: error.linePos?.[0]?.line,
        column: error.linePos?.[0]?.col
      });
    }
  }

  return diagnostics;
}

function diagnosticPathSegments(path: string): (string | number)[] {
  return path.split("/").slice(1).filter(Boolean).map((segment) => {
    const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    return /^\d+$/.test(decoded) ? Number(decoded) : decoded;
  });
}

function locateDiagnostic(
  diagnostic: Diagnostic,
  document: Document,
  lineCounter: LineCounter
): Diagnostic {
  if (diagnostic.line !== undefined && diagnostic.column !== undefined) {
    return diagnostic;
  }

  const segments = diagnosticPathSegments(diagnostic.path);
  let node: unknown;
  for (let length = segments.length; length >= 0; length -= 1) {
    node = length === 0
      ? document.contents
      : document.getIn(segments.slice(0, length), true);
    if (isNode(node) && node.range) break;
  }
  const position = isNode(node) && node.range
    ? lineCounter.linePos(node.range[0])
    : { line: 1, col: 1 };
  return {
    ...diagnostic,
    line: diagnostic.line ?? position.line,
    column: diagnostic.column ?? position.col
  };
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
  const lineCounter = new LineCounter();
  const yamlDocument = parseDocument(source, {
    lineCounter,
    schema: "core",
    uniqueKeys: true,
    prettyErrors: true
  });
  const syntaxDiagnostics = restrictedSyntaxDiagnostics(yamlDocument, lineCounter);
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
      diagnostics: [...syntaxDiagnostics, ...parseDiagnostics].map(
        (diagnostic) => locateDiagnostic(diagnostic, yamlDocument, lineCounter)
      )
    };
  }

  const parsedValue: unknown = yamlDocument.toJS({
    maxAliasCount: 0
  });
  const diagnostics = validateProjectDocument(parsedValue).map(
    (diagnostic) => locateDiagnostic(diagnostic, yamlDocument, lineCounter)
  );

  if (diagnostics.length) {
    return { diagnostics };
  }

  return {
    document: parsedValue as ProjectDocument,
    diagnostics: []
  };
}
