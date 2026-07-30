export {
  ProjectValidationError,
  ProjectWorkspace,
  createProjectDocument
} from "./project-workspace.js";
export {
  ProjectHistory,
  type ProjectHistorySnapshot
} from "./project-history.js";
export {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
export {
  deriveWallFaces,
  deriveWallJunctions,
  findWallAtPoint,
  findWallEndpointAtPoint,
  normalizeAngleDeg,
  snapAngle,
  snapPoint,
  snapWallDelta,
  wallAngleDeg
} from "./wall-geometry.js";
export {
  CURRENT_SCHEMA_VERSION,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type DiagnosticSeverity,
  type EntityKind,
  type ExtensionData,
  type IdFactory,
  type Level,
  type MeasurementUnits,
  type DoorOpening,
  type FixedOperation,
  type HingedOperation,
  type Opening,
  type OpeningInput,
  type OpeningUpdate,
  type PassageOpening,
  type PathDirection,
  type ParseProjectDocumentResult,
  type ProjectDocument,
  type SchemaVersion,
  type PointMm,
  type StraightWallPath,
  type SlidingOperation,
  type SwingDirection,
  type Wall,
  type WallInput,
  type WallJunction,
  type WallUpdate,
  type WindowOpening
} from "./types.js";
