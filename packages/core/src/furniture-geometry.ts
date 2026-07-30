import type {
  FurnitureDefinition,
  FurniturePlacement,
  PointMm
} from "./types.js";

export function furnitureFootprintCorners(
  definition: FurnitureDefinition,
  placement: FurniturePlacement
): PointMm[] {
  const radians = placement.rotationDeg * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const halfWidth = definition.widthMm / 2;
  const halfDepth = definition.depthMm / 2;

  function tidy(value: number): number {
    const rounded = Math.round(value);
    return Math.abs(value - rounded) < 1e-9 ? rounded : value;
  }

  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth }
  ].map(({ x, y }) => ({
    x: tidy(placement.position.x + x * cosine - y * sine),
    y: tidy(placement.position.y + x * sine + y * cosine)
  }));
}

export function furniturePlacementContainsPoint(
  definition: FurnitureDefinition,
  placement: FurniturePlacement,
  point: PointMm
): boolean {
  const radians = -placement.rotationDeg * Math.PI / 180;
  const dx = point.x - placement.position.x;
  const dy = point.y - placement.position.y;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);

  return Math.abs(localX) <= definition.widthMm / 2
    && Math.abs(localY) <= definition.depthMm / 2;
}
