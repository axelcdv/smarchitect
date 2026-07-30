import {
  addFixtureDefinition,
  addFurnitureDefinition,
  createFixtureDefinition,
  createFurnitureDefinition,
  deleteFixtureDefinition,
  deleteFurnitureDefinition,
  updateFixtureDefinition,
  updateFurnitureDefinition,
  type FixtureDefinition,
  type FixtureDefinitionInput,
  type FixtureDefinitionUpdate,
  type FurnitureDefinition,
  type FurnitureDefinitionInput,
  type FurnitureDefinitionUpdate
} from "@smarchitect/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AutosavedItemLibrary,
  IndexedDbItemLibraryRepository
} from "./project-persistence.js";

interface LibraryHistoryControls {
  canUndo: boolean;
  canRedo: boolean;
}

export type { ItemKind } from "./project-persistence.js";

export interface ItemLibraryController {
  isSaving: boolean;
  furnitureDefinitions: FurnitureDefinition[];
  fixtureDefinitions: FixtureDefinition[];
  history: LibraryHistoryControls;
  createFurniture(input: FurnitureDefinitionInput): Promise<boolean>;
  createFixture(input: FixtureDefinitionInput): Promise<boolean>;
  updateFurniture(
    id: string,
    update: FurnitureDefinitionUpdate
  ): Promise<boolean>;
  updateFixture(id: string, update: FixtureDefinitionUpdate): Promise<boolean>;
  removeFurniture(id: string): Promise<boolean>;
  removeFixture(id: string): Promise<boolean>;
  navigate(direction: "undo" | "redo"): Promise<void>;
}

const EMPTY_HISTORY = { canUndo: false, canRedo: false };

export function useItemLibrary(
  reportError: (message: string) => void
): ItemLibraryController {
  const [furnitureDefinitions, setFurnitureDefinitions] = useState<
    FurnitureDefinition[]
  >([]);
  const [fixtureDefinitions, setFixtureDefinitions] = useState<
    FixtureDefinition[]
  >([]);
  const [history, setHistory] =
    useState<LibraryHistoryControls>(EMPTY_HISTORY);
  const [isSaving, setIsSaving] = useState(false);
  const repository = useRef(new IndexedDbItemLibraryRepository());
  const itemLibrary = useRef<AutosavedItemLibrary | undefined>(undefined);

  const refresh = useCallback((library: AutosavedItemLibrary) => {
    setFurnitureDefinitions(library.furnitureDefinitions);
    setFixtureDefinitions(library.fixtureDefinitions);
    setHistory({
      canUndo: library.canUndo,
      canRedo: library.canRedo
    });
  }, []);

  useEffect(() => {
    let active = true;
    void AutosavedItemLibrary.restore(repository.current)
      .then((restored) => restored
        ?? AutosavedItemLibrary.create(repository.current))
      .then((library) => {
        if (!active) return;
        itemLibrary.current = library;
        refresh(library);
      }).catch(() => {
        if (active) reportError("The Item Library could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [refresh, reportError]);

  const transact = useCallback(async (
    transition: (library: AutosavedItemLibrary) => Promise<unknown>
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const library = itemLibrary.current;
      if (!library) throw new Error("The Item Library is not ready.");
      await transition(library);
      refresh(library);
      reportError("");
      return true;
    } catch (cause) {
      reportError(cause instanceof Error
        ? cause.message
        : "The Item Library change could not be saved.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [refresh, reportError]);

  const navigate = useCallback(async (
    direction: "undo" | "redo"
  ) => {
    const library = itemLibrary.current;
    if (!library) return;
    setIsSaving(true);
    try {
      direction === "undo" ? await library.undo() : await library.redo();
      refresh(library);
      reportError("");
    } catch {
      reportError("The Item Library history change could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }, [refresh, reportError]);

  return {
    isSaving,
    furnitureDefinitions,
    fixtureDefinitions,
    history,
    createFurniture: (input) => transact((library) =>
      library.transactFurniture((current) =>
        addFurnitureDefinition(current, createFurnitureDefinition(input)))),
    createFixture: (input) => transact((library) =>
      library.transactFixture((current) =>
        addFixtureDefinition(current, createFixtureDefinition(input)))),
    updateFurniture: (id, update) => transact((library) =>
      library.transactFurniture((current) =>
        updateFurnitureDefinition(current, id, update))),
    updateFixture: (id, update) => transact((library) =>
      library.transactFixture((current) =>
        updateFixtureDefinition(current, id, update))),
    removeFurniture: (id) => transact((library) =>
      library.transactFurniture((current) =>
        deleteFurnitureDefinition(current, id))),
    removeFixture: (id) => transact((library) =>
      library.transactFixture((current) =>
        deleteFixtureDefinition(current, id))),
    navigate
  };
}
