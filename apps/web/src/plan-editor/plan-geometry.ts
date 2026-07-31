import {
  deriveWallFaces,
  type PointMm,
  type Wall
} from "@smarchitect/core";

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
