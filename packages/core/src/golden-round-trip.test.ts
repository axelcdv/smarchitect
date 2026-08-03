import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "./index.js";

const fixtureUrl = new URL("./fixtures/authored-project-1.1.0.yaml", import.meta.url);

describe("golden concrete-syntax round trip", () => {
  it("preserves untouched authorship through operations on every MVP entity", () => {
    const source = readFileSync(fixtureUrl, "utf8");
    const imported = ProjectWorkspace.importYaml(source);
    const level = imported.activeLevel;
    const furniture = level.furniturePlacements![0]!;
    const fixture = level.fixturePlacements![0]!;
    const editedExistingState = imported
      .rename("Golden project renamed")
      .updateWall(level.walls[0]!.id, { heightMm: 2600 })
      .updateOpening(level.openings[0]!.id, { positionMm: 600 })
      .updateRoomLabel(level.roomLabels[0]!.id, { name: "Open kitchen" })
      .updateFurnitureDefinition(furniture.definitionId, { widthMm: 1700 })
      .updateFurniturePlacement(furniture.id, { rotationDeg: 15 })
      .updateFixtureDefinition(fixture.definitionId, { widthMm: 750 })
      .updateFixturePlacement(fixture.id, { elevationMm: 900 });
    const proposalWorkspace = editedExistingState.createDesignProposal("Option A");
    const proposal = proposalWorkspace.activeDesignProposal!;
    const edited = proposalWorkspace.renameDesignProposal(
      proposal.id,
      "Option A refined"
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
      "# fixture placement comment"
    ]) {
      expect(yaml).toContain(comment);
    }
    expect(yaml).toMatch(/customOrder: \[\s*third, first\s*\]/);
    expect(yaml).toContain("material: brick");
    expect(yaml).toContain("plumbingZone: A");
    expect(yaml).toContain(
      "name: Golden project renamed # project entity comment"
    );
    expect(yaml).toContain("name: Open kitchen # room label entity comment");
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
