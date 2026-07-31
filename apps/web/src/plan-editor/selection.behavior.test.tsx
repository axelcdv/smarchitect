// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App.js";
import { setPlanBounds } from "../test/app-test-setup.js";

describe("Selection", () => {
  it("keeps Opening and Fixture selection mutually exclusive in both orders", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Exclusive selection" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");
    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    await screen.findByRole("button", { name: "Door opening" });

    fireEvent.click(screen.getByRole("tab", { name: "Fixtures" }));
    fireEvent.change(screen.getByLabelText("New Fixture name"), {
      target: { value: "Radiator" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Fixture" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
    fireEvent.pointerDown(plan, { clientX: 600, clientY: 260 });
    await screen.findByLabelText("Fixture rotation (deg)");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Door opening" }), {
      clientX: 205,
      clientY: 260
    });
    expect(await screen.findByLabelText("Opening position (mm)"))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Fixture rotation (deg)"))
      .not.toBeInTheDocument();

    fireEvent.pointerDown(plan, { clientX: 600, clientY: 260 });
    expect(await screen.findByLabelText("Fixture rotation (deg)"))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Opening position (mm)"))
      .not.toBeInTheDocument();
  });
});
