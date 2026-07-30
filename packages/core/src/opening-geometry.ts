import type {
  Opening,
  OpeningPlanGeometry,
  PointMm,
  Wall
} from "./types.js";

export function wallPathLength(wall: Wall): number {
  return Math.hypot(
    wall.path.end.x - wall.path.start.x,
    wall.path.end.y - wall.path.start.y
  );
}

export function pointAlongWallPath(wall: Wall, distanceMm: number): PointMm {
  const length = wallPathLength(wall);
  return {
    x: wall.path.start.x
      + (wall.path.end.x - wall.path.start.x) * distanceMm / length,
    y: wall.path.start.y
      + (wall.path.end.y - wall.path.start.y) * distanceMm / length
  };
}

export function distanceAlongWallPath(wall: Wall, point: PointMm): number {
  const length = wallPathLength(wall);
  return (
    (point.x - wall.path.start.x) * (wall.path.end.x - wall.path.start.x)
    + (point.y - wall.path.start.y) * (wall.path.end.y - wall.path.start.y)
  ) / length;
}

function translated(point: PointMm, vector: PointMm, scale: number): PointMm {
  return {
    x: point.x + vector.x * scale,
    y: point.y + vector.y * scale
  };
}

export function deriveOpeningPlanGeometry(
  opening: Opening,
  wall: Wall
): OpeningPlanGeometry {
  const length = wallPathLength(wall);
  const unit = {
    x: (wall.path.end.x - wall.path.start.x) / length,
    y: (wall.path.end.y - wall.path.start.y) / length
  };
  const normal = { x: -unit.y, y: unit.x };
  const start = pointAlongWallPath(wall, opening.positionMm);
  const end = pointAlongWallPath(wall, opening.positionMm + opening.widthMm);
  const operationKind = opening.kind === "passage"
    ? "passage"
    : opening.operation.kind;
  const geometry: OpeningPlanGeometry = {
    start,
    end,
    operationKind,
    jambs: opening.kind === "passage"
      ? [start, end].map((point) => ({
          start: translated(point, normal, -90),
          end: translated(point, normal, 90)
        }))
      : [],
    panes: opening.kind === "window"
      ? [
          { start, end },
          {
            start: translated(start, normal, 45),
            end: translated(end, normal, 45)
          }
        ]
      : [],
    slidingPanels: opening.kind === "door"
        && opening.operation.kind === "sliding"
      ? [-45, 45].map((offset) => ({
          start: translated(start, normal, offset),
          end: translated(end, normal, offset)
        }))
      : []
  };
  if (opening.kind !== "passage" && opening.operation.kind === "hinged") {
    const hinge = opening.operation.hingeSide === "start" ? start : end;
    const swingScale = opening.operation.swingDirection === "outward" ? -1 : 1;
    geometry.hinge = hinge;
    geometry.leafEnd = translated(hinge, normal, opening.widthMm * swingScale);
    geometry.swingArcStart = opening.operation.hingeSide === "start" ? end : start;
    geometry.swingClockwise = swingScale > 0;
  }
  if (opening.kind !== "passage" && opening.operation.kind === "sliding") {
    const tip = opening.operation.slideDirection === "start" ? start : end;
    const tail = pointAlongWallPath(
      wall,
      opening.positionMm + opening.widthMm / 2
    );
    const back = opening.operation.slideDirection === "start"
      ? unit
      : { x: -unit.x, y: -unit.y };
    geometry.slideArrow = {
      tail,
      tip,
      firstWing: translated(translated(tip, back, 130), normal, 70),
      secondWing: translated(translated(tip, back, 130), normal, -70)
    };
  }
  return geometry;
}
