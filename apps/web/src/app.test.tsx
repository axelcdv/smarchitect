// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  ProjectHistory,
  ProjectWorkspace
} from "@smarchitect/core";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import {
  FailableProjectRepository,
  setPlanBounds
} from "./test/app-test-setup.js";

describe("App project lifecycle and shell integration", () => {
  it("keeps incomplete YAML as a draft and locks graphical editing", async () => {
    const repository = new FailableProjectRepository();
    const workspace = ProjectWorkspace.create("Draft-safe home");
    repository.snapshot = ProjectHistory.create(workspace).snapshot();

    render(<App projectRepository={repository} />);

    const yamlEditor = await screen.findByLabelText("Project Document YAML");
    fireEvent.change(yamlEditor, { target: { value: "schemaVersion:" } });

    expect(screen.getByText("Draft not applied")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Graphical editor locked" }))
      .toHaveTextContent(/read-only.*YAML draft/i);
    expect(screen.getByRole("button", { name: "Draw wall" })).toBeDisabled();
    expect(screen.getByLabelText("Rename project")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Apply YAML" }));

    expect(await screen.findByRole("alert", { name: "YAML diagnostics" }))
      .toHaveTextContent(/error.*\/schemaVersion.*line 1.*column/i);
    expect(screen.getByRole("heading", { name: "Draft-safe home" }))
      .toBeInTheDocument();
    expect((yamlEditor as HTMLTextAreaElement).value).toBe("schemaVersion:");
    expect(repository.snapshot?.cursor).toBe(0);
  });

  it("applies valid YAML once and supports Undo and Redo", async () => {
    const repository = new FailableProjectRepository();
    const workspace = ProjectWorkspace.create("Before YAML");
    repository.snapshot = ProjectHistory.create(workspace).snapshot();

    render(<App projectRepository={repository} />);

    const yamlEditor = await screen.findByLabelText("Project Document YAML");
    fireEvent.change(yamlEditor, {
      target: { value: workspace.rename("After YAML").exportYaml() }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply YAML" }));

    expect(await screen.findByRole("heading", { name: "After YAML" }))
      .toBeInTheDocument();
    expect(repository.snapshot?.cursor).toBe(1);
    expect(screen.getByText("Valid YAML")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draw wall" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("heading", { name: "Before YAML" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(await screen.findByRole("heading", { name: "After YAML" }))
      .toBeInTheDocument();
  });

  it.each(["schema", "semantic"] as const)(
    "rejects a complete YAML document with a %s failure atomically",
    async (failure) => {
      const repository = new FailableProjectRepository();
      const workspace = ProjectWorkspace.create("Atomic rejection");
      repository.snapshot = ProjectHistory.create(workspace).snapshot();
      const source = failure === "schema"
        ? workspace.exportYaml().replace(/^id: .+\n/m, "")
        : workspace.exportYaml().replace(
          /^activeLevelId: .+$/m,
          "activeLevelId: level_00000000-0000-4000-8000-000000000099"
        );
      const expectedPath = failure === "schema" ? "/id" : "/activeLevelId";

      render(<App projectRepository={repository} />);
      const yamlEditor = await screen.findByLabelText("Project Document YAML");
      fireEvent.change(yamlEditor, { target: { value: source } });
      fireEvent.click(screen.getByRole("button", { name: "Apply YAML" }));

      expect(await screen.findByRole("alert", { name: "YAML diagnostics" }))
        .toHaveTextContent(expectedPath);
      expect(screen.getByRole("heading", { name: "Atomic rejection" }))
        .toBeInTheDocument();
      expect(yamlEditor).toHaveValue(source);
      await waitFor(() => expect(repository.snapshot?.draft).toBe(source));
      expect(repository.snapshot?.cursor).toBe(0);
      expect(repository.snapshot?.entries).toHaveLength(1);
    }
  );

  it("recovers an invalid YAML draft after reload", async () => {
    const repository = new FailableProjectRepository();
    const workspace = ProjectWorkspace.create("Reload-safe home");
    repository.snapshot = ProjectHistory.create(workspace).snapshot();
    const first = render(<App projectRepository={repository} />);
    const yamlEditor = await screen.findByLabelText("Project Document YAML");

    fireEvent.change(yamlEditor, { target: { value: "invalid: [yaml" } });
    await waitFor(() => expect(repository.snapshot?.draft)
      .toBe("invalid: [yaml"));
    first.unmount();
    render(<App projectRepository={repository} />);

    expect(await screen.findByLabelText("Project Document YAML"))
      .toHaveValue("invalid: [yaml");
    expect(screen.getByText("Draft not applied")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reload-safe home" }))
      .toBeInTheDocument();
  });

  it("creates, renames, and exposes a single-Level Project Document", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Our apartment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("heading", {
      name: "Our apartment"
    })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ground floor" })
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("name: Our apartment");

    const renameProject = screen.getByLabelText("Rename project");
    await waitFor(() => expect(renameProject).toBeEnabled());
    fireEvent.change(renameProject, {
      target: { value: "Kitchen remodel" }
    });
    fireEvent.blur(renameProject);

    expect(await screen.findByRole("heading", {
      name: "Kitchen remodel"
    })).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("name: Kitchen remodel");
    expect(
      screen.getByText(/early-stage space planning/i)
    ).toBeInTheDocument();
  });

  it("restores a persisted Project and its history on mount", async () => {
    const repository = new FailableProjectRepository();
    const original = ProjectWorkspace.create("Recovered apartment");
    const history = ProjectHistory.create(original);
    history.accept(original.addWall({
      start: { x: 0, y: 0 },
      end: { x: 3600, y: 0 }
    }));
    repository.snapshot = history.snapshot();

    render(<App projectRepository={repository} />);

    expect(await screen.findByRole("heading", {
      name: "Recovered apartment"
    })).toBeInTheDocument();
    expect(screen.getByText("1 wall")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("x: 3600");
  });

  it("imports a Project Document and exports it as YAML", async () => {
    const yaml = ProjectWorkspace.create("Imported apartment").exportYaml();
    const file = new File([yaml], "apartment.yaml", {
      type: "application/yaml"
    });
    Object.defineProperty(file, "text", {
      value: async () => yaml
    });
    const createObjectUrl = vi.fn(() => "blob:project-document");
    const revokeObjectUrl = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Import Project Document"), {
      target: { files: [file] }
    });

    expect(
      await screen.findByRole("heading", { name: "Imported apartment" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export YAML" }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:project-document");
  });

  it("creates, selects, renames, stales, deletes, and restores Design Proposals", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Proposal project" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");

    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Open kitchen" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("1 proposals");
    expect(screen.getByText("Design Proposal")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Rename Design Proposal"), {
      target: { value: "Kitchen and dining" }
    });
    await screen.findByRole("button", { name: /Kitchen and dining/ });

    fireEvent.click(screen.getByRole("button", {
      name: /^Existing StateRevision/
    }));
    await waitFor(() =>
      expect(screen.queryByText("Design Proposal")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    const wallLength = await screen.findByLabelText("Wall length (mm)");
    fireEvent.change(wallLength, {
      target: { value: "4200" }
    });
    fireEvent.blur(wallLength);
    await waitFor(() =>
      expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(4200));

    fireEvent.click(screen.getByRole("button", {
      name: /Kitchen and dining/
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /proposal is stale/i
    );
    expect(screen.getByText("1 wall")).toBeInTheDocument();
    expect(screen.queryByLabelText("Wall length (mm)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Delete Design Proposal"
    }));
    await waitFor(() => expect(screen.getByText("0 proposals")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", {
      name: /Kitchen and dining/
    })).toBeInTheDocument();
  });

  it("resolves Opening conflicts while editing a Design Proposal", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Proposal opening conflicts" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");
    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    await screen.findByText("1 opening");
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Short wall" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("Design Proposal");
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });

    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "600" }
    });
    fireEvent.blur(screen.getByLabelText("Wall length (mm)"));
    const resolution = await screen.findByRole("alert", {
      name: "Opening conflict resolution"
    });
    expect(resolution).toHaveTextContent("door opening_");
    fireEvent.click(screen.getByRole("button", {
      name: "Fit openings and apply"
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(600);
      expect((screen.getByLabelText(
        "Project Document YAML"
      ) as HTMLTextAreaElement).value).toContain("widthMm: 600");
      expect(screen.queryByRole("alert", {
        name: "Opening conflict resolution"
      })).not.toBeInTheDocument();
    });
  });

  it("keeps editor selection when plan and history persistence fail", async () => {
    const repository = new FailableProjectRepository();
    render(<App projectRepository={repository} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Durable selection" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByLabelText("Wall length (mm)");

    repository.failSaving = true;
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Rejected proposal" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    expect(await screen.findByText("Autosave failed: storage unavailable"))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Wall length (mm)")).toBeInTheDocument();

    const saveAttempts = repository.saveAttempts;
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(repository.saveAttempts)
      .toBe(saveAttempts + 1));
    expect(screen.getByLabelText("Wall length (mm)")).toBeInTheDocument();
  });

  it("does not reset an inspector draft when persistence errors change", async () => {
    const repository = new FailableProjectRepository();
    render(<App projectRepository={repository} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Durable inspector draft" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByLabelText("Wall length (mm)");
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Draft plan" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("Design Proposal");

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    const length = await screen.findByLabelText("Wall length (mm)");
    fireEvent.change(length, { target: { value: "4200" } });
    expect(length).toHaveValue(4200);

    repository.failSaving = true;
    fireEvent.change(screen.getByLabelText("Rename Design Proposal"), {
      target: { value: "Rejected rename" }
    });
    expect(await screen.findByText("Autosave failed: storage unavailable"))
      .toBeInTheDocument();
    expect(length).toHaveValue(4200);
  });
});
