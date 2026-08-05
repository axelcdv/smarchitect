// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "./WorkspaceHeader.js";

describe("WorkspaceHeader", () => {
  it("explains when persistent browser storage cannot be requested", () => {
    render(
      <WorkspaceHeader
        canRedo={false}
        canUndo={false}
        checkpoints={[]}
        importInputRef={{ current: null }}
        isDesignProposal={false}
        isEditingLocked={false}
        isSaving={false}
        projectName="Offline home"
        storagePersistence="unavailable"
        writerState="writer"
        yaml=""
        onImport={vi.fn()}
        onNavigateHistory={vi.fn()}
        onTakeOver={vi.fn()}
      />
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Storage protection unavailable; export archives regularly"
    );
  });
});
