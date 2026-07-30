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
  walls: Wall[];
  furniturePlacements: FurniturePlacement[];
  extensions: ExtensionData;
}

export interface PointMm {
  x: number;
  y: number;
}

export interface StraightWallPath {
  kind: "straight";
  start: PointMm;
  end: PointMm;
}

export interface Wall {
  id: string;
  path: StraightWallPath;
  thicknessMm: number;
  heightMm: number;
  extensions: ExtensionData;
}

export interface WallInput {
  start: PointMm;
  end: PointMm;
  thicknessMm?: number;
  heightMm?: number;
}

export interface WallUpdate {
  start?: PointMm;
  end?: PointMm;
  lengthMm?: number;
  angleDeg?: number;
  thicknessMm?: number;
  heightMm?: number;
}

export interface FurnitureDefinition {
  id: string;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  extensions: ExtensionData;
}

export type FurnitureDefinitionUpdate = Partial<
  Pick<FurnitureDefinition, "name" | "widthMm" | "depthMm" | "heightMm">
>;

export interface FurniturePlacement {
  id: string;
  definitionId: string;
  position: PointMm;
  rotationDeg: number;
  elevationMm: number;
  extensions: ExtensionData;
}

export interface FurniturePlacementInput {
  position: PointMm;
  rotationDeg?: number;
  elevationMm?: number;
}

export interface FurniturePlacementUpdate {
  position?: PointMm;
  rotationDeg?: number;
  elevationMm?: number;
}

export interface WallJunction {
  point: PointMm;
  wallIds: string[];
}

export interface ProjectDocument {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  units: MeasurementUnits;
  activeLevelId: string;
  furnitureDefinitions: FurnitureDefinition[];
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

export type EntityKind =
  | "project"
  | "level"
  | "wall"
  | "furniture_definition"
  | "furniture_placement";
export type IdFactory = (kind: EntityKind) => string;

export interface CreateProjectDocumentOptions {
  idFactory?: IdFactory;
}
