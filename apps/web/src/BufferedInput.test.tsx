// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferedInput } from "./BufferedInput.js";

afterEach(cleanup);

describe("BufferedInput", () => {
  it("cancels an edited draft with Escape without committing it", () => {
    const onCommit = vi.fn();
    render(
      <BufferedInput aria-label="Length" value={3000} onCommit={onCommit} />
    );
    const input = screen.getByLabelText("Length");

    input.focus();
    fireEvent.change(input, { target: { value: "4200" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("3000");
  });

  it("restores the authoritative value after a rejected commit", () => {
    const onCommit = vi.fn();
    render(
      <BufferedInput aria-label="Length" value={3000} onCommit={onCommit} />
    );
    const input = screen.getByLabelText("Length");

    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("invalid");
    expect(input).toHaveValue("3000");
  });
});
