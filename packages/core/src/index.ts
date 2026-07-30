export {
  addFurnitureDefinition,
  createFurnitureDefinition,
  deleteFurnitureDefinition,
  updateFurnitureDefinition,
  validateFurnitureLibrary
} from "./furniture-library.js";
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
  type CreateFurnitureDefinitionOptions,
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
