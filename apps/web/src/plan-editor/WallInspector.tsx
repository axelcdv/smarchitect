import {
  wallAngleDeg,
  type Wall
} from "@smarchitect/core";
import { BufferedInput } from "../BufferedInput.js";

export type WallEditField =
  | "startX"
  | "startY"
  | "endX"
  | "endY"
  | "lengthMm"
  | "angleDeg"
  | "thicknessMm"
  | "heightMm";

export interface WallInspectorProps {
  disabled: boolean;
  resetKey: string;
  wall: Wall;
  onDelete(): void;
  onEdit(field: WallEditField, value: string): void;
}

export function WallInspector({
  disabled,
  resetKey,
  wall,
  onDelete,
  onEdit
}: WallInspectorProps) {
  const fields = [
    ["startX", "Start X (mm)", wall.path.start.x],
    ["startY", "Start Y (mm)", wall.path.start.y],
    ["endX", "End X (mm)", wall.path.end.x],
    ["endY", "End Y (mm)", wall.path.end.y],
    [
      "lengthMm",
      "Wall length (mm)",
      Math.round(Math.hypot(
        wall.path.end.x - wall.path.start.x,
        wall.path.end.y - wall.path.start.y
      ))
    ],
    ["angleDeg", "Wall angle (deg)", Number(wallAngleDeg(wall).toFixed(2))],
    ["thicknessMm", "Wall thickness (mm)", wall.thicknessMm],
    ["heightMm", "Wall height (mm)", wall.heightMm]
  ] satisfies [WallEditField, string, number][];

  return (
    <div className="wall-properties" aria-label="Selected wall properties">
      {fields.map(([field, label, value]) => (
        <label key={field}>
          <span>{label}</span>
          <BufferedInput
            aria-label={label}
            disabled={disabled}
            resetKey={resetKey}
            type="number"
            step={field === "angleDeg" ? "any" : 1}
            value={value}
            onCommit={(value) => onEdit(field, value)}
          />
        </label>
      ))}
      <button
        type="button"
        className="danger-button"
        disabled={disabled}
        onClick={onDelete}
      >
        Delete wall
      </button>
    </div>
  );
}
