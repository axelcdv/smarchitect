// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { setPlanBounds } from "./test/app-test-setup.js";

describe("App project lifecycle and shell integration", () => {
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
});
