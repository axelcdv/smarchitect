import type {
  FixtureDefinition,
  FurnitureDefinition,
  ProjectWorkspace
} from "@smarchitect/core";
import {
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import {
  PlanEditor,
  type PlanEditorHandle
} from "../plan-editor/PlanEditor.js";
import type { ItemLibraryController } from "../use-item-library.js";

const unsupportedLibraryMutation = async (): Promise<boolean> => false;

function testLibrary(
  furnitureDefinitions: FurnitureDefinition[],
  fixtureDefinitions: FixtureDefinition[]
): ItemLibraryController {
  return {
    isSaving: false,
    furnitureDefinitions,
    fixtureDefinitions,
    history: { canUndo: false, canRedo: false },
    createFurniture: unsupportedLibraryMutation,
    createFixture: unsupportedLibraryMutation,
    updateFurniture: unsupportedLibraryMutation,
    updateFixture: unsupportedLibraryMutation,
    removeFurniture: unsupportedLibraryMutation,
    removeFixture: unsupportedLibraryMutation,
    navigate: async () => undefined
  };
}

export function PlanEditorTestHarness({
  initialWorkspace,
  furnitureDefinitions = [],
  fixtureDefinitions = []
}: {
  initialWorkspace: ProjectWorkspace;
  furnitureDefinitions?: FurnitureDefinition[];
  fixtureDefinitions?: FixtureDefinition[];
}) {
  const [{ entries, cursor }, updateHistory] = useReducer((
    state: { entries: ProjectWorkspace[]; cursor: number },
    action:
      | { kind: "commit"; workspace: ProjectWorkspace }
      | { kind: "navigate"; direction: "undo" | "redo" }
  ) => {
    if (action.kind === "commit") {
      return {
        entries: [
          ...state.entries.slice(0, state.cursor + 1),
          action.workspace
        ],
        cursor: state.cursor + 1
      };
    }
    return {
      ...state,
      cursor: action.direction === "undo"
        ? Math.max(0, state.cursor - 1)
        : Math.min(state.entries.length - 1, state.cursor + 1)
    };
  }, {
    entries: [initialWorkspace],
    cursor: 0
  });
  const [operationError, setOperationError] = useState("");
  const editor = useRef<PlanEditorHandle>(null);
  const workspace = entries[cursor]!;
  const library = useMemo(
    () => testLibrary(furnitureDefinitions, fixtureDefinitions),
    [fixtureDefinitions, furnitureDefinitions]
  );

  async function commit(
    next: ProjectWorkspace
  ): Promise<ProjectWorkspace> {
    updateHistory({ kind: "commit", workspace: next });
    return next;
  }

  function navigate(direction: "undo" | "redo"): void {
    updateHistory({ kind: "navigate", direction });
    editor.current?.clearSelection();
  }

  return (
    <>
      <nav aria-label="Test project history">
        <button
          disabled={cursor === 0}
          onClick={() => navigate("undo")}
        >
          Undo
        </button>
        <button
          disabled={cursor === entries.length - 1}
          onClick={() => navigate("redo")}
        >
          Redo
        </button>
      </nav>
      <PlanEditor
        ref={editor}
        isSaving={false}
        isTransitionPending={() => false}
        library={library}
        operationError={operationError}
        workspace={workspace}
        onCommit={commit}
        onOperationError={setOperationError}
      />
      <textarea
        aria-label="Project Document YAML"
        readOnly
        value={workspace.exportYaml()}
      />
    </>
  );
}
