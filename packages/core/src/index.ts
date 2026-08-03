export {
  addFurnitureDefinition,
  createFurnitureDefinition,
  deleteFurnitureDefinition,
  updateFurnitureDefinition,
  validateFurnitureLibrary
} from "./furniture-library.js";
export {
  addFixtureDefinition,
  createFixtureDefinition,
  deleteFixtureDefinition,
  updateFixtureDefinition,
  validateFixtureLibrary
} from "./fixture-library.js";
export {
  furnitureFootprintCorners,
  furniturePlacementContainsPoint
} from "./furniture-geometry.js";
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
  createCheckpoint,
  restoreCheckpoint,
  type CheckpointHistoryEntry,
  type CreateCheckpointResult,
  type ProjectCheckpointCommandOptions,
  type ProjectCheckpointState,
  type RestoreCheckpointResult
} from "./project-checkpoint.js";
export {
  exportProjectArchive,
  importProjectArchive,
  previewProjectArchiveMigration,
  ProjectArchiveError,
  type ImportedProjectArchive,
  type ProjectArchiveDocumentMigrationPreview,
  type ProjectArchiveMigrationPreview,
  type ProjectCheckpoint
} from "./project-archive.js";
export {
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
export {
  previewProjectDocumentMigration
} from "./migration.js";
export {
  deriveWallFaces,
  deriveWallDragDelta,
  deriveWallJunctions,
  exceedsWallDragThreshold,
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
  deriveOpeningPlanGeometry,
  distanceAlongWallPath,
  pointAlongWallPath,
  wallPathLength
} from "./opening-geometry.js";
export {
  CURRENT_SCHEMA_VERSION,
  PREVIOUS_SCHEMA_VERSION,
  PROJECT_DOCUMENT_SCHEMA_DIALECT,
  type ActivePlanSelection,
  type CreateFurnitureDefinitionOptions,
  type CreateFixtureDefinitionOptions,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type DiagnosticSeverity,
  type DesignProposal,
  type EntityKind,
  type ExtensionData,
  type FurnitureDefinition,
  type FurnitureDefinitionInput,
  type FurnitureDefinitionUpdate,
  type FurniturePlacement,
  type FurniturePlacementInput,
  type FurniturePlacementUpdate,
  type FixtureDefinition,
  type FixtureDefinitionInput,
  type FixtureDefinitionUpdate,
  type FixturePlacement,
  type FixturePlacementInput,
  type FixturePlacementUpdate,
  type IdFactory,
  type Level,
  type LevelUpdate,
  type LineSegmentMm,
  type MeasurementUnits,
  type DoorOpening,
  type FixedOperation,
  type HingedOperation,
  type Opening,
  type OpeningInput,
  type OpeningConflictResolution,
  type OpeningPlanGeometry,
  type OpeningUpdate,
  type PassageOpening,
  type PathDirection,
  type ParseProjectDocumentResult,
  type PlanSnapshot,
  type ProposalStaleness,
  type ProjectDocument,
  type ProjectDocumentMigrationPreview,
  type Room,
  type RoomLabel,
  type RoomLabelInput,
  type RoomLabelUpdate,
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
