// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningConflictPanel } from "./OpeningConflictPanel.js";
import { RoomLabelInspector } from "./RoomLabelInspector.js";
import {
  SelectionInspector,
  type SelectionInspectorProps
} from "./SelectionInspector.js";
import { WallInspector } from "./WallInspector.js";

afterEach(cleanup);

const workspace = ProjectWorkspace.create("Inspector tests")
  .addWall({
    start: { x: 0, y: 0 },
    end: { x: 3000, y: 0 }
  })
  .addRoomLabel({
    name: "Kitchen",
    position: { x: 1000, y: 1000 }
  });
const wall = workspace.activeLevel.walls[0]!;
const roomLabel = workspace.activeLevel.roomLabels[0]!;

describe("selected-entity inspectors", () => {
  it("dispatches Wall field edits and deletion as intents", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <WallInspector
        disabled={false}
        resetKey=""
        wall={wall}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );

    fireEvent.change(screen.getByLabelText("Wall thickness (mm)"), {
      target: { value: "220" }
    });
    fireEvent.blur(screen.getByLabelText("Wall thickness (mm)"));
    fireEvent.click(screen.getByRole("button", { name: "Delete wall" }));

    expect(onEdit).toHaveBeenCalledWith("thicknessMm", "220");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("owns Room Label fields and diagnostics", () => {
    const onEdit = vi.fn();

    render(
      <RoomLabelInspector
        diagnostics={[{
          code: "room-label.outside-room",
          severity: "warning",
          path: "/levels/0/roomLabels/0",
          message: "Kitchen is outside a detected Room."
        }]}
        disabled={false}
        resetKey=""
        roomLabel={roomLabel}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kitchen is outside a detected Room."
    );
    fireEvent.change(screen.getByLabelText("Room Label name"), {
      target: { value: "Dining" }
    });
    fireEvent.blur(screen.getByLabelText("Room Label name"));
    expect(onEdit).toHaveBeenCalledWith("name", "Dining");
  });

  it("owns Opening conflict resolution controls", () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    const opening = workspace.addOpening({
      kind: "door",
      hostWallId: wall.id,
      positionMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    }).activeLevel.openings[0]!;

    render(
      <OpeningConflictPanel
        conflict={{
          wallId: wall.id,
          update: { lengthMm: 600 },
          openingIds: [opening.id]
        }}
        disabled={false}
        openings={[opening]}
        onCancel={onCancel}
        onResolve={onResolve}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      `door ${opening.id}`
    );
    fireEvent.click(screen.getByRole("button", {
      name: "Fit openings and apply"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel wall edit" }));
    expect(onResolve).toHaveBeenCalledWith("fit");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("routes the explicit selection through one inspector boundary", () => {
    const props = {
      selection: { kind: "wall", wallId: wall.id },
      wall: {
        wall,
        disabled: false,
        resetKey: "",
        onEdit: vi.fn(),
        onDelete: vi.fn()
      },
      roomLabel: {
        diagnostics: [],
        disabled: false,
        resetKey: "",
        onEdit: vi.fn(),
        onDelete: vi.fn()
      },
      opening: {
        openings: [],
        disabled: false,
        onResolveConflict: vi.fn(),
        onCancelConflict: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn()
      },
      furniture: {
        disabled: false,
        onUpdatePlacement: vi.fn(),
        onUpdateDefinition: vi.fn(),
        onMakeUnique: vi.fn(),
        onDelete: vi.fn()
      },
      fixture: {
        disabled: false,
        onUpdatePlacement: vi.fn(),
        onUpdateDefinition: vi.fn(),
        onMakeUnique: vi.fn(),
        onDelete: vi.fn()
      }
    } satisfies SelectionInspectorProps;

    const { rerender } = render(<SelectionInspector {...props} />);
    expect(screen.getByLabelText("Selected wall properties"))
      .toBeInTheDocument();

    rerender(
      <SelectionInspector
        {...props}
        selection={{ kind: "roomLabel", roomLabelId: roomLabel.id }}
        roomLabel={{ ...props.roomLabel, roomLabel }}
        wall={{ ...props.wall, wall: undefined }}
      />
    );
    expect(screen.queryByLabelText("Selected wall properties"))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected Room Label properties"))
      .toBeInTheDocument();
  });
});
