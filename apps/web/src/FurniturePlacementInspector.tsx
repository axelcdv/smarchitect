import {
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacement,
  type FurniturePlacementUpdate
} from "@smarchitect/core";
import { BufferedInput } from "./BufferedInput.js";

interface FurniturePlacementInspectorProps {
  definition: FurnitureDefinition;
  disabled: boolean;
  libraryDefinition?: FurnitureDefinition;
  placement: FurniturePlacement;
  onDelete(): void;
  onMakeUnique(): void;
  onUpdateDefinition(update: FurnitureDefinitionUpdate): void;
  onUpdatePlacement(update: FurniturePlacementUpdate): void;
}

export function FurniturePlacementInspector({
  definition,
  disabled,
  libraryDefinition,
  placement,
  onDelete,
  onMakeUnique,
  onUpdateDefinition,
  onUpdatePlacement
}: FurniturePlacementInspectorProps) {
  return (
    <div className="furniture-properties" aria-label="Selected Furniture Placement properties">
      <h3>{definition.name}</h3>
      {([
        ["x", "Furniture X (mm)", placement.position.x],
        ["y", "Furniture Y (mm)", placement.position.y],
        ["rotationDeg", "Furniture rotation (deg)", placement.rotationDeg],
        ["elevationMm", "Furniture elevation (mm)", placement.elevationMm]
      ] as const).map(([field, label, value]) => (
        <label key={field}>
          <span>{label}</span>
          <BufferedInput
            aria-label={label}
            disabled={disabled}
            type="number"
            step={field === "rotationDeg" ? "any" : "1"}
            value={value}
            onCommit={(value) => {
              const numeric = Number(value);
              if (!Number.isFinite(numeric)) return;
              onUpdatePlacement(field === "x"
                ? { position: { ...placement.position, x: Math.round(numeric) } }
                : field === "y"
                  ? { position: { ...placement.position, y: Math.round(numeric) } }
                  : { [field]: field === "rotationDeg" ? numeric : Math.round(numeric) });
            }}
          />
        </label>
      ))}
      {([
        ["widthMm", "Furniture width (mm)"],
        ["depthMm", "Furniture depth (mm)"],
        ["heightMm", "Furniture height (mm)"]
      ] as const).map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <BufferedInput
            aria-label={label}
            disabled={disabled}
            type="number"
            min="1"
            step="1"
            value={definition[field]}
            onCommit={(value) => onUpdateDefinition({
              [field]: Math.round(Number(value))
            })}
          />
        </label>
      ))}
      {libraryDefinition ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onUpdateDefinition({
            name: libraryDefinition.name,
            widthMm: libraryDefinition.widthMm,
            depthMm: libraryDefinition.depthMm,
            heightMm: libraryDefinition.heightMm
          })}
        >
          Update from Item Library
        </button>
      ) : null}
      <button type="button" disabled={disabled} onClick={onMakeUnique}>
        Make unique
      </button>
      <button
        type="button"
        className="danger-button"
        disabled={disabled}
        onClick={onDelete}
      >
        Delete Furniture Placement
      </button>
    </div>
  );
}
