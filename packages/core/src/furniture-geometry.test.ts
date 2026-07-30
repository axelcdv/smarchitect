import { describe, expect, it } from "vitest";
import {
  furnitureFootprintCorners,
  furniturePlacementContainsPoint,
  type FurnitureDefinition,
  type FurniturePlacement
} from "./index.js";

const definition: FurnitureDefinition = {
  id: "furniture_definition_00000000-0000-4000-8000-000000000005",
  name: "Table",
  widthMm: 2000,
  depthMm: 1000,
  heightMm: 750,
  extensions: {}
};
const placement: FurniturePlacement = {
  id: "furniture_placement_00000000-0000-4000-8000-000000000006",
  definitionId: definition.id,
  position: { x: 100, y: 200 },
  rotationDeg: 90,
  elevationMm: 0,
  extensions: {}
};

describe("Furniture footprint geometry", () => {
  it("derives a rotated rectangular footprint", () => {
    expect(furnitureFootprintCorners(definition, placement)).toEqual([
      { x: 600, y: -800 },
      { x: 600, y: 1200 },
      { x: -400, y: 1200 },
      { x: -400, y: -800 }
    ]);
  });

  it("hit-tests a rotated Furniture Placement", () => {
    expect(furniturePlacementContainsPoint(definition, placement, {
      x: 100,
      y: 1100
    })).toBe(true);
    expect(furniturePlacementContainsPoint(definition, placement, {
      x: 700,
      y: 200
    })).toBe(false);
  });
});
