import {
  deriveWallDragDelta,
  deriveWallFaces,
  type PointMm,
  type ProjectWorkspace,
  type Wall
} from "@smarchitect/core";

export function moveWallForDrag(
  workspace: ProjectWorkspace,
  wallId: string,
  start: PointMm,
  current: PointMm,
  snapToleranceMm: number
): ProjectWorkspace {
  const wall = workspace.activeLevel.walls.find(({ id }) => id === wallId);
  if (!wall) return workspace;
  const delta = deriveWallDragDelta(
    wall,
    start,
    current,
    workspace.activeLevel.walls.filter(({ id }) => id !== wall.id),
    snapToleranceMm
  );
  return delta.x || delta.y ? workspace.moveWall(wall.id, delta) : workspace;
}

export function planPolygonPoints(points: readonly PointMm[]): string {
  return points.map(({ x, y }) => `${x},${-y}`).join(" ");
}

export function wallPolygonPoints(wall: Wall): string {
  return planPolygonPoints(deriveWallFaces(wall));
}

export function wallSurfacePath(walls: readonly Wall[]): string {
  return walls.map((wall) => {
    const [first, ...rest] = deriveWallFaces(wall);
    return first
      ? `M ${first.x} ${-first.y} ${rest
          .map(({ x, y }) => `L ${x} ${-y}`)
          .join(" ")} Z`
      : "";
  }).join(" ");
}
