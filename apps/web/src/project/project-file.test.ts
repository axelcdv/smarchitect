import { describe, expect, it } from "vitest";
import { projectYamlFilename } from "./project-file.js";

describe("projectYamlFilename", () => {
  it("normalizes a project name for a YAML download", () => {
    expect(projectYamlFilename("  Our Apartment!  ")).toBe(
      "our-apartment.yaml"
    );
  });

  it("falls back when the project name has no safe characters", () => {
    expect(projectYamlFilename("---")).toBe("project.yaml");
  });
});
