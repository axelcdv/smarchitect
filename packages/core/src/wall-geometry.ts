import type { PointMm, Wall, WallJunction } from "./types.js";

const EPSILON = 1e-9;

function distance(a: PointMm, b: PointMm): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(a: PointMm, b: PointMm): number {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: PointMm, b: PointMm): PointMm {
  return { x: a.x - b.x, y: a.y - b.y };
}

function normalizedPoint(point: PointMm): PointMm {
  return {
    x: Math.abs(point.x - Math.round(point.x)) < EPSILON ? Math.round(point.x) : point.x,
    y: Math.abs(point.y - Math.round(point.y)) < EPSILON ? Math.round(point.y) : point.y
  };
}

function pointOnSegment(point: PointMm, wall: Wall): boolean {
  const fromStart = subtract(point, wall.path.start);
  const direction = subtract(wall.path.end, wall.path.start);
  return Math.abs(cross(fromStart, direction)) < EPSILON
    && point.x >= Math.min(wall.path.start.x, wall.path.end.x)
    && point.x <= Math.max(wall.path.start.x, wall.path.end.x)
    && point.y >= Math.min(wall.path.start.y, wall.path.end.y)
    && point.y <= Math.max(wall.path.start.y, wall.path.end.y);
}

function segmentIntersections(first: Wall, second: Wall): PointMm[] {
  const firstOrigin = first.path.start;
  const secondOrigin = second.path.start;
  const firstDirection = subtract(first.path.end, firstOrigin);
  const secondDirection = subtract(second.path.end, secondOrigin);
  const denominator = cross(firstDirection, secondDirection);
  const originsDelta = subtract(secondOrigin, firstOrigin);

  if (Math.abs(denominator) < EPSILON) {
    if (Math.abs(cross(originsDelta, firstDirection)) >= EPSILON) return [];
    const contacts = [
      ...[first.path.start, first.path.end].filter((point) => pointOnSegment(point, second)),
      ...[second.path.start, second.path.end].filter((point) => pointOnSegment(point, first))
    ];
    return [...new Map(contacts.map((point) => [
      `${point.x},${point.y}`,
      { ...point }
    ])).values()];
  }

  const firstParameter = cross(originsDelta, secondDirection) / denominator;
  const secondParameter = cross(originsDelta, firstDirection) / denominator;

  if (
    firstParameter < -EPSILON || firstParameter > 1 + EPSILON
    || secondParameter < -EPSILON || secondParameter > 1 + EPSILON
  ) {
    return [];
  }

  return [normalizedPoint({
    x: firstOrigin.x + firstParameter * firstDirection.x,
    y: firstOrigin.y + firstParameter * firstDirection.y
  })];
}

export function deriveWallFaces(wall: Wall): PointMm[] {
  const { start, end } = wall.path;
  const length = distance(start, end);

  if (!length) {
    return [];
  }

  const offsetX = (-(end.y - start.y) / length) * wall.thicknessMm / 2;
  const offsetY = ((end.x - start.x) / length) * wall.thicknessMm / 2;

  return [
    normalizedPoint({ x: start.x + offsetX, y: start.y + offsetY }),
    normalizedPoint({ x: end.x + offsetX, y: end.y + offsetY }),
    normalizedPoint({ x: end.x - offsetX, y: end.y - offsetY }),
    normalizedPoint({ x: start.x - offsetX, y: start.y - offsetY })
  ];
}

export function deriveWallJunctions(walls: Wall[]): WallJunction[] {
  const junctions = new Map<string, WallJunction>();

  for (let left = 0; left < walls.length; left += 1) {
    for (let right = left + 1; right < walls.length; right += 1) {
      const first = walls[left]!;
      const second = walls[right]!;
      for (const point of segmentIntersections(first, second)) {
        const key = `${point.x},${point.y}`;
        const junction = junctions.get(key) ?? { point, wallIds: [] };
        junction.wallIds = [...new Set([...junction.wallIds, first.id, second.id])].sort();
        junctions.set(key, junction);
      }
    }
  }

  return [...junctions.values()].sort(
    (a, b) => a.point.x - b.point.x || a.point.y - b.point.y
  );
}

export function snapPoint(
  point: PointMm,
  walls: Wall[],
  toleranceMm: number
): PointMm {
  const candidates = [
    ...walls.flatMap(({ path }) => [path.start, path.end]),
    ...deriveWallJunctions(walls).map(({ point: junction }) => junction)
  ];
  const nearest = candidates
    .map((candidate) => ({ candidate, distance: distance(point, candidate) }))
    .filter(({ distance: candidateDistance }) => candidateDistance <= toleranceMm)
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest ? { ...nearest.candidate } : { ...point };
}

export function snapAngle(
  start: PointMm,
  end: PointMm,
  incrementDeg = 15
): PointMm {
  const length = distance(start, end);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const increment = incrementDeg * Math.PI / 180;
  const snappedAngle = Math.round(angle / increment) * increment;

  return {
    x: Math.round(start.x + Math.cos(snappedAngle) * length),
    y: Math.round(start.y + Math.sin(snappedAngle) * length)
  };
}
