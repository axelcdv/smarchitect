import {
  ProjectValidationError,
  ProjectWorkspace,
  type Opening,
  type OpeningUpdate,
  type FixtureDefinitionUpdate,
  type FixturePlacementUpdate,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementUpdate,
  type WallUpdate
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { useAutosavedProject } from "./use-autosaved-project.js";
import { useItemLibrary } from "./use-item-library.js";
import { createDefaultOpeningInput } from "./OpeningEditor.js";
import { ProjectDocumentPanel } from "./project/ProjectDocumentPanel.js";
import { ProjectSidebar } from "./project/ProjectSidebar.js";
import { WelcomeScreen } from "./project/WelcomeScreen.js";
import { WorkspaceHeader } from "./project/WorkspaceHeader.js";
import type { OpeningConflict } from "./plan-editor/OpeningConflictPanel.js";
import { PlanCanvas } from "./plan-editor/PlanCanvas.js";
import { usePlanGestures } from "./plan-editor/use-plan-gestures.js";
import {
  SelectionInspector
} from "./plan-editor/SelectionInspector.js";
import { useEditorSelection } from "./plan-editor/use-editor-selection.js";
import type {
  RoomLabelEditField
} from "./plan-editor/RoomLabelInspector.js";
import type { WallEditField } from "./plan-editor/WallInspector.js";
import "./styles.css";

export function App() {
  const [draftName, setDraftName] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [operationError, setOperationError] = useState("");
  const [openingConflict, setOpeningConflict] = useState<OpeningConflict>();
  const library = useItemLibrary(setOperationError);
  const importInput = useRef<HTMLInputElement>(null);
  const autosavedProject = useAutosavedProject();
  const {
    workspace,
    yaml,
    persistenceError,
    isSaving,
    canUndo,
    canRedo,
    isTransitionPending
  } = autosavedProject;
  const error = persistenceError || operationError;
  const document = workspace?.document;
  const activePlan = workspace?.activePlan;
  const activeLevel = workspace?.activeLevel;
  const activeProposal = workspace?.activeDesignProposal;
  const proposalStaleness = workspace?.activeProposalStaleness;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const roomLabels = activeLevel?.roomLabels ?? [];
  const openings = activeLevel?.openings ?? [];
  const furniturePlacements = activeLevel?.furniturePlacements ?? [];
  const fixturePlacements = activeLevel?.fixturePlacements ?? [];
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
  const selectedFurnitureDefinition = activePlan?.furnitureDefinitions?.find(
    ({ id }) => id === selectedFurniture?.definitionId
  );
  const selectedLibraryDefinition = library.furnitureDefinitions.find(
    ({ id }) => id === selectedFurnitureDefinition?.id
  );
  const selectedFixtureDefinition = activePlan?.fixtureDefinitions?.find(
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
    commit,
    attemptWallUpdate,
    isTransitionPending,
    selectWall,
    selectOpening,
    selectRoomLabel,
    selectFurniture,
    selectFixture
  });
  const displayedWalls = previewWorkspace?.activeLevel.walls ?? walls;
  const rooms = previewWorkspace?.rooms ?? workspace?.rooms ?? [];

  async function commit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined> {
    const durable = await autosavedProject.commit(next);
    if (durable) setOperationError("");
    return durable;
  }

  async function startAutosave(next: ProjectWorkspace): Promise<boolean> {
    const started = await autosavedProject.startAutosave(next);
    if (started) setOperationError("");
    return started;
  }

  async function navigateHistory(direction: "undo" | "redo"): Promise<void> {
    const restored = await autosavedProject.navigateHistory(direction);
    if (restored) {
      clearPlanSelection();
      setOperationError("");
    }
  }

  function clearPlanSelection(): void {
    clearSelection();
    setOpeningConflict(undefined);
    resetInteraction();
  }

  async function changeActivePlan(next: ProjectWorkspace): Promise<void> {
    if (await commit(next)) clearPlanSelection();
  }

  async function editFurniturePlacement(
    update: FurniturePlacementUpdate
  ): Promise<void> {
    if (!workspace || !selectedFurniture) return;
    await commit(workspace.updateFurniturePlacement(selectedFurniture.id, update));
  }

  async function editEmbeddedDefinition(
    update: FurnitureDefinitionUpdate
  ): Promise<void> {
    if (!workspace || !selectedFurnitureDefinition) return;
    await commit(workspace.updateFurnitureDefinition(
      selectedFurnitureDefinition.id,
      update
    ));
  }

  async function editFixturePlacement(
    update: FixturePlacementUpdate
  ): Promise<void> {
    if (!workspace || !selectedFixture) return;
    await commit(workspace.updateFixturePlacement(selectedFixture.id, update));
  }

  async function editEmbeddedFixtureDefinition(
    update: FixtureDefinitionUpdate
  ): Promise<void> {
    if (!workspace || !selectedFixtureDefinition) return;
    await commit(workspace.updateFixtureDefinition(
      selectedFixtureDefinition.id,
      update
    ));
  }

  async function editSelected(field: WallEditField, value: string): Promise<void> {
    if (!workspace || !selectedWall || !value) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const update = field === "startX" ? { start: { ...selectedWall.path.start, x: Math.round(numeric) } }
      : field === "startY" ? { start: { ...selectedWall.path.start, y: Math.round(numeric) } }
      : field === "endX" ? { end: { ...selectedWall.path.end, x: Math.round(numeric) } }
      : field === "endY" ? { end: { ...selectedWall.path.end, y: Math.round(numeric) } }
      : { [field]: field === "angleDeg" ? numeric : Math.round(numeric) };
    await attemptWallUpdate(selectedWall.id, update);
  }

  async function attemptWallUpdate(wallId: string, update: WallUpdate): Promise<void> {
    if (!workspace) return;
    try {
      const durable = await commit(workspace.updateWall(wallId, update));
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
          setOperationError(
            "Wall edit conflicts with hosted Openings. Choose an explicit resolution."
          );
          return;
        }
      }
      setOperationError(cause instanceof Error ? cause.message : "Unable to edit Wall.");
    }
  }

  async function resolveOpeningConflict(
    resolution: "fit" | "delete"
  ): Promise<void> {
    if (!workspace || !openingConflict) return;
    const durable = await commit(workspace.updateWallResolvingOpenings(
      openingConflict.wallId,
      openingConflict.update,
      resolution
    ));
    if (durable) setOpeningConflict(undefined);
  }

  async function editOpening(update: OpeningUpdate): Promise<void> {
    if (!workspace || !selectedOpening) return;
    try {
      await commit(workspace.updateOpening(selectedOpening.id, update));
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to edit Opening.");
    }
  }

  async function addOpening(kind: Opening["kind"]): Promise<void> {
    if (!workspace || !selectedWall) return;
    try {
      const durable = await commit(workspace.addOpening(
        createDefaultOpeningInput(kind, selectedWall)
      ));
      if (durable) {
        const opening = durable.activeLevel.openings.at(-1);
        if (opening) selectOpening(opening.id, opening.hostWallId);
        setMode("select");
      }
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to add Opening.");
    }
  }

  async function editSelectedRoomLabel(
    field: RoomLabelEditField,
    value: string
  ): Promise<void> {
    if (!workspace || !selectedRoomLabel || !value) return;
    if (field === "name") {
      await commit(workspace.updateRoomLabel(selectedRoomLabel.id, { name: value }));
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    await commit(workspace.updateRoomLabel(selectedRoomLabel.id, {
      position: {
        ...selectedRoomLabel.position,
        [field]: Math.round(numeric)
      }
    }));
  }

  async function createProject(): Promise<void> {
    try {
      const created = ProjectWorkspace.create(draftName);
      await startAutosave(created);
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to create project.");
    }
  }

  async function renameProject(value: string): Promise<void> {
    if (!workspace) {
      return;
    }

    try {
      const renamedWorkspace = workspace.rename(value);
      await commit(renamedWorkspace);
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to rename project.");
    }
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const imported = ProjectWorkspace.importYaml(await file.text());
      if (await startAutosave(imported)) {
        setDraftName(imported.document.name);
      }
    } catch (cause) {
      if (cause instanceof ProjectValidationError) {
        setOperationError(cause.diagnostics.map(({ message }) => message).join(" "));
      } else {
        setOperationError(cause instanceof Error
          ? cause.message
          : "Unable to import project.");
      }
    } finally {
      event.target.value = "";
    }
  }

  if (!workspace || !document || !activePlan || !activeLevel) {
    return (
      <WelcomeScreen
        draftName={draftName}
        error={error}
        importInputRef={importInput}
        isSaving={isSaving}
        onCreate={() => void createProject()}
        onDraftNameChange={setDraftName}
        onImport={(event) => void importProject(event)}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        canRedo={canRedo}
        canUndo={canUndo}
        importInputRef={importInput}
        isDesignProposal={Boolean(activeProposal)}
        isSaving={isSaving}
        onImport={(event) => void importProject(event)}
        onNavigateHistory={(direction) => void navigateHistory(direction)}
        projectName={document.name}
        yaml={yaml}
      />

      <section className="workspace-grid">
        <ProjectSidebar
          activeLevel={activeLevel}
          activeProposal={activeProposal}
          diagnostics={diagnostics}
          document={document}
          error={error}
          isSaving={isSaving}
          library={library}
          onCreateProposal={() => {
            void changeActivePlan(
              workspace.createDesignProposal(proposalName)
            ).then(() => setProposalName(""));
          }}
          onDeleteProposal={() => {
            if (activeProposal) {
              void changeActivePlan(
                workspace.deleteDesignProposal(activeProposal.id)
              );
            }
          }}
          onPlaceItem={(kind, definitionId) => {
            beginItemPlacement({ kind, definitionId });
          }}
          onProposalNameChange={setProposalName}
          onRenameProject={(value) => void renameProject(value)}
          onRenameProposal={(value) => {
            if (activeProposal) {
              void commit(workspace.renameDesignProposal(
                activeProposal.id,
                value
              ));
            }
          }}
          onSelectExistingState={() =>
            void changeActivePlan(workspace.selectExistingState())}
          onSelectProposal={(proposalId) =>
            void changeActivePlan(workspace.selectDesignProposal(proposalId))}
          proposalName={proposalName}
          proposalStaleness={proposalStaleness}
        />

        <section className="plan-panel" aria-labelledby="plan-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Plan</p>
              <h2 id="plan-title">{activeLevel.name}</h2>
            </div>
            <span className="scale-chip">Metric · millimetres</span>
          </div>
          <div className="plan-toolbar">
            <button disabled={isSaving} className={mode === "draw" ? "tool-active" : ""} type="button" onClick={() => setMode("draw")}>Draw wall</button>
            <button disabled={isSaving} className={mode === "select" ? "tool-active" : ""} type="button" onClick={() => setMode("select")}>Select</button>
            <button disabled={isSaving} className={mode === "label" ? "tool-active" : ""} type="button" onClick={() => setMode("label")}>Add room label</button>
              <span className="plan-count">
                <span>{`${walls.length} ${walls.length === 1 ? "wall" : "walls"}`}</span>
                {" · "}
                <span>{`${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}</span>
              </span>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("door")}>Add door</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("window")}>Add window</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("passage")}>Add passage</button>
            <span>{openings.length} {openings.length === 1 ? "opening" : "openings"}</span>
            <span>
              {`${furniturePlacements.length} Furniture ${furniturePlacements.length === 1 ? "Placement" : "Placements"}`}
            </span>
            <span>
              {`${fixturePlacements.length} Fixture ${fixturePlacements.length === 1 ? "Placement" : "Placements"}`}
            </span>
            <button type="button" aria-label="Zoom in" onClick={() => zoom(.8)}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => zoom(1.25)}>−</button>
            <button type="button" aria-label="Pan left" onClick={() => pan("left")}>←</button>
            <button type="button" aria-label="Pan right" onClick={() => pan("right")}>→</button>
            <button type="button" aria-label="Pan up" onClick={() => pan("up")}>↑</button>
            <button type="button" aria-label="Pan down" onClick={() => pan("down")}>↓</button>
          </div>
          <PlanCanvas
            levelName={activeLevel.name}
            view={view}
            rooms={rooms}
            walls={displayedWalls}
            openings={openings}
            roomLabels={roomLabels}
            furnitureDefinitions={activePlan.furnitureDefinitions ?? []}
            furniturePlacements={furniturePlacements}
            fixtureDefinitions={activePlan.fixtureDefinitions ?? []}
            fixturePlacements={fixturePlacements}
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
              disabled: isSaving,
              resetKey: operationError,
              onEdit: (field, value) => void editSelected(field, value),
              onDelete: () => {
                if (!selectedWall) return;
                void commit(workspace.deleteWall(selectedWall.id))
                  .then((durable) => {
                    if (durable) clearSelection();
                  });
              }
            }}
            roomLabel={{
              roomLabel: selectedRoomLabel,
              diagnostics,
              disabled: isSaving,
              resetKey: operationError,
              onEdit: (field, value) =>
                void editSelectedRoomLabel(field, value),
              onDelete: () => {
                if (!selectedRoomLabel) return;
                void commit(workspace.deleteRoomLabel(selectedRoomLabel.id))
                  .then((durable) => {
                    if (durable) clearSelection();
                  });
              }
            }}
            opening={{
              opening: selectedOpening,
              conflict: openingConflict,
              openings,
              disabled: isSaving,
              onResolveConflict: (resolution) =>
                void resolveOpeningConflict(resolution),
              onCancelConflict: () => {
                setOpeningConflict(undefined);
                setOperationError("");
              },
              onEdit: (update) => void editOpening(update),
              onDelete: () => {
                if (!selectedOpening) return;
                void commit(workspace.deleteOpening(selectedOpening.id))
                  .then((durable) => {
                    if (durable) selectWall(selectedOpening.hostWallId);
                  });
              }
            }}
            furniture={{
              placement: selectedFurniture,
              definition: selectedFurnitureDefinition,
              libraryDefinition: selectedLibraryDefinition,
              disabled: isSaving || library.isSaving,
              onUpdatePlacement: (update) =>
                void editFurniturePlacement(update),
              onUpdateDefinition: (update) =>
                void editEmbeddedDefinition(update),
              onMakeUnique: () => {
                if (!selectedFurniture) return;
                void commit(
                  workspace.makeFurniturePlacementUnique(selectedFurniture.id)
                );
              },
              onDelete: () => {
                if (!selectedFurniture) return;
                void commit(
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
              disabled: isSaving || library.isSaving,
              onUpdatePlacement: (update) =>
                void editFixturePlacement(update),
              onUpdateDefinition: (update) =>
                void editEmbeddedFixtureDefinition(update),
              onMakeUnique: () => {
                if (!selectedFixture) return;
                void commit(
                  workspace.makeFixturePlacementUnique(selectedFixture.id)
                );
              },
              onDelete: () => {
                if (!selectedFixture) return;
                void commit(
                  workspace.deleteFixturePlacement(selectedFixture.id)
                ).then((durable) => {
                  if (durable) clearSelection();
                });
              }
            }}
          />
        </section>

        <ProjectDocumentPanel yaml={yaml} />
      </section>
    </main>
  );
}
