import {
  ProjectValidationError,
  type Diagnostic,
  type FixtureDefinitionUpdate,
  type FixturePlacementUpdate,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementUpdate,
  type Opening,
  type OpeningUpdate,
  type ProjectWorkspace,
  type WallUpdate
} from "@smarchitect/core";
import {
  forwardRef,
  useImperativeHandle,
  useState
} from "react";
import { createDefaultOpeningInput } from "../OpeningEditor.js";
import type {
  ItemKind,
  ItemLibraryController
} from "../use-item-library.js";
import type { OpeningConflict } from "./OpeningConflictPanel.js";
import { PlanCanvas } from "./PlanCanvas.js";
import { PlanToolbar } from "./PlanToolbar.js";
import type { RoomLabelEditField } from "./RoomLabelInspector.js";
import { SelectionInspector } from "./SelectionInspector.js";
import type { WallEditField } from "./WallInspector.js";
import { useEditorSelection } from "./use-editor-selection.js";
import { usePlanGestures } from "./use-plan-gestures.js";

export interface PlanEditorHandle {
  beginItemPlacement(kind: ItemKind, definitionId: string): void;
  clearSelection(): void;
}

export interface PlanEditorProps {
  workspace: ProjectWorkspace;
  isSaving: boolean;
  isReadOnly?: boolean;
  operationError: string;
  library: ItemLibraryController;
  isTransitionPending(): boolean;
  onCommit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined>;
  onOperationError(message: string): void;
}

export const PlanEditor = forwardRef<PlanEditorHandle, PlanEditorProps>(
  function PlanEditor({
    workspace,
    isSaving,
    isReadOnly = false,
    operationError,
    library,
    isTransitionPending,
    onCommit,
    onOperationError
  }, ref) {
    const editingDisabled = isSaving || isReadOnly;
    const [openingConflict, setOpeningConflict] = useState<OpeningConflict>();
    const activePlan = workspace.activePlan;
    const activeLevel = workspace.activeLevel;
    const diagnostics = workspace.diagnostics;
    const warnings = diagnostics.filter(({ severity }) => severity === "warning");
    const warningIds = new Set(workspace.activeDiagnostics
      .filter(({ severity }) => severity === "warning")
      .flatMap(({ affectedIds }) => affectedIds ?? []));
    const walls = activeLevel.walls;
    const roomLabels = activeLevel.roomLabels;
    const openings = activeLevel.openings;
    const furniturePlacements = activeLevel.furniturePlacements ?? [];
    const fixturePlacements = activeLevel.fixturePlacements ?? [];
    const {
      selection,
      wall: selectedWall,
      opening: selectedOpening,
      roomLabel: selectedRoomLabel,
      furniture: selectedFurniture,
      fixture: selectedFixture,
      clearSelection,
      selectWall,
      selectOpening,
      selectRoomLabel,
      selectFurniture,
      selectFixture
    } = useEditorSelection({
      walls,
      openings,
      roomLabels,
      furniturePlacements,
      fixturePlacements
    });
    const selectedFurnitureDefinition = activePlan.furnitureDefinitions?.find(
      ({ id }) => id === selectedFurniture?.definitionId
    );
    const selectedLibraryDefinition = library.furnitureDefinitions.find(
      ({ id }) => id === selectedFurnitureDefinition?.id
    );
    const selectedFixtureDefinition = activePlan.fixtureDefinitions?.find(
      ({ id }) => id === selectedFixture?.definitionId
    );
    const selectedFixtureLibraryDefinition = library.fixtureDefinitions.find(
      ({ id }) => id === selectedFixtureDefinition?.id
    );
    const {
      mode,
      setMode,
      view,
      previewWorkspace,
      wallPreview,
      beginItemPlacement,
      resetInteraction,
      zoom,
      pan,
      beginPlanGesture,
      previewPlanGesture,
      finishPlanGesture,
      cancelPlanGesture,
      handleWheel,
      beginOpeningGesture
    } = usePlanGestures({
      workspace,
      selectedWall,
      furnitureLibrary: library.furnitureDefinitions,
      fixtureLibrary: library.fixtureDefinitions,
      commit: onCommit,
      attemptWallUpdate,
      isTransitionPending,
      selectWall,
      selectOpening,
      selectRoomLabel,
      selectFurniture,
      selectFixture
    });
    const displayedWalls = previewWorkspace?.activeLevel.walls ?? walls;
    const rooms = previewWorkspace?.rooms ?? workspace.rooms;

    function clearPlanSelection(): void {
      clearSelection();
      setOpeningConflict(undefined);
      resetInteraction();
    }

    async function focusWarning(diagnostic: Diagnostic): Promise<void> {
      const focus = diagnostic.focus;
      if (!focus) return;
      let focusedWorkspace = workspace;
      if (!workspace.activeDiagnostics.some(
        ({ code, path }) => code === diagnostic.code && path === diagnostic.path
      )) {
        const durable = await onCommit(workspace.navigateToDiagnostic(diagnostic));
        if (!durable) return;
        focusedWorkspace = durable;
      }
      switch (focus.kind) {
        case "wall":
          selectWall(focus.id);
          break;
        case "opening": {
          const opening = focusedWorkspace.activeLevel.openings.find(
            ({ id }) => id === focus.id
          );
          if (opening) selectOpening(opening.id, opening.hostWallId);
          break;
        }
        case "room-label":
          selectRoomLabel(focus.id);
          break;
        case "furniture":
          selectFurniture(focus.id);
          break;
        case "fixture":
          selectFixture(focus.id);
          break;
      }
    }

    useImperativeHandle(ref, () => ({
      beginItemPlacement: (kind, definitionId) => {
        beginItemPlacement({ kind, definitionId });
      },
      clearSelection: clearPlanSelection
    }));

    async function attemptWallUpdate(
      wallId: string,
      update: WallUpdate
    ): Promise<void> {
      try {
        const durable = await onCommit(workspace.updateWall(wallId, update));
        if (durable) setOpeningConflict(undefined);
      } catch (cause) {
        if (cause instanceof ProjectValidationError) {
          const openingIds = cause.diagnostics.flatMap(({ path }) => {
            const match =
              /^(?:\/designProposals\/\d+)?\/levels\/\d+\/openings\/(\d+)\//
                .exec(path);
            const opening = match ? openings[Number(match[1])] : undefined;
            return opening ? [opening.id] : [];
          });
          if (openingIds.length) {
            setOpeningConflict({
              wallId,
              update,
              openingIds: [...new Set(openingIds)]
            });
            onOperationError(
              "Wall edit conflicts with hosted Openings. Choose an explicit resolution."
            );
            return;
          }
        }
        onOperationError(
          cause instanceof Error ? cause.message : "Unable to edit Wall."
        );
      }
    }

    async function editSelected(
      field: WallEditField,
      value: string
    ): Promise<void> {
      if (!selectedWall || !value) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      const update = field === "startX"
        ? { start: { ...selectedWall.path.start, x: Math.round(numeric) } }
        : field === "startY"
          ? { start: { ...selectedWall.path.start, y: Math.round(numeric) } }
          : field === "endX"
            ? { end: { ...selectedWall.path.end, x: Math.round(numeric) } }
            : field === "endY"
              ? { end: { ...selectedWall.path.end, y: Math.round(numeric) } }
              : { [field]: field === "angleDeg" ? numeric : Math.round(numeric) };
      await attemptWallUpdate(selectedWall.id, update);
    }

    async function resolveOpeningConflict(
      resolution: "fit" | "delete"
    ): Promise<void> {
      if (!openingConflict) return;
      const durable = await onCommit(workspace.updateWallResolvingOpenings(
        openingConflict.wallId,
        openingConflict.update,
        resolution
      ));
      if (durable) setOpeningConflict(undefined);
    }

    async function editOpening(update: OpeningUpdate): Promise<void> {
      if (!selectedOpening) return;
      try {
        await onCommit(workspace.updateOpening(selectedOpening.id, update));
      } catch (cause) {
        onOperationError(cause instanceof ProjectValidationError
          ? cause.diagnostics.map(({ message }) => message).join(" ")
          : cause instanceof Error ? cause.message : "Unable to edit Opening.");
      }
    }

    async function addOpening(kind: Opening["kind"]): Promise<void> {
      if (!selectedWall) return;
      try {
        const durable = await onCommit(workspace.addOpening(
          createDefaultOpeningInput(kind, selectedWall)
        ));
        if (durable) {
          const opening = durable.activeLevel.openings.at(-1);
          if (opening) selectOpening(opening.id, opening.hostWallId);
          setMode("select");
        }
      } catch (cause) {
        onOperationError(cause instanceof ProjectValidationError
          ? cause.diagnostics.map(({ message }) => message).join(" ")
          : cause instanceof Error ? cause.message : "Unable to add Opening.");
      }
    }

    async function editSelectedRoomLabel(
      field: RoomLabelEditField,
      value: string
    ): Promise<void> {
      if (!selectedRoomLabel || !value) return;
      if (field === "name") {
        await onCommit(workspace.updateRoomLabel(
          selectedRoomLabel.id,
          { name: value }
        ));
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      await onCommit(workspace.updateRoomLabel(selectedRoomLabel.id, {
        position: {
          ...selectedRoomLabel.position,
          [field]: Math.round(numeric)
        }
      }));
    }

    async function editFurniturePlacement(
      update: FurniturePlacementUpdate
    ): Promise<void> {
      if (!selectedFurniture) return;
      await onCommit(workspace.updateFurniturePlacement(
        selectedFurniture.id,
        update
      ));
    }

    async function editEmbeddedDefinition(
      update: FurnitureDefinitionUpdate
    ): Promise<void> {
      if (!selectedFurnitureDefinition) return;
      await onCommit(workspace.updateFurnitureDefinition(
        selectedFurnitureDefinition.id,
        update
      ));
    }

    async function editFixturePlacement(
      update: FixturePlacementUpdate
    ): Promise<void> {
      if (!selectedFixture) return;
      await onCommit(workspace.updateFixturePlacement(
        selectedFixture.id,
        update
      ));
    }

    async function editEmbeddedFixtureDefinition(
      update: FixtureDefinitionUpdate
    ): Promise<void> {
      if (!selectedFixtureDefinition) return;
      await onCommit(workspace.updateFixtureDefinition(
        selectedFixtureDefinition.id,
        update
      ));
    }

    return (
      <section className="plan-panel" aria-labelledby="plan-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Plan</p>
            <h2 id="plan-title">{activeLevel.name}</h2>
          </div>
          <span className="scale-chip">Metric · millimetres</span>
        </div>
        {isReadOnly ? (
          <p
            className="draft-lock-notice"
            role="status"
            aria-label="Graphical editor locked"
          >
            The graphical editor is read-only while a YAML draft is not applied.
          </p>
        ) : null}
        <PlanToolbar
          fixturePlacementCount={fixturePlacements.length}
          furniturePlacementCount={furniturePlacements.length}
          hasSelectedWall={Boolean(selectedWall)}
          isSaving={editingDisabled}
          mode={mode}
          openingCount={openings.length}
          roomCount={rooms.length}
          wallCount={walls.length}
          onAddOpening={(kind) => void addOpening(kind)}
          onModeChange={setMode}
          onPan={pan}
          onZoom={zoom}
        />
        {warnings.length ? (
          <section className="design-warnings" aria-labelledby="design-warnings-title">
            <div>
              <h3 id="design-warnings-title">Design warnings</h3>
              <p>
                Advisory space-planning guidance only. Warnings do not block
                editing, autosave, YAML Apply, checkpoints, or export, and are
                not professional structural advice.
              </p>
            </div>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning.code}:${warning.path}:${index}`}>
                  <div>
                    <code>{warning.code}</code>
                    <p>{warning.message}</p>
                    {warning.affectedIds?.length ? (
                      <small>Affected IDs: {warning.affectedIds.join(", ")}</small>
                    ) : null}
                  </div>
                  {warning.focus ? (
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Focus warning ${warning.code}`}
                      onClick={() => void focusWarning(warning)}
                    >
                      Focus in plan
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <PlanCanvas
          levelName={activeLevel.name}
          view={view}
          rooms={rooms}
          walls={displayedWalls}
          wallPreview={wallPreview}
          openings={openings}
          roomLabels={roomLabels}
          furnitureDefinitions={activePlan.furnitureDefinitions ?? []}
          furniturePlacements={furniturePlacements}
          fixtureDefinitions={activePlan.fixtureDefinitions ?? []}
          fixturePlacements={fixturePlacements}
          warningIds={warningIds}
          selection={selection}
          onPointerDown={(event) => void beginPlanGesture(event)}
          onPointerMove={previewPlanGesture}
          onPointerUp={(event) => void finishPlanGesture(event)}
          onPointerCancel={cancelPlanGesture}
          onWheel={handleWheel}
          onOpeningPointerDown={beginOpeningGesture}
        />
        <SelectionInspector
          selection={selection}
          wall={{
            wall: selectedWall,
            disabled: editingDisabled,
            resetKey: operationError,
            onEdit: (field, value) => void editSelected(field, value),
            onDelete: () => {
              if (!selectedWall) return;
              void onCommit(workspace.deleteWall(selectedWall.id))
                .then((durable) => {
                  if (durable) clearSelection();
                });
            }
          }}
          roomLabel={{
            roomLabel: selectedRoomLabel,
            diagnostics,
            disabled: editingDisabled,
            resetKey: operationError,
            onEdit: (field, value) =>
              void editSelectedRoomLabel(field, value),
            onDelete: () => {
              if (!selectedRoomLabel) return;
              void onCommit(workspace.deleteRoomLabel(selectedRoomLabel.id))
                .then((durable) => {
                  if (durable) clearSelection();
                });
            }
          }}
          opening={{
            opening: selectedOpening,
            conflict: openingConflict,
            openings,
            disabled: editingDisabled,
            onResolveConflict: (resolution) =>
              void resolveOpeningConflict(resolution),
            onCancelConflict: () => {
              setOpeningConflict(undefined);
              onOperationError("");
            },
            onEdit: (update) => void editOpening(update),
            onDelete: () => {
              if (!selectedOpening) return;
              void onCommit(workspace.deleteOpening(selectedOpening.id))
                .then((durable) => {
                  if (durable) selectWall(selectedOpening.hostWallId);
                });
            }
          }}
          furniture={{
            placement: selectedFurniture,
            definition: selectedFurnitureDefinition,
            libraryDefinition: selectedLibraryDefinition,
            disabled: editingDisabled || library.isSaving,
            onUpdatePlacement: (update) =>
              void editFurniturePlacement(update),
            onUpdateDefinition: (update) =>
              void editEmbeddedDefinition(update),
            onMakeUnique: () => {
              if (!selectedFurniture) return;
              void onCommit(
                workspace.makeFurniturePlacementUnique(selectedFurniture.id)
              );
            },
            onDelete: () => {
              if (!selectedFurniture) return;
              void onCommit(
                workspace.deleteFurniturePlacement(selectedFurniture.id)
              ).then((durable) => {
                if (durable) clearSelection();
              });
            }
          }}
          fixture={{
            placement: selectedFixture,
            definition: selectedFixtureDefinition,
            libraryDefinition: selectedFixtureLibraryDefinition,
            disabled: editingDisabled || library.isSaving,
            onUpdatePlacement: (update) =>
              void editFixturePlacement(update),
            onUpdateDefinition: (update) =>
              void editEmbeddedFixtureDefinition(update),
            onMakeUnique: () => {
              if (!selectedFixture) return;
              void onCommit(
                workspace.makeFixturePlacementUnique(selectedFixture.id)
              );
            },
            onDelete: () => {
              if (!selectedFixture) return;
              void onCommit(
                workspace.deleteFixturePlacement(selectedFixture.id)
              ).then((durable) => {
                if (durable) clearSelection();
              });
            }
          }}
        />
      </section>
    );
  }
);
