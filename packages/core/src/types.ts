export const CURRENT_SCHEMA_VERSION = "1.0.0" as const;

export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;
export type MeasurementUnits = "metric";
export type DiagnosticSeverity = "error" | "warning";
export type ExtensionData = Record<string, unknown>;

export interface Level {
  id: string;
  name: string;
  baseElevationMm: number;
  defaultWallHeightMm: number;
  extensions: ExtensionData;
}

export interface ProjectDocument {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  units: MeasurementUnits;
  activeLevelId: string;
  levels: Level[];
  extensions: ExtensionData;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ParseProjectDocumentResult {
  document?: ProjectDocument;
  diagnostics: Diagnostic[];
}

export type EntityKind = "project" | "level";
export type IdFactory = (kind: EntityKind) => string;

export interface CreateProjectDocumentOptions {
  idFactory?: IdFactory;
}
