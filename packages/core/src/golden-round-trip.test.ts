import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "./index.js";

const fixtureUrl = new URL("./fixtures/authored-project-1.1.0.yaml", import.meta.url);

describe("golden concrete-syntax round trip", () => {
  it("preserves untouched authorship through operations on every MVP entity", () => {
    const source = readFileSync(fixtureUrl, "utf8");
    const imported = ProjectWorkspace.importYaml(source);
    const level = imported.activeLevel;
    const proposal = imported.document.designProposals![0]!;
    const furniture = level.furniturePlacements![0]!;
    const fixture = level.fixturePlacements![0]!;
    const editedExistingState = imported
      .rename("Golden project renamed")
      .updateLevel({ name: "Main floor" })
      .updateWall(level.walls[0]!.id, { heightMm: 2600 })
      .updateOpening(level.openings[0]!.id, { positionMm: 600 })
      .updateRoomLabel(level.roomLabels[0]!.id, { name: "Open kitchen" })
      .updateFurnitureDefinition(furniture.definitionId, { widthMm: 1700 })
      .updateFurniturePlacement(furniture.id, { rotationDeg: 15 })
      .updateFixtureDefinition(fixture.definitionId, { widthMm: 750 })
      .updateFixturePlacement(fixture.id, { elevationMm: 900 });
    const edited = editedExistingState.renameDesignProposal(
      proposal.id,
      "Authored alternative refined"
    );
    const yaml = edited.exportYaml();

    for (const comment of [
      "# golden project comment",
      "# project entity comment",
      "# project extension comment",
      "# level entity comment",
      "# wall entity comment",
      "# room label entity comment",
      "# opening entity comment",
      "# furniture definition comment",
      "# furniture placement comment",
      "# fixture definition comment",
      "# fixture placement comment",
      "# design proposal entity comment",
      "# proposal level entity comment"
    ]) {
      expect(yaml).toContain(comment);
    }
    expect(yaml).toMatch(/customOrder: \[\s*third, first\s*\]/);
    expect(yaml).toContain("material: brick");
    expect(yaml).toContain("plumbingZone: A");
    expect(yaml).toContain("authoredOrder: preserved");
    expect(yaml).toContain("reviewStatus: authored");
    expect(yaml).toContain(
      "name: Golden project renamed # project entity comment"
    );
    expect(yaml).toContain("name: Open kitchen # room label entity comment");
    expect(yaml).toContain("name: Main floor # level entity comment");
    expect(yaml).toContain(
      "name: Authored alternative refined # design proposal entity comment"
    );
    expect(yaml).toMatch(
      /name: Main floor # level entity comment[\s\S]*id: level_00000000-0000-4000-8000-000000000002[\s\S]*walls:/
    );
    expect(yaml).toMatch(
      /name: Authored alternative refined # design proposal entity comment[\s\S]*sourceRevision: 0[\s\S]*id: design_proposal_00000000-0000-4000-8000-000000000010/
    );
    expect(yaml).toMatch(
      /name: Proposal floor # proposal level entity comment[\s\S]*id: level_00000000-0000-4000-8000-000000000011[\s\S]*walls: \[\]/
    );
    expect(yaml).toMatch(/thicknessMm: 150 # wall entity comment[\s\S]*heightMm: 2600/);
    expect(yaml).toMatch(/name: Authored table # furniture definition comment[\s\S]*widthMm: 1700/);
    expect(yaml).toMatch(/# furniture placement comment[\s\S]*rotationDeg: 15/);
    expect(yaml).toMatch(/name: Authored sink # fixture definition comment[\s\S]*widthMm: 750/);
    expect(yaml).toMatch(/# fixture placement comment[\s\S]*elevationMm: 900/);
    expect(yaml.indexOf("name: Golden project renamed"))
      .toBeLessThan(yaml.indexOf("schemaVersion:"));
    expect(ProjectWorkspace.importYaml(yaml).document).toEqual(edited.document);
  });
});
