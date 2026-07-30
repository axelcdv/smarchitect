export function projectYamlFilename(projectName: string): string {
  const safeName = projectName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

  return `${safeName || "project"}.yaml`;
}

export function downloadProjectYaml(
  source: string,
  projectName: string
): void {
  const blob = new Blob([source], { type: "application/yaml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = projectYamlFilename(projectName);
  anchor.click();
  URL.revokeObjectURL(url);
}
