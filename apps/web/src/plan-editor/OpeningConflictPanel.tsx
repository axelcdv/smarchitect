import type {
  Opening,
  WallUpdate
} from "@smarchitect/core";

export interface OpeningConflict {
  wallId: string;
  update: WallUpdate;
  openingIds: string[];
}

export interface OpeningConflictPanelProps {
  conflict?: OpeningConflict;
  disabled: boolean;
  openings: readonly Opening[];
  onCancel(): void;
  onResolve(resolution: "fit" | "delete"): void;
}

export function OpeningConflictPanel({
  conflict,
  disabled,
  openings,
  onCancel,
  onResolve
}: OpeningConflictPanelProps) {
  if (!conflict) return null;

  const affected = openings
    .filter(({ id }) => conflict.openingIds.includes(id))
    .map(({ kind, id }) => `${kind} ${id}`)
    .join(", ");

  return (
    <div
      className="opening-conflict"
      role="alert"
      aria-label="Opening conflict resolution"
    >
      <strong>Wall edit conflicts with hosted Openings</strong>
      <p>Affected: {affected}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onResolve("fit")}
      >
        Fit openings and apply
      </button>
      <button
        type="button"
        className="danger-button"
        disabled={disabled}
        onClick={() => onResolve("delete")}
      >
        Delete conflicting openings and apply
      </button>
      <button type="button" disabled={disabled} onClick={onCancel}>
        Cancel wall edit
      </button>
    </div>
  );
}
