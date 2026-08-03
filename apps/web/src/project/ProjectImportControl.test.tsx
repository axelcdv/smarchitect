// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectImportControl } from "./ProjectImportControl.js";

afterEach(cleanup);

describe("ProjectImportControl", () => {
  it("opens the shared YAML file input from its trigger", () => {
    const importInputRef = createRef<HTMLInputElement>();
    const onImport = vi.fn();

    render(
      <ProjectImportControl
        buttonClassName="secondary-button"
        importInputRef={importInputRef}
        onImport={onImport}
      />
    );

    const input = screen.getByLabelText("Import Project Document");
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Import YAML" }));

    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute(
      "accept",
      ".yaml,.yml,application/yaml,text/yaml"
    );
    expect(input).toHaveClass("visually-hidden");
  });

  it("supports disabling the trigger", () => {
    render(
      <ProjectImportControl
        buttonClassName="secondary-button"
        disabled
        importInputRef={createRef<HTMLInputElement>()}
        onImport={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Import YAML" })
    ).toBeDisabled();
  });
});
