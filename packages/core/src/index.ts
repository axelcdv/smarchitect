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
  deriveRooms,
  findRoomContainingPoint,
  findRoomLabelAtPoint,
  pointInRoom
} from "./room-geometry.js";
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
  type Room,
  type RoomLabel,
  type RoomLabelInput,
  type RoomLabelUpdate,
  type SchemaVersion,
  type PointMm,
  type StraightWallPath,
  type Wall,
  type WallInput,
  type WallJunction,
  type WallUpdate
} from "./types.js";
