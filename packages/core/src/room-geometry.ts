import type { PointMm, Room, RoomLabel, Wall } from "./types.js";

const EPSILON = 1e-7;

interface Segment {
  start: PointMm;
  end: PointMm;
  wall: Wall;
}

interface HalfEdge extends Segment {
  key: string;
  twinKey: string;
}

function subtract(a: PointMm, b: PointMm): PointMm {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: PointMm, b: PointMm): number {
  return a.x * b.y - a.y * b.x;
}

function pointKey(point: PointMm): string {
  return `${point.x.toFixed(7)},${point.y.toFixed(7)}`;
}

function directedKey(start: PointMm, end: PointMm): string {
  return `${pointKey(start)}>${pointKey(end)}`;
}

function polygonArea(points: PointMm[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function intersectionParameters(first: Wall, second: Wall): [number, number] | undefined {
  const firstDirection = subtract(first.path.end, first.path.start);
  const secondDirection = subtract(second.path.end, second.path.start);
  const denominator = cross(firstDirection, secondDirection);
  if (Math.abs(denominator) < EPSILON) return undefined;
  const delta = subtract(second.path.start, first.path.start);
  const firstParameter = cross(delta, secondDirection) / denominator;
  const secondParameter = cross(delta, firstDirection) / denominator;
  if (
    firstParameter < -EPSILON || firstParameter > 1 + EPSILON
    || secondParameter < -EPSILON || secondParameter > 1 + EPSILON
  ) {
    return undefined;
  }
  return [
    Math.max(0, Math.min(1, firstParameter)),
    Math.max(0, Math.min(1, secondParameter))
  ];
}

function parameterOnWall(point: PointMm, wall: Wall): number | undefined {
  const direction = subtract(wall.path.end, wall.path.start);
  const lengthSquared = direction.x ** 2 + direction.y ** 2;
  const fromStart = subtract(point, wall.path.start);
  if (Math.abs(cross(fromStart, direction)) > EPSILON) return undefined;
  const parameter = (fromStart.x * direction.x + fromStart.y * direction.y) / lengthSquared;
  return parameter >= -EPSILON && parameter <= 1 + EPSILON
    ? Math.max(0, Math.min(1, parameter))
    : undefined;
}

function splitWalls(walls: Wall[]): Segment[] {
  const parameters = walls.map(() => new Set([0, 1]));
  for (let left = 0; left < walls.length; left += 1) {
    for (let right = left + 1; right < walls.length; right += 1) {
      const first = walls[left]!;
      const second = walls[right]!;
      const crossing = intersectionParameters(first, second);
      if (crossing) {
        parameters[left]!.add(crossing[0]);
        parameters[right]!.add(crossing[1]);
        continue;
      }
      for (const point of [first.path.start, first.path.end]) {
        const parameter = parameterOnWall(point, second);
        if (parameter !== undefined) parameters[right]!.add(parameter);
      }
      for (const point of [second.path.start, second.path.end]) {
        const parameter = parameterOnWall(point, first);
        if (parameter !== undefined) parameters[left]!.add(parameter);
      }
    }
  }

  const unique = new Map<string, Segment>();
  for (const [index, wall] of walls.entries()) {
    const direction = subtract(wall.path.end, wall.path.start);
    const sorted = [...parameters[index]!].sort((a, b) => a - b);
    for (let parameterIndex = 0; parameterIndex < sorted.length - 1; parameterIndex += 1) {
      const startParameter = sorted[parameterIndex]!;
      const endParameter = sorted[parameterIndex + 1]!;
      if (endParameter - startParameter < EPSILON) continue;
      const start = {
        x: wall.path.start.x + direction.x * startParameter,
        y: wall.path.start.y + direction.y * startParameter
      };
      const end = {
        x: wall.path.start.x + direction.x * endParameter,
        y: wall.path.start.y + direction.y * endParameter
      };
      const undirectedKey = [pointKey(start), pointKey(end)].sort().join("|");
      if (!unique.has(undirectedKey)) unique.set(undirectedKey, { start, end, wall });
    }
  }
  return [...unique.values()];
}

function interiorBoundary(cycle: HalfEdge[]): PointMm[] | undefined {
  const offsetLines = cycle.map((edge) => {
    const direction = subtract(edge.end, edge.start);
    const length = Math.hypot(direction.x, direction.y);
    const offset = edge.wall.thicknessMm / 2;
    const normal = { x: -direction.y / length, y: direction.x / length };
    return {
      point: {
        x: edge.start.x + normal.x * offset,
        y: edge.start.y + normal.y * offset
      },
      direction
    };
  });

  const boundary = offsetLines.map((current, index) => {
    const previous = offsetLines[(index + offsetLines.length - 1) % offsetLines.length]!;
    const denominator = cross(previous.direction, current.direction);
    if (Math.abs(denominator) < EPSILON) return current.point;
    const parameter = cross(
      subtract(current.point, previous.point),
      current.direction
    ) / denominator;
    return {
      x: previous.point.x + previous.direction.x * parameter,
      y: previous.point.y + previous.direction.y * parameter
    };
  });
  return polygonArea(boundary) > EPSILON ? boundary : undefined;
}

function stableRoomId(cycle: HalfEdge[]): string {
  const signature = cycle
    .map(({ start, end, wall }) => `${wall.id}:${pointKey(start)}>${pointKey(end)}`)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (const character of signature) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `room_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function pointInRoom(point: PointMm, room: Room): boolean {
  let inside = false;
  for (let index = 0, previous = room.boundary.length - 1;
    index < room.boundary.length;
    previous = index, index += 1) {
    const currentPoint = room.boundary[index]!;
    const previousPoint = room.boundary[previous]!;
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x)
        * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y)
        + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function findRoomContainingPoint(
  point: PointMm,
  rooms: Room[]
): Room | undefined {
  return rooms.find((room) => pointInRoom(point, room));
}

export function deriveRooms(walls: Wall[], labels: RoomLabel[] = []): Room[] {
  const halfEdges = splitWalls(walls).flatMap((segment): HalfEdge[] => {
    const forwardKey = directedKey(segment.start, segment.end);
    const reverseKey = directedKey(segment.end, segment.start);
    return [
      { ...segment, key: forwardKey, twinKey: reverseKey },
      {
        start: segment.end,
        end: segment.start,
        wall: segment.wall,
        key: reverseKey,
        twinKey: forwardKey
      }
    ];
  });
  const outgoing = new Map<string, HalfEdge[]>();
  for (const edge of halfEdges) {
    const edges = outgoing.get(pointKey(edge.start)) ?? [];
    edges.push(edge);
    outgoing.set(pointKey(edge.start), edges);
  }
  for (const edges of outgoing.values()) {
    edges.sort((left, right) =>
      Math.atan2(left.end.y - left.start.y, left.end.x - left.start.x)
      - Math.atan2(right.end.y - right.start.y, right.end.x - right.start.x)
    );
  }

  const visited = new Set<string>();
  const rooms: Room[] = [];
  for (const initial of halfEdges.sort((a, b) => a.key.localeCompare(b.key))) {
    if (visited.has(initial.key)) continue;
    const cycle: HalfEdge[] = [];
    let current: HalfEdge | undefined = initial;
    while (current && !visited.has(current.key)) {
      visited.add(current.key);
      cycle.push(current);
      const candidates: HalfEdge[] = outgoing.get(pointKey(current.end)) ?? [];
      const twinKey = current.twinKey;
      const twinIndex: number = candidates.findIndex(({ key }) => key === twinKey);
      current = twinIndex < 0
        ? undefined
        : candidates[(twinIndex + candidates.length - 1) % candidates.length];
    }
    if (current?.key !== initial.key || cycle.length < 3) continue;
    const centerline = cycle.map(({ start }) => start);
    if (polygonArea(centerline) <= EPSILON) continue;
    const boundary = interiorBoundary(cycle);
    if (!boundary) continue;
    const minX = Math.min(...boundary.map(({ x }) => x));
    const maxX = Math.max(...boundary.map(({ x }) => x));
    const minY = Math.min(...boundary.map(({ y }) => y));
    const maxY = Math.max(...boundary.map(({ y }) => y));
    const room: Room = {
      id: stableRoomId(cycle),
      boundary,
      areaMm2: Math.round(polygonArea(boundary)),
      dimensionsMm: {
        width: Math.round(maxX - minX),
        depth: Math.round(maxY - minY)
      },
      wallIds: [...new Set(cycle.map(({ wall }) => wall.id))].sort(),
      labelIds: []
    };
    room.labelIds = labels
      .filter(({ position }) => pointInRoom(position, room))
      .map(({ id }) => id)
      .sort();
    rooms.push(room);
  }
  return rooms.sort((left, right) => {
    const leftMinX = Math.min(...left.boundary.map(({ x }) => x));
    const rightMinX = Math.min(...right.boundary.map(({ x }) => x));
    const leftMinY = Math.min(...left.boundary.map(({ y }) => y));
    const rightMinY = Math.min(...right.boundary.map(({ y }) => y));
    return leftMinX - rightMinX || leftMinY - rightMinY || left.id.localeCompare(right.id);
  });
}
