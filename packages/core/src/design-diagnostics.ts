import { furnitureFootprintCorners } from "./furniture-geometry.js";
import { deriveRooms, findRoomContainingPoint } from "./room-geometry.js";
import { deriveWallFaces } from "./wall-geometry.js";
import type {
  Diagnostic,
  FixtureDefinition,
  FixturePlacement,
  FurnitureDefinition,
  FurniturePlacement,
  Level,
  PointMm
} from "./types.js";

interface DesignDiagnosticOptions {
  pathPrefix: string;
  levelIndex: number;
}

interface PlacedItem {
  definition: FurnitureDefinition | FixtureDefinition;
  placement: FurniturePlacement | FixturePlacement;
  kind: "furniture" | "fixture";
  path: string;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface PlacementGeometry extends PlacedItem {
  bounds: Bounds;
  footprint: PointMm[];
}

interface WallGeometry {
  bounds: Bounds;
  footprint: PointMm[];
  index: number;
}

function polygonBounds(polygon: readonly PointMm[]): Bounds {
  const xs = polygon.map(({ x }) => x);
  const ys = polygon.map(({ y }) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function boundsOverlap(first: Bounds, second: Bounds): boolean {
  return first.maxX > second.minX
    && second.maxX > first.minX
    && first.maxY > second.minY
    && second.maxY > first.minY;
}

function byMinimumX<T extends { bounds: Bounds }>(first: T, second: T): number {
  return first.bounds.minX - second.bounds.minX;
}

function projection(polygon: readonly PointMm[], axis: PointMm): [number, number] {
  const values = polygon.map(({ x, y }) => x * axis.x + y * axis.y);
  return [Math.min(...values), Math.max(...values)];
}

function polygonsOverlap(
  first: readonly PointMm[],
  second: readonly PointMm[]
): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index]!;
      const end = polygon[(index + 1) % polygon.length]!;
      const axis = { x: -(end.y - start.y), y: end.x - start.x };
      const [firstMin, firstMax] = projection(first, axis);
      const [secondMin, secondMax] = projection(second, axis);
      if (firstMax <= secondMin || secondMax <= firstMin) return false;
    }
  }
  return true;
}

function verticalRangesOverlap(item: PlacedItem, topMm: number): boolean {
  return item.placement.elevationMm < topMm
    && item.placement.elevationMm + item.definition.heightMm > 0;
}

function allPlacedItems(
  level: Level,
  furnitureDefinitions: readonly FurnitureDefinition[],
  fixtureDefinitions: readonly FixtureDefinition[]
): PlacedItem[] {
  const furnitureById = new Map(furnitureDefinitions.map((value) => [value.id, value]));
  const fixturesById = new Map(fixtureDefinitions.map((value) => [value.id, value]));
  return [
    ...(level.furniturePlacements ?? []).flatMap((placement, index) => {
      const definition = furnitureById.get(placement.definitionId);
      return definition ? [{ definition, placement, kind: "furniture" as const,
        path: `furniturePlacements/${index}` }] : [];
    }),
    ...(level.fixturePlacements ?? []).flatMap((placement, index) => {
      const definition = fixturesById.get(placement.definitionId);
      return definition ? [{ definition, placement, kind: "fixture" as const,
        path: `fixturePlacements/${index}` }] : [];
    })
  ];
}

function placementGeometries(items: readonly PlacedItem[]): PlacementGeometry[] {
  return items.map((item) => {
    const footprint = furnitureFootprintCorners(item.definition, item.placement);
    return { ...item, footprint, bounds: polygonBounds(footprint) };
  });
}

function wallGeometries(level: Level): WallGeometry[] {
  return level.walls.map((wall, index) => {
    const footprint = deriveWallFaces(wall);
    return { index, footprint, bounds: polygonBounds(footprint) };
  }).sort(byMinimumX);
}

function doorClearanceFootprint(level: Level, openingIndex: number): PointMm[] {
  const door = level.openings[openingIndex]!;
  const wall = level.walls.find(({ id }) => id === door.hostWallId)!;
  const dx = wall.path.end.x - wall.path.start.x;
  const dy = wall.path.end.y - wall.path.start.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const start = {
    x: wall.path.start.x + unit.x * door.positionMm,
    y: wall.path.start.y + unit.y * door.positionMm
  };
  const end = {
    x: start.x + unit.x * door.widthMm,
    y: start.y + unit.y * door.widthMm
  };
  return [
    { x: start.x + normal.x * door.widthMm, y: start.y + normal.y * door.widthMm },
    { x: end.x + normal.x * door.widthMm, y: end.y + normal.y * door.widthMm },
    { x: end.x - normal.x * door.widthMm, y: end.y - normal.y * door.widthMm },
    { x: start.x - normal.x * door.widthMm, y: start.y - normal.y * door.widthMm }
  ];
}

function openWallComponents(level: Level): number[][] {
  const endpointKey = ({ x, y }: PointMm): string => `${x}:${y}`;
  const wallsAtEndpoint = new Map<string, number[]>();
  for (const [index, wall] of level.walls.entries()) {
    for (const point of [wall.path.start, wall.path.end]) {
      const key = endpointKey(point);
      wallsAtEndpoint.set(key, [...(wallsAtEndpoint.get(key) ?? []), index]);
    }
  }

  const visited = new Set<number>();
  const components: number[][] = [];
  for (const startIndex of level.walls.keys()) {
    if (visited.has(startIndex)) continue;
    const pending = [startIndex];
    const component: number[] = [];
    while (pending.length) {
      const index = pending.pop()!;
      if (visited.has(index)) continue;
      visited.add(index);
      component.push(index);
      const wall = level.walls[index]!;
      for (const point of [wall.path.start, wall.path.end]) {
        for (const neighbor of wallsAtEndpoint.get(endpointKey(point)) ?? []) {
          if (!visited.has(neighbor)) pending.push(neighbor);
        }
      }
    }
    const hasDanglingEndpoint = component.some((index) => {
      const wall = level.walls[index]!;
      return [wall.path.start, wall.path.end].some((point) =>
        wallsAtEndpoint.get(endpointKey(point))?.length === 1
      );
    });
    if (component.length >= 3 && hasDanglingEndpoint) {
      components.push(component.sort((first, second) => first - second));
    }
  }
  return components;
}

export function designDiagnostics(
  level: Level,
  furnitureDefinitions: readonly FurnitureDefinition[],
  fixtureDefinitions: readonly FixtureDefinition[],
  { pathPrefix, levelIndex }: DesignDiagnosticOptions
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const levelPath = `${pathPrefix}/levels/${levelIndex}`;
  const items = placementGeometries(
    allPlacedItems(level, furnitureDefinitions, fixtureDefinitions)
  );
  const sortedItems = [...items].sort(byMinimumX);
  const walls = wallGeometries(level);
  const rooms = deriveRooms(level.walls, level.roomLabels);

  for (const [labelIndex, label] of level.roomLabels.entries()) {
    if (findRoomContainingPoint(label.position, rooms)) continue;
    diagnostics.push({
      code: "room-label.outside-room",
      severity: "warning",
      path: `${levelPath}/roomLabels/${labelIndex}/position`,
      message: `Room Label "${label.name}" is outside every enclosed Room. Move it inside a Room or delete it.`,
      affectedIds: [label.id],
      focus: { kind: "room-label", id: label.id }
    });
  }
  for (const room of rooms) {
    if (room.labelIds.length <= 1) continue;
    const names = level.roomLabels
      .filter(({ id }) => room.labelIds.includes(id))
      .map(({ name }) => `"${name}"`)
      .join(", ");
    diagnostics.push({
      code: "room-label.merge-conflict",
      severity: "warning",
      path: `${levelPath}/roomLabels`,
      message: `Merged Room contains multiple labels (${names}). Move or delete labels to choose one explicitly.`,
      affectedIds: [...room.labelIds],
      focus: { kind: "room-label", id: room.labelIds[0]! }
    });
  }

  for (const item of items) {
    for (const wallGeometry of walls) {
      if (wallGeometry.bounds.minX >= item.bounds.maxX) break;
      if (!boundsOverlap(item.bounds, wallGeometry.bounds)) continue;
      const wall = level.walls[wallGeometry.index]!;
      if (!verticalRangesOverlap(item, wall.heightMm)) continue;
      if (!polygonsOverlap(item.footprint, wallGeometry.footprint)) continue;
      diagnostics.push({
        code: "placement.wall-overlap",
        severity: "warning",
        path: `${levelPath}/${item.path}/position`,
        message: `${item.kind === "furniture" ? "Furniture" : "Fixture"} Placement "${item.placement.id}" overlaps Wall "${wall.id}". This is advisory and does not block editing or saving.`,
        affectedIds: [item.placement.id, wall.id],
        focus: { kind: item.kind, id: item.placement.id }
      });
    }
  }

  for (let firstIndex = 0; firstIndex < sortedItems.length; firstIndex += 1) {
    const first = sortedItems[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < sortedItems.length; secondIndex += 1) {
      const second = sortedItems[secondIndex]!;
      if (second.bounds.minX >= first.bounds.maxX) break;
      if (!boundsOverlap(first.bounds, second.bounds)) continue;
      const firstTop = first.placement.elevationMm + first.definition.heightMm;
      const secondTop = second.placement.elevationMm + second.definition.heightMm;
      if (firstTop <= second.placement.elevationMm || secondTop <= first.placement.elevationMm) continue;
      if (!polygonsOverlap(first.footprint, second.footprint)) continue;
      diagnostics.push({
        code: "placement.overlap",
        severity: "warning",
        path: `${levelPath}/${first.path}/position`,
        message: `Placements "${first.placement.id}" and "${second.placement.id}" overlap. This is advisory and does not block exploration.`,
        affectedIds: [first.placement.id, second.placement.id],
        focus: { kind: first.kind, id: first.placement.id }
      });
    }
  }

  for (const [openingIndex, opening] of level.openings.entries()) {
    if (opening.kind !== "door") continue;
    const clearance = doorClearanceFootprint(level, openingIndex);
    const clearanceBounds = polygonBounds(clearance);
    const blocking = items.filter((item) =>
      item.placement.elevationMm < opening.heightMm
      && boundsOverlap(clearanceBounds, item.bounds)
      && polygonsOverlap(clearance, item.footprint)
    );
    for (const item of blocking) {
      diagnostics.push({
        code: "door.obstructed",
        severity: "warning",
        path: `${levelPath}/openings/${openingIndex}`,
        message: `Door "${opening.id}" may be inaccessible or obstructed by Placement "${item.placement.id}". Review access and swing clearance.`,
        affectedIds: [opening.id, item.placement.id],
        focus: { kind: "opening", id: opening.id }
      });
    }
  }

  for (const component of openWallComponents(level)) {
    const affectedIds = component.map((index) => level.walls[index]!.id);
    diagnostics.push({
      code: "room.enclosure.open",
      severity: "warning",
      path: `${levelPath}/walls`,
      message: "These Walls do not currently form an enclosed Room. Continue editing or review the open enclosure.",
      affectedIds,
      focus: { kind: "wall", id: affectedIds[0]! }
    });
  }

  return diagnostics;
}
