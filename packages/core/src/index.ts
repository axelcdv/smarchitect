export {
  ProjectValidationError,
  ProjectWorkspace,
  createProjectDocument
} from "./project-workspace.js";
export {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
export {
  deriveWallFaces,
  deriveWallJunctions,
  snapAngle,
  snapPoint
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
  type ParseProjectDocumentResult,
  type ProjectDocument,
  type SchemaVersion,
  type PointMm,
  type StraightWallPath,
  type Wall,
  type WallInput,
  type WallJunction,
  type WallUpdate
} from "./types.js";
