import {
  type CreateFixtureDefinitionOptions,
  type Diagnostic,
  type FixtureDefinition,
  type FixtureDefinitionInput,
  type FixtureDefinitionUpdate,
  type IdFactory
} from "./types.js";
import { defaultIdFactory } from "./id-factory.js";

const FIXTURE_DEFINITION_ID =
  /^fixture_definition_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function normalizeDefinition(definition: FixtureDefinition): FixtureDefinition {
  return {
    ...structuredClone(definition),
    name: definition.name.trim(),
    widthMm: Math.round(definition.widthMm),
    depthMm: Math.round(definition.depthMm),
    heightMm: Math.round(definition.heightMm)
  };
}

export function validateFixtureLibrary(
  definitions: FixtureDefinition[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();

  definitions.forEach((definition, index) => {
    const path = `/fixtureDefinitions/${index}`;
    if (!FIXTURE_DEFINITION_ID.test(definition.id)) {
      diagnostics.push({
        code: "stable-id.invalid",
        severity: "error",
        path: `${path}/id`,
        message: `Fixture Definition ID "${definition.id}" is invalid.`
      });
    } else if (ids.has(definition.id)) {
      diagnostics.push({
        code: "fixture-definition.id.duplicate",
        severity: "error",
        path: `${path}/id`,
        message: `Fixture Definition ID "${definition.id}" must be unique within the Item Library.`
      });
    }
    ids.add(definition.id);

    if (!definition.name.trim() || definition.name.trim().length > 120) {
      diagnostics.push({
        code: "fixture-definition.name.invalid",
        severity: "error",
        path: `${path}/name`,
        message: "Fixture Definition name must contain 1 to 120 characters."
      });
    }
    for (const field of ["widthMm", "depthMm", "heightMm"] as const) {
      if (!Number.isInteger(definition[field]) || definition[field] <= 0) {
        diagnostics.push({
          code: "dimension.non-positive",
          severity: "error",
          path: `${path}/${field}`,
          message: "Fixture Definition dimensions must be positive integer millimetres."
        });
      }
    }
  });

  return diagnostics;
}

function acceptFixtureLibrary(
  definitions: FixtureDefinition[]
): FixtureDefinition[] {
  const normalized = definitions.map(normalizeDefinition);
  const diagnostics = validateFixtureLibrary(normalized);
  if (diagnostics.length) {
    throw new Error(diagnostics.map(({ message }) => message).join(" "));
  }
  return normalized;
}

export function createFixtureDefinition(
  input: FixtureDefinitionInput,
  options: CreateFixtureDefinitionOptions = {}
): FixtureDefinition {
  const idFactory: IdFactory = options.idFactory ?? defaultIdFactory;
  return acceptFixtureLibrary([{
    id: idFactory("fixture_definition"),
    ...input,
    extensions: {}
  }])[0]!;
}

export function addFixtureDefinition(
  definitions: FixtureDefinition[],
  definition: FixtureDefinition
): FixtureDefinition[] {
  return acceptFixtureLibrary([...definitions, definition]);
}

export function updateFixtureDefinition(
  definitions: FixtureDefinition[],
  id: string,
  update: FixtureDefinitionUpdate
): FixtureDefinition[] {
  if (!definitions.some((definition) => definition.id === id)) {
    throw new Error(`Fixture Definition "${id}" does not exist.`);
  }
  return acceptFixtureLibrary(definitions.map((definition) =>
    definition.id === id ? { ...definition, ...update } : definition
  ));
}

export function deleteFixtureDefinition(
  definitions: FixtureDefinition[],
  id: string
): FixtureDefinition[] {
  const next = definitions.filter((definition) => definition.id !== id);
  if (next.length === definitions.length) {
    throw new Error(`Fixture Definition "${id}" does not exist.`);
  }
  return acceptFixtureLibrary(next);
}
