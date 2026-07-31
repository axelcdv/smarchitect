// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanToolbar } from "./PlanToolbar.js";

describe("PlanToolbar", () => {
  it("reports editor commands and reflects selection-dependent controls", () => {
    const onModeChange = vi.fn();
    const onAddOpening = vi.fn();
    const onZoom = vi.fn();
    const onPan = vi.fn();

    const { rerender } = render(
      <PlanToolbar
        fixturePlacementCount={1}
        furniturePlacementCount={2}
        hasSelectedWall={false}
        isSaving={false}
        mode="draw"
        openingCount={3}
        roomCount={1}
        wallCount={2}
        onAddOpening={onAddOpening}
        onModeChange={onModeChange}
        onPan={onPan}
        onZoom={onZoom}
      />
    );

    expect(screen.getByRole("button", { name: "Draw wall" }))
      .toHaveClass("tool-active");
    expect(screen.getByRole("button", { name: "Add door" })).toBeDisabled();
    expect(screen.getByText("2 walls")).toBeInTheDocument();
    expect(screen.getByText("1 room")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Pan right" }));

    expect(onModeChange).toHaveBeenCalledWith("select");
    expect(onZoom).toHaveBeenCalledWith(.8);
    expect(onPan).toHaveBeenCalledWith("right");

    rerender(
      <PlanToolbar
        fixturePlacementCount={1}
        furniturePlacementCount={2}
        hasSelectedWall
        isSaving={false}
        mode="select"
        openingCount={3}
        roomCount={1}
        wallCount={2}
        onAddOpening={onAddOpening}
        onModeChange={onModeChange}
        onPan={onPan}
        onZoom={onZoom}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    expect(onAddOpening).toHaveBeenCalledWith("door");
  });
});
