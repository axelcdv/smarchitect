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
  AutosavedFixtureLibrary,
  AutosavedFurnitureLibrary,
  IndexedDbFixtureLibraryRepository,
  IndexedDbFurnitureLibraryRepository
} from "./project-persistence.js";

interface LibraryHistoryControls {
  canUndo: boolean;
  canRedo: boolean;
}

export type ItemKind = "furniture" | "fixture";

export interface ItemLibraryController {
  isSaving: boolean;
  furnitureDefinitions: FurnitureDefinition[];
  fixtureDefinitions: FixtureDefinition[];
  furnitureHistory: LibraryHistoryControls;
  fixtureHistory: LibraryHistoryControls;
  createFurniture(input: FurnitureDefinitionInput): Promise<boolean>;
  createFixture(input: FixtureDefinitionInput): Promise<boolean>;
  updateFurniture(
    id: string,
    update: FurnitureDefinitionUpdate
  ): Promise<boolean>;
  updateFixture(id: string, update: FixtureDefinitionUpdate): Promise<boolean>;
  removeFurniture(id: string): Promise<boolean>;
  removeFixture(id: string): Promise<boolean>;
  navigate(kind: ItemKind, direction: "undo" | "redo"): Promise<void>;
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
  const [furnitureHistory, setFurnitureHistory] =
    useState<LibraryHistoryControls>(EMPTY_HISTORY);
  const [fixtureHistory, setFixtureHistory] =
    useState<LibraryHistoryControls>(EMPTY_HISTORY);
  const [isSaving, setIsSaving] = useState(false);
  const furnitureRepository = useRef(new IndexedDbFurnitureLibraryRepository());
  const fixtureRepository = useRef(new IndexedDbFixtureLibraryRepository());
  const furnitureLibrary = useRef<AutosavedFurnitureLibrary | undefined>(
    undefined
  );
  const fixtureLibrary = useRef<AutosavedFixtureLibrary | undefined>(undefined);

  const refreshFurniture = useCallback((library: AutosavedFurnitureLibrary) => {
    setFurnitureDefinitions(library.definitions);
    setFurnitureHistory({
      canUndo: library.canUndo,
      canRedo: library.canRedo
    });
  }, []);

  const refreshFixtures = useCallback((library: AutosavedFixtureLibrary) => {
    setFixtureDefinitions(library.definitions);
    setFixtureHistory({
      canUndo: library.canUndo,
      canRedo: library.canRedo
    });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      AutosavedFurnitureLibrary.restore(furnitureRepository.current)
        .then((restored) => restored
          ?? AutosavedFurnitureLibrary.create(furnitureRepository.current)),
      AutosavedFixtureLibrary.restore(fixtureRepository.current)
        .then((restored) => restored
          ?? AutosavedFixtureLibrary.create(fixtureRepository.current))
    ]).then(async ([furniture, fixtures]) => {
      const resolvedFurniture = await furniture;
      const resolvedFixtures = await fixtures;
      if (!active) return;
      furnitureLibrary.current = resolvedFurniture;
      fixtureLibrary.current = resolvedFixtures;
      refreshFurniture(resolvedFurniture);
      refreshFixtures(resolvedFixtures);
    }).catch(() => {
      if (active) reportError("The Item Library could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [refreshFixtures, refreshFurniture, reportError]);

  const transactFurniture = useCallback(async (
    transition: (current: FurnitureDefinition[]) => FurnitureDefinition[]
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const library = furnitureLibrary.current;
      if (!library) throw new Error("The Item Library is not ready.");
      await library.transact(transition);
      refreshFurniture(library);
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
  }, [refreshFurniture, reportError]);

  const transactFixture = useCallback(async (
    transition: (current: FixtureDefinition[]) => FixtureDefinition[]
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const library = fixtureLibrary.current;
      if (!library) throw new Error("The Item Library is not ready.");
      await library.transact(transition);
      refreshFixtures(library);
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
  }, [refreshFixtures, reportError]);

  const navigate = useCallback(async (
    kind: ItemKind,
    direction: "undo" | "redo"
  ) => {
    const library = kind === "furniture"
      ? furnitureLibrary.current
      : fixtureLibrary.current;
    if (!library) return;
    setIsSaving(true);
    try {
      direction === "undo" ? await library.undo() : await library.redo();
      if (kind === "furniture") {
        refreshFurniture(library as AutosavedFurnitureLibrary);
      } else {
        refreshFixtures(library as AutosavedFixtureLibrary);
      }
      reportError("");
    } catch {
      reportError("The Item Library history change could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }, [refreshFixtures, refreshFurniture, reportError]);

  return {
    isSaving,
    furnitureDefinitions,
    fixtureDefinitions,
    furnitureHistory,
    fixtureHistory,
    createFurniture: (input) => transactFurniture((current) =>
      addFurnitureDefinition(current, createFurnitureDefinition(input))),
    createFixture: (input) => transactFixture((current) =>
      addFixtureDefinition(current, createFixtureDefinition(input))),
    updateFurniture: (id, update) => transactFurniture((current) =>
      updateFurnitureDefinition(current, id, update)),
    updateFixture: (id, update) => transactFixture((current) =>
      updateFixtureDefinition(current, id, update)),
    removeFurniture: (id) => transactFurniture((current) =>
      deleteFurnitureDefinition(current, id)),
    removeFixture: (id) => transactFixture((current) =>
      deleteFixtureDefinition(current, id)),
    navigate
  };
}
