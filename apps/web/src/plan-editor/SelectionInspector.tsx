import type {
  Diagnostic,
  FixtureDefinition,
  FixtureDefinitionUpdate,
  FixturePlacement,
  FixturePlacementUpdate,
  FurnitureDefinition,
  FurnitureDefinitionUpdate,
  FurniturePlacement,
  FurniturePlacementUpdate,
  Opening,
  OpeningUpdate,
  RoomLabel,
  Wall
} from "@smarchitect/core";
import { OpeningProperties } from "../OpeningEditor.js";
import { PlacementInspector } from "../PlacementInspector.js";
import {
  OpeningConflictPanel,
  type OpeningConflict
} from "./OpeningConflictPanel.js";
import {
  RoomLabelInspector,
  type RoomLabelEditField
} from "./RoomLabelInspector.js";
import type { EditorSelection } from "./use-editor-selection.js";
import {
  WallInspector,
  type WallEditField
} from "./WallInspector.js";

export interface WallInspectorModel {
  wall?: Wall;
  disabled: boolean;
  resetKey: string;
  onEdit(field: WallEditField, value: string): void;
  onDelete(): void;
}

export interface RoomLabelInspectorModel {
  roomLabel?: RoomLabel;
  diagnostics: readonly Diagnostic[];
  disabled: boolean;
  resetKey: string;
  onEdit(field: RoomLabelEditField, value: string): void;
  onDelete(): void;
}

export interface OpeningInspectorModel {
  opening?: Opening;
  conflict?: OpeningConflict;
  openings: readonly Opening[];
  disabled: boolean;
  onResolveConflict(resolution: "fit" | "delete"): void;
  onCancelConflict(): void;
  onEdit(update: OpeningUpdate): void;
  onDelete(): void;
}

interface PlacementInspectorModel<
  Placement,
  Definition,
  PlacementUpdate,
  DefinitionUpdate
> {
  placement?: Placement;
  definition?: Definition;
  libraryDefinition?: Definition;
  disabled: boolean;
  onUpdatePlacement(update: PlacementUpdate): void;
  onUpdateDefinition(update: DefinitionUpdate): void;
  onMakeUnique(): void;
  onDelete(): void;
}

export type FurnitureInspectorModel = PlacementInspectorModel<
  FurniturePlacement,
  FurnitureDefinition,
  FurniturePlacementUpdate,
  FurnitureDefinitionUpdate
>;

export type FixtureInspectorModel = PlacementInspectorModel<
  FixturePlacement,
  FixtureDefinition,
  FixturePlacementUpdate,
  FixtureDefinitionUpdate
>;

export interface SelectionInspectorProps {
  selection: EditorSelection;
  wall: WallInspectorModel;
  roomLabel: RoomLabelInspectorModel;
  opening: OpeningInspectorModel;
  furniture: FurnitureInspectorModel;
  fixture: FixtureInspectorModel;
}

export function SelectionInspector({
  selection,
  wall,
  roomLabel,
  opening,
  furniture,
  fixture,
}: SelectionInspectorProps) {
  const selectedWall = selection.kind === "wall"
    || selection.kind === "opening"
    ? wall.wall
    : undefined;
  const selectedRoomLabel = selection.kind === "roomLabel"
    ? roomLabel.roomLabel
    : undefined;

  return (
    <>
      {selectedWall ? (
        <WallInspector
          disabled={wall.disabled}
          resetKey={wall.resetKey}
          wall={selectedWall}
          onDelete={wall.onDelete}
          onEdit={wall.onEdit}
        />
      ) : null}
      <RoomLabelInspector
        diagnostics={roomLabel.diagnostics}
        disabled={roomLabel.disabled}
        resetKey={roomLabel.resetKey}
        roomLabel={selectedRoomLabel}
        onDelete={roomLabel.onDelete}
        onEdit={roomLabel.onEdit}
      />
      <OpeningConflictPanel
        conflict={opening.conflict}
        disabled={opening.disabled}
        openings={opening.openings}
        onCancel={opening.onCancelConflict}
        onResolve={opening.onResolveConflict}
      />
      {selection.kind === "opening" && opening.opening ? (
        <OpeningProperties
          opening={opening.opening}
          isSaving={opening.disabled}
          onEdit={opening.onEdit}
          onDelete={opening.onDelete}
        />
      ) : null}
      {selection.kind === "furniture"
        && furniture.placement
        && furniture.definition ? (
          <PlacementInspector
            definition={furniture.definition}
            disabled={furniture.disabled}
            libraryDefinition={furniture.libraryDefinition}
            placement={furniture.placement}
            onUpdatePlacement={furniture.onUpdatePlacement}
            onUpdateDefinition={furniture.onUpdateDefinition}
            onMakeUnique={furniture.onMakeUnique}
            onDelete={furniture.onDelete}
          />
        ) : null}
      {selection.kind === "fixture"
        && fixture.placement
        && fixture.definition ? (
        <PlacementInspector
          kind="Fixture"
          definition={fixture.definition}
          disabled={fixture.disabled}
          libraryDefinition={fixture.libraryDefinition}
          placement={fixture.placement}
          onUpdatePlacement={fixture.onUpdatePlacement}
          onUpdateDefinition={fixture.onUpdateDefinition}
          onMakeUnique={fixture.onMakeUnique}
          onDelete={fixture.onDelete}
        />
      ) : null}
    </>
  );
}
