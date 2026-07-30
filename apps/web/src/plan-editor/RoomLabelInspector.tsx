import type {
  Diagnostic,
  RoomLabel
} from "@smarchitect/core";
import { BufferedInput } from "../BufferedInput.js";

export type RoomLabelEditField = "name" | "x" | "y";

export interface RoomLabelInspectorProps {
  diagnostics: readonly Diagnostic[];
  disabled: boolean;
  resetKey: string;
  roomLabel?: RoomLabel;
  onDelete(): void;
  onEdit(field: RoomLabelEditField, value: string): void;
}

export function RoomLabelInspector({
  diagnostics,
  disabled,
  resetKey,
  roomLabel,
  onDelete,
  onEdit
}: RoomLabelInspectorProps) {
  return (
    <>
      {roomLabel ? (
        <div
          className="room-label-properties"
          aria-label="Selected Room Label properties"
        >
          <label>
            <span>Room Label name</span>
            <BufferedInput
              disabled={disabled}
              resetKey={resetKey}
              aria-label="Room Label name"
              value={roomLabel.name}
              onCommit={(value) => onEdit("name", value)}
            />
          </label>
          {([
            ["x", "Room Label X (mm)", roomLabel.position.x],
            ["y", "Room Label Y (mm)", roomLabel.position.y]
          ] satisfies [RoomLabelEditField, string, number][]).map(
            ([field, label, value]) => (
              <label key={field}>
                <span>{label}</span>
                <BufferedInput
                  aria-label={label}
                  disabled={disabled}
                  resetKey={resetKey}
                  type="number"
                  value={value}
                  onCommit={(value) => onEdit(field, value)}
                />
              </label>
            )
          )}
          <button
            type="button"
            className="danger-button"
            disabled={disabled}
            onClick={onDelete}
          >
            Delete room label
          </button>
        </div>
      ) : null}
      {diagnostics
        .filter(({ code }) => code.startsWith("room-label."))
        .map(({ code, message }, index) => (
          <p className="room-diagnostic" role="alert" key={`${code}:${index}`}>
            {message}
          </p>
        ))}
    </>
  );
}
