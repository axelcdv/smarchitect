import { describe, expect, it } from "vitest";
import { ProjectHistory, ProjectWorkspace } from "./index.js";

describe("Project transaction history", () => {
  it("undoes and redoes exact semantic and YAML states for Wall operations", () => {
    const initial = ProjectWorkspace.create("Recovery home");
    const history = ProjectHistory.create(initial);
    history.transact((workspace) => workspace.addWall({
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    }));
    const addedYaml = history.workspace.exportYaml();
    const wallId = history.workspace.activeLevel.walls[0]!.id;
    history.transact((workspace) => workspace.updateWall(wallId, {
      thicknessMm: 220,
      heightMm: 2800
    }));
    const editedYaml = history.workspace.exportYaml();
    history.transact((workspace) => workspace.moveWall(wallId, { x: 400, y: 200 }));
    const movedYaml = history.workspace.exportYaml();
    history.transact((workspace) => workspace.deleteWall(wallId));

    expect(history.undo().exportYaml()).toBe(movedYaml);
    expect(history.undo().exportYaml()).toBe(editedYaml);
    expect(history.undo().exportYaml()).toBe(addedYaml);
    expect(history.undo().document).toEqual(initial.document);
    expect(history.redo().exportYaml()).toBe(addedYaml);
    expect(history.redo().exportYaml()).toBe(editedYaml);
    expect(history.redo().exportYaml()).toBe(movedYaml);
    expect(history.redo().activeLevel.walls).toEqual([]);
  });

  it("survives reload and truncates only the obsolete Redo branch", () => {
    const history = ProjectHistory.create(ProjectWorkspace.create("Branching home"));
    history.transact((workspace) => workspace.rename("First edit"));
    history.transact((workspace) => workspace.rename("Obsolete edit"));
    history.undo();

    const reloaded = ProjectHistory.restore(history.snapshot());
    expect(reloaded.workspace.document.name).toBe("First edit");
    expect(reloaded.canRedo).toBe(true);

    reloaded.transact((workspace) => workspace.rename("Replacement edit"));

    expect(reloaded.workspace.document.name).toBe("Replacement edit");
    expect(reloaded.canUndo).toBe(true);
    expect(reloaded.canRedo).toBe(false);
    expect(reloaded.undo().document.name).toBe("First edit");
    expect(reloaded.undo().document.name).toBe("Branching home");
  });

  it("does not change the active state or history when a transaction fails", () => {
    const history = ProjectHistory.create(ProjectWorkspace.create("Safe home"));
    const before = history.snapshot();

    expect(() => history.transact((workspace) => workspace.addWall({
      start: { x: 100, y: 100 },
      end: { x: 100, y: 100 }
    }))).toThrow();

    expect(history.snapshot()).toEqual(before);
    expect(history.workspace.document.name).toBe("Safe home");
    expect(history.canUndo).toBe(false);
  });
});
