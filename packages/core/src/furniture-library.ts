import {
  type CreateFurnitureDefinitionOptions,
  type Diagnostic,
  type FurnitureDefinition,
  type FurnitureDefinitionInput,
  type FurnitureDefinitionUpdate,
  type IdFactory
} from "./types.js";
import { defaultIdFactory } from "./id-factory.js";

const FURNITURE_DEFINITION_ID =
  /^furniture_definition_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function normalizeDefinition(
  definition: FurnitureDefinition
): FurnitureDefinition {
  return {
    ...structuredClone(definition),
    name: definition.name.trim(),
    widthMm: Math.round(definition.widthMm),
    depthMm: Math.round(definition.depthMm),
    heightMm: Math.round(definition.heightMm)
  };
}

export function validateFurnitureLibrary(
  definitions: FurnitureDefinition[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();

  definitions.forEach((definition, index) => {
    const path = `/furnitureDefinitions/${index}`;
    if (!FURNITURE_DEFINITION_ID.test(definition.id)) {
      diagnostics.push({
        code: "stable-id.invalid",
        severity: "error",
        path: `${path}/id`,
        message: `Furniture Definition ID "${definition.id}" is invalid.`
      });
    } else if (ids.has(definition.id)) {
      diagnostics.push({
        code: "furniture-definition.id.duplicate",
        severity: "error",
        path: `${path}/id`,
        message: `Furniture Definition ID "${definition.id}" must be unique within the Item Library.`
      });
    }
    ids.add(definition.id);

    if (!definition.name.trim() || definition.name.trim().length > 120) {
      diagnostics.push({
        code: "furniture-definition.name.invalid",
        severity: "error",
        path: `${path}/name`,
        message: "Furniture Definition name must contain 1 to 120 characters."
      });
    }
    for (const field of ["widthMm", "depthMm", "heightMm"] as const) {
      if (!Number.isInteger(definition[field]) || definition[field] <= 0) {
        diagnostics.push({
          code: "dimension.non-positive",
          severity: "error",
          path: `${path}/${field}`,
          message: "Furniture Definition dimensions must be positive integer millimetres."
        });
      }
    }
  });

  return diagnostics;
}

function acceptFurnitureLibrary(
  definitions: FurnitureDefinition[]
): FurnitureDefinition[] {
  const normalized = definitions.map(normalizeDefinition);
  const diagnostics = validateFurnitureLibrary(normalized);
  if (diagnostics.length) {
    throw new Error(diagnostics.map(({ message }) => message).join(" "));
  }
  return normalized;
}

export function createFurnitureDefinition(
  input: FurnitureDefinitionInput,
  options: CreateFurnitureDefinitionOptions = {}
): FurnitureDefinition {
  const idFactory: IdFactory = options.idFactory ?? defaultIdFactory;
  return acceptFurnitureLibrary([{
    id: idFactory("furniture_definition"),
    ...input,
    extensions: {}
  }])[0]!;
}

export function addFurnitureDefinition(
  definitions: FurnitureDefinition[],
  definition: FurnitureDefinition
): FurnitureDefinition[] {
  return acceptFurnitureLibrary([...definitions, definition]);
}

export function updateFurnitureDefinition(
  definitions: FurnitureDefinition[],
  id: string,
  update: FurnitureDefinitionUpdate
): FurnitureDefinition[] {
  if (!definitions.some((definition) => definition.id === id)) {
    throw new Error(`Furniture Definition "${id}" does not exist.`);
  }
  return acceptFurnitureLibrary(definitions.map((definition) =>
    definition.id === id ? { ...definition, ...update } : definition
  ));
}

export function deleteFurnitureDefinition(
  definitions: FurnitureDefinition[],
  id: string
): FurnitureDefinition[] {
  const next = definitions.filter((definition) => definition.id !== id);
  if (next.length === definitions.length) {
    throw new Error(`Furniture Definition "${id}" does not exist.`);
  }
  return acceptFurnitureLibrary(next);
}
