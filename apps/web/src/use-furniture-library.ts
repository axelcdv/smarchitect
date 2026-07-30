import {
  addFurnitureDefinition,
  createFurnitureDefinition,
  deleteFurnitureDefinition,
  updateFurnitureDefinition,
  type FurnitureDefinition,
  type FurnitureDefinitionInput,
  type FurnitureDefinitionUpdate
} from "@smarchitect/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AutosavedFurnitureLibrary,
  IndexedDbFurnitureLibraryRepository
} from "./project-persistence.js";

interface LibraryHistoryControls {
  canUndo: boolean;
  canRedo: boolean;
}

export interface FurnitureLibraryController {
  definitions: FurnitureDefinition[];
  history: LibraryHistoryControls;
  create(input: FurnitureDefinitionInput): Promise<boolean>;
  update(id: string, update: FurnitureDefinitionUpdate): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  navigate(direction: "undo" | "redo"): Promise<void>;
}

export function useFurnitureLibrary(
  reportError: (message: string) => void
): FurnitureLibraryController {
  const [definitions, setDefinitions] = useState<FurnitureDefinition[]>([]);
  const [history, setHistory] = useState<LibraryHistoryControls>({
    canUndo: false,
    canRedo: false
  });
  const repository = useRef(new IndexedDbFurnitureLibraryRepository());
  const autosavedLibrary = useRef<AutosavedFurnitureLibrary | undefined>(
    undefined
  );

  const refresh = useCallback((library: AutosavedFurnitureLibrary) => {
    setDefinitions(library.definitions);
    setHistory({
      canUndo: library.canUndo,
      canRedo: library.canRedo
    });
  }, []);

  useEffect(() => {
    let active = true;
    void AutosavedFurnitureLibrary.restore(repository.current)
      .then(async (restored) => {
        const library = restored
          ?? await AutosavedFurnitureLibrary.create(repository.current);
        if (!active) return;
        autosavedLibrary.current = library;
        refresh(library);
      })
      .catch(() => {
        if (active) reportError("The Item Library could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [refresh, reportError]);

  const transact = useCallback(async (
    transition: (current: FurnitureDefinition[]) => FurnitureDefinition[]
  ): Promise<boolean> => {
    try {
      const library = autosavedLibrary.current;
      if (!library) throw new Error("The Item Library is not ready.");
      await library.transact(transition);
      refresh(library);
      reportError("");
      return true;
    } catch (cause) {
      reportError(cause instanceof Error
        ? cause.message
        : "The Item Library change could not be saved.");
      return false;
    }
  }, [refresh, reportError]);

  const create = useCallback((input: FurnitureDefinitionInput) =>
    transact((current) => addFurnitureDefinition(
      current,
      createFurnitureDefinition(input)
    )), [transact]);

  const update = useCallback((id: string, update: FurnitureDefinitionUpdate) =>
    transact((current) => updateFurnitureDefinition(current, id, update)),
  [transact]);

  const remove = useCallback((id: string) =>
    transact((current) => deleteFurnitureDefinition(current, id)),
  [transact]);

  const navigate = useCallback(async (direction: "undo" | "redo") => {
    const library = autosavedLibrary.current;
    if (!library) return;
    try {
      direction === "undo" ? await library.undo() : await library.redo();
      refresh(library);
      reportError("");
    } catch {
      reportError("The Item Library history change could not be saved.");
    }
  }, [refresh, reportError]);

  return { definitions, history, create, update, remove, navigate };
}
