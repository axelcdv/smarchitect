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
  parseProjectDocument,
  validateProjectDocument
} from "./validation.js";
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
  type CreateFurnitureDefinitionOptions,
  type CreateFixtureDefinitionOptions,
  type CreateProjectDocumentOptions,
  type Diagnostic,
  type DiagnosticSeverity,
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
  type ProjectDocument,
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
