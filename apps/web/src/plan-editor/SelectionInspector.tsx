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

export interface SelectionInspectorProps {
  selection: EditorSelection;
  wall?: Wall;
  opening?: Opening;
  roomLabel?: RoomLabel;
  furniture?: FurniturePlacement;
  furnitureDefinition?: FurnitureDefinition;
  furnitureLibraryDefinition?: FurnitureDefinition;
  fixture?: FixturePlacement;
  fixtureDefinition?: FixtureDefinition;
  fixtureLibraryDefinition?: FixtureDefinition;
  diagnostics: readonly Diagnostic[];
  openings: readonly Opening[];
  openingConflict?: OpeningConflict;
  isSaving: boolean;
  isLibrarySaving: boolean;
  resetKey: string;
  onEditWall(field: WallEditField, value: string): void;
  onDeleteWall(): void;
  onEditRoomLabel(field: RoomLabelEditField, value: string): void;
  onDeleteRoomLabel(): void;
  onResolveOpeningConflict(resolution: "fit" | "delete"): void;
  onCancelOpeningConflict(): void;
  onEditOpening(update: OpeningUpdate): void;
  onDeleteOpening(): void;
  onUpdateFurniturePlacement(update: FurniturePlacementUpdate): void;
  onUpdateFurnitureDefinition(update: FurnitureDefinitionUpdate): void;
  onMakeFurnitureUnique(): void;
  onDeleteFurniture(): void;
  onUpdateFixturePlacement(update: FixturePlacementUpdate): void;
  onUpdateFixtureDefinition(update: FixtureDefinitionUpdate): void;
  onMakeFixtureUnique(): void;
  onDeleteFixture(): void;
}

export function SelectionInspector({
  selection,
  wall,
  opening,
  roomLabel,
  furniture,
  furnitureDefinition,
  furnitureLibraryDefinition,
  fixture,
  fixtureDefinition,
  fixtureLibraryDefinition,
  diagnostics,
  openings,
  openingConflict,
  isSaving,
  isLibrarySaving,
  resetKey,
  onEditWall,
  onDeleteWall,
  onEditRoomLabel,
  onDeleteRoomLabel,
  onResolveOpeningConflict,
  onCancelOpeningConflict,
  onEditOpening,
  onDeleteOpening,
  onUpdateFurniturePlacement,
  onUpdateFurnitureDefinition,
  onMakeFurnitureUnique,
  onDeleteFurniture,
  onUpdateFixturePlacement,
  onUpdateFixtureDefinition,
  onMakeFixtureUnique,
  onDeleteFixture
}: SelectionInspectorProps) {
  const selectedWall = selection.kind === "wall"
    || selection.kind === "opening"
    ? wall
    : undefined;
  const selectedRoomLabel = selection.kind === "roomLabel"
    ? roomLabel
    : undefined;

  return (
    <>
      {selectedWall ? (
        <WallInspector
          disabled={isSaving}
          resetKey={resetKey}
          wall={selectedWall}
          onDelete={onDeleteWall}
          onEdit={onEditWall}
        />
      ) : null}
      <RoomLabelInspector
        diagnostics={diagnostics}
        disabled={isSaving}
        resetKey={resetKey}
        roomLabel={selectedRoomLabel}
        onDelete={onDeleteRoomLabel}
        onEdit={onEditRoomLabel}
      />
      <OpeningConflictPanel
        conflict={openingConflict}
        disabled={isSaving}
        openings={openings}
        onCancel={onCancelOpeningConflict}
        onResolve={onResolveOpeningConflict}
      />
      {selection.kind === "opening" && opening ? (
        <OpeningProperties
          opening={opening}
          isSaving={isSaving}
          onEdit={onEditOpening}
          onDelete={onDeleteOpening}
        />
      ) : null}
      {selection.kind === "furniture"
        && furniture
        && furnitureDefinition ? (
          <PlacementInspector
            definition={furnitureDefinition}
            disabled={isSaving || isLibrarySaving}
            libraryDefinition={furnitureLibraryDefinition}
            placement={furniture}
            onUpdatePlacement={onUpdateFurniturePlacement}
            onUpdateDefinition={onUpdateFurnitureDefinition}
            onMakeUnique={onMakeFurnitureUnique}
            onDelete={onDeleteFurniture}
          />
        ) : null}
      {selection.kind === "fixture" && fixture && fixtureDefinition ? (
        <PlacementInspector
          kind="Fixture"
          definition={fixtureDefinition}
          disabled={isSaving || isLibrarySaving}
          libraryDefinition={fixtureLibraryDefinition}
          placement={fixture}
          onUpdatePlacement={onUpdateFixturePlacement}
          onUpdateDefinition={onUpdateFixtureDefinition}
          onMakeUnique={onMakeFixtureUnique}
          onDelete={onDeleteFixture}
        />
      ) : null}
    </>
  );
}
