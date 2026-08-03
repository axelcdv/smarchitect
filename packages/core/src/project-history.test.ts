import { describe, expect, it } from "vitest";
import { ProjectHistory, ProjectWorkspace } from "./index.js";

describe("Project transaction history", () => {
  it("preserves authored YAML syntax and extensions across accepted edits and reloads", () => {
    const authored = `# Homeowner context stays with the document
name: Authored home
schemaVersion: 1.1.0
schemaDialect: https://json-schema.org/draft/2020-12/schema
extensions:
  https://example.com/smarchitect/notes:
    reviewedBy: homeowner
id: project_00000000-0000-4000-8000-000000000001
units: metric
levels:
  - name: Ground floor # custom level ordering
    id: level_00000000-0000-4000-8000-000000000002
    walls:
      - thicknessMm: 150 # measured on site
        id: wall_00000000-0000-4000-8000-000000000003
        path:
          start: { x: 0, y: 0 }
          kind: straight
          end: { x: 3000, y: 0 }
        extensions:
          https://example.com/smarchitect/material:
            finish: limewash
        heightMm: 2500
    baseElevationMm: 0
    extensions: {}
    defaultWallHeightMm: 2500
activeLevelId: level_00000000-0000-4000-8000-000000000002
`;
    const history = ProjectHistory.create(ProjectWorkspace.importYaml(authored));
    const wallId = history.workspace.activeLevel.walls[0]!.id;

    history.transact((workspace) => workspace.updateWall(wallId, {
      heightMm: 2800
    }));
    const edited = history.workspace.exportYaml();

    expect(edited).toContain("# Homeowner context stays with the document");
    expect(edited).toContain("name: Ground floor # custom level ordering");
    expect(edited).toContain("thicknessMm: 150 # measured on site");
    expect(edited.indexOf("name: Authored home"))
      .toBeLessThan(edited.indexOf("schemaVersion: 1.1.0"));
    expect(edited).toContain("finish: limewash");
    expect(edited).toContain("heightMm: 2800");

    const reloaded = ProjectHistory.restore(history.snapshot());
    expect(reloaded.undo().exportYaml()).toBe(authored);
    expect(reloaded.redo().exportYaml()).toBe(edited);
  });

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

  it("restores a Checkpoint as a new state without deleting later history", () => {
    const history = ProjectHistory.create(ProjectWorkspace.create("Original"));
    const checkpoint = history.workspace.exportYaml();
    history.transact((workspace) => workspace.rename("Later edit"));
    const later = history.workspace.exportYaml();

    history.restoreCheckpoint(checkpoint);

    expect(history.workspace.document.name).toBe("Original");
    expect(history.snapshot().entries).toEqual([checkpoint, later, checkpoint]);
    expect(history.undo().exportYaml()).toBe(later);
  });

  it("undoes a restore to the active state while retaining a Redo branch", () => {
    const history = ProjectHistory.create(ProjectWorkspace.create("A"));
    const checkpoint = history.workspace.exportYaml();
    history.transact((workspace) => workspace.rename("B"));
    const activeBeforeRestore = history.workspace.exportYaml();
    history.transact((workspace) => workspace.rename("C"));
    const laterHistory = history.workspace.exportYaml();
    history.undo();

    history.restoreCheckpoint(checkpoint);

    expect(history.undo().exportYaml()).toBe(activeBeforeRestore);
    expect(history.snapshot().retainedEntries).toEqual([laterHistory]);
    expect(history.undo().document.name).toBe("A");
  });
});
