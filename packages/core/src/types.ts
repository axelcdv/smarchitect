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
  openings: Opening[];
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

export type PathDirection = "start" | "end";
export type SwingDirection = "inward" | "outward";

export interface HingedOperation {
  kind: "hinged";
  hingeSide: PathDirection;
  swingDirection: SwingDirection;
}

export interface SlidingOperation {
  kind: "sliding";
  slideDirection: PathDirection;
}

export interface FixedOperation {
  kind: "fixed";
}

interface OpeningBase {
  id: string;
  hostWallId: string;
  positionMm: number;
  widthMm: number;
  heightMm: number;
  extensions: ExtensionData;
}

export interface DoorOpening extends OpeningBase {
  kind: "door";
  operation: HingedOperation | SlidingOperation;
}

export interface WindowOpening extends OpeningBase {
  kind: "window";
  sillHeightMm: number;
  operation: FixedOperation | HingedOperation | SlidingOperation;
}

export interface PassageOpening extends OpeningBase {
  kind: "passage";
}

export type Opening = DoorOpening | WindowOpening | PassageOpening;

type NewOpening<T extends Opening> = Omit<T, "id" | "extensions">;

export type OpeningInput =
  | NewOpening<DoorOpening>
  | NewOpening<WindowOpening>
  | NewOpening<PassageOpening>;

export interface OpeningUpdate {
  hostWallId?: string;
  positionMm?: number;
  widthMm?: number;
  heightMm?: number;
  sillHeightMm?: number;
  operation?: FixedOperation | HingedOperation | SlidingOperation;
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

export type EntityKind = "project" | "level" | "wall" | "opening";
export type IdFactory = (kind: EntityKind) => string;

export interface CreateProjectDocumentOptions {
  idFactory?: IdFactory;
}
