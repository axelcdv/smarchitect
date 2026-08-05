export const CURRENT_SCHEMA_VERSION = "1.1.0" as const;
export const PREVIOUS_SCHEMA_VERSION = "1.0.0" as const;
export const PROJECT_DOCUMENT_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const;

export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;
export type MeasurementUnits = "metric";
export type DiagnosticSeverity = "error" | "warning";
export type DiagnosticFocusKind =
  | "wall"
  | "opening"
  | "room-label"
  | "furniture"
  | "fixture";
export type ExtensionData = Record<string, unknown>;

export interface Level {
  id: string;
  name: string;
  baseElevationMm: number;
  defaultWallHeightMm: number;
  walls: Wall[];
  roomLabels: RoomLabel[];
  openings: Opening[];
  furniturePlacements?: FurniturePlacement[];
  fixturePlacements?: FixturePlacement[];
  extensions: ExtensionData;
}

export interface LevelUpdate {
  name?: string;
  baseElevationMm?: number;
  defaultWallHeightMm?: number;
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

export type OpeningConflictResolution = "fit" | "delete";

export interface LineSegmentMm {
  start: PointMm;
  end: PointMm;
}

export interface OpeningPlanGeometry {
  start: PointMm;
  end: PointMm;
  operationKind: "passage" | FixedOperation["kind"] | HingedOperation["kind"] | SlidingOperation["kind"];
  jambs: LineSegmentMm[];
  panes: LineSegmentMm[];
  slidingPanels: LineSegmentMm[];
  hinge?: PointMm;
  leafEnd?: PointMm;
  swingArcStart?: PointMm;
  swingClockwise?: boolean;
  slideArrow?: {
    tail: PointMm;
    tip: PointMm;
    firstWing: PointMm;
    secondWing: PointMm;
  };
}

export interface FurnitureDefinition {
  id: string;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  extensions: ExtensionData;
}

export interface FurnitureDefinitionInput {
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
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

export interface FixtureDefinition {
  id: string;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  extensions: ExtensionData;
}

export interface FixtureDefinitionInput {
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export type FixtureDefinitionUpdate = Partial<
  Pick<FixtureDefinition, "name" | "widthMm" | "depthMm" | "heightMm">
>;

export interface FixturePlacement {
  id: string;
  definitionId: string;
  position: PointMm;
  rotationDeg: number;
  elevationMm: number;
  extensions: ExtensionData;
}

export type FixturePlacementInput = FurniturePlacementInput;
export type FixturePlacementUpdate = FurniturePlacementUpdate;

export interface WallJunction {
  point: PointMm;
  wallIds: string[];
}

export interface RoomLabel {
  id: string;
  name: string;
  position: PointMm;
  extensions: ExtensionData;
}

export interface RoomLabelInput {
  name: string;
  position: PointMm;
}

export interface RoomLabelUpdate {
  name?: string;
  position?: PointMm;
}

export interface Room {
  id: string;
  boundary: PointMm[];
  areaMm2: number;
  dimensionsMm: {
    width: number;
    depth: number;
  };
  wallIds: string[];
  labelIds: string[];
}

export interface PlanSnapshot {
  activeLevelId: string;
  furnitureDefinitions?: FurnitureDefinition[];
  fixtureDefinitions?: FixtureDefinition[];
  levels: Level[];
}

export interface DesignProposal extends PlanSnapshot {
  id: string;
  name: string;
  sourceRevision: number;
  sourceRevisedAt: string;
  extensions: ExtensionData;
}

export type ActivePlanSelection =
  | { kind: "existing-state" }
  | { kind: "design-proposal"; proposalId: string };

export interface ProjectDocument {
  schemaVersion: SchemaVersion;
  schemaDialect: typeof PROJECT_DOCUMENT_SCHEMA_DIALECT;
  id: string;
  name: string;
  units: MeasurementUnits;
  activeLevelId: string;
  furnitureDefinitions?: FurnitureDefinition[];
  fixtureDefinitions?: FixtureDefinition[];
  levels: Level[];
  existingStateRevision?: number;
  existingStateRevisedAt?: string;
  activePlan?: ActivePlanSelection;
  designProposals?: DesignProposal[];
  extensions: ExtensionData;
}

export interface ProposalStaleness {
  stale: boolean;
  sourceRevision: number;
  sourceRevisedAt: string;
  currentRevision: number;
  currentRevisedAt: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path: string;
  message: string;
  affectedIds?: string[];
  focus?: {
    kind: DiagnosticFocusKind;
    id: string;
  };
  line?: number;
  column?: number;
}

export interface ParseProjectDocumentResult {
  document?: ProjectDocument;
  diagnostics: Diagnostic[];
}

export interface ProjectDocumentMigrationPreview {
  sourceVersion: typeof PREVIOUS_SCHEMA_VERSION;
  targetVersion: SchemaVersion;
  schemaDialect: typeof PROJECT_DOCUMENT_SCHEMA_DIALECT;
  originalSource: string;
  migratedSource: string;
  document: ProjectDocument;
  changes: readonly string[];
}

export type EntityKind =
  | "project"
  | "level"
  | "wall"
  | "room-label"
  | "opening"
  | "furniture_definition"
  | "furniture_placement"
  | "fixture_definition"
  | "fixture_placement"
  | "checkpoint"
  | "design_proposal";
export type IdFactory = (kind: EntityKind) => string;

export interface CreateProjectDocumentOptions {
  idFactory?: IdFactory;
  now?: () => Date;
}

export interface CreateFurnitureDefinitionOptions {
  idFactory?: IdFactory;
}

export interface CreateFixtureDefinitionOptions {
  idFactory?: IdFactory;
}
