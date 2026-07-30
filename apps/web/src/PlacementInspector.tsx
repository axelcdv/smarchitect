import {
  type FixtureDefinition,
  type FixtureDefinitionUpdate,
  type FixturePlacement,
  type FixturePlacementUpdate,
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacement,
  type FurniturePlacementUpdate
} from "@smarchitect/core";

interface PlacementInspectorProps {
  definition: FurnitureDefinition | FixtureDefinition;
  disabled: boolean;
  kind?: "Furniture" | "Fixture";
  libraryDefinition?: FurnitureDefinition | FixtureDefinition;
  placement: FurniturePlacement | FixturePlacement;
  onDelete(): void;
  onMakeUnique(): void;
  onUpdateDefinition(
    update: FurnitureDefinitionUpdate | FixtureDefinitionUpdate
  ): void;
  onUpdatePlacement(
    update: FurniturePlacementUpdate | FixturePlacementUpdate
  ): void;
}

export function PlacementInspector({
  definition,
  disabled,
  kind = "Furniture",
  libraryDefinition,
  placement,
  onDelete,
  onMakeUnique,
  onUpdateDefinition,
  onUpdatePlacement
}: PlacementInspectorProps) {
  return (
    <div className="furniture-properties" aria-label={`Selected ${kind} Placement properties`}>
      <h3>{definition.name}</h3>
      <label>
        <span>{kind} name</span>
        <input
          aria-label={`${kind} name`}
          disabled={disabled}
          value={definition.name}
          onChange={(event) => onUpdateDefinition({
            name: event.target.value
          })}
        />
      </label>
      {([
        ["x", `${kind} X (mm)`, placement.position.x],
        ["y", `${kind} Y (mm)`, placement.position.y],
        ["rotationDeg", `${kind} rotation (deg)`, placement.rotationDeg],
        ["elevationMm", `${kind} elevation (mm)`, placement.elevationMm]
      ] as const).map(([field, label, value]) => (
        <label key={field}>
          <span>{label}</span>
          <input
            aria-label={label}
            disabled={disabled}
            type="number"
            step={field === "rotationDeg" ? "any" : "1"}
            value={value}
            onChange={(event) => {
              const numeric = Number(event.target.value);
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
        ["widthMm", `${kind} width (mm)`],
        ["depthMm", `${kind} depth (mm)`],
        ["heightMm", `${kind} height (mm)`]
      ] as const).map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <input
            aria-label={label}
            disabled={disabled}
            type="number"
            min="1"
            step="1"
            value={definition[field]}
            onChange={(event) => onUpdateDefinition({
              [field]: Math.round(Number(event.target.value))
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
        Delete {kind} Placement
      </button>
    </div>
  );
}
