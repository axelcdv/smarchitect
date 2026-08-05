import {
  exportProjectArchive,
  type ProjectCheckpoint
} from "@smarchitect/core";

function safeProjectName(projectName: string): string {
  return projectName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "") || "project";
}

export function projectYamlFilename(projectName: string): string {
  return `${safeProjectName(projectName)}.yaml`;
}

export function projectArchiveFilename(projectName: string): string {
  return `${safeProjectName(projectName)}.smarchitect.zip`;
}

export function downloadProjectYaml(
  source: string,
  projectName: string
): void {
  downloadFile([source], "application/yaml", projectYamlFilename(projectName));
}

function downloadFile(parts: BlobPart[], type: string, filename: string): void {
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProjectArchive(
  source: string,
  checkpoints: readonly ProjectCheckpoint[],
  projectName: string
): void {
  const bytes = exportProjectArchive(source, checkpoints);
  downloadProjectArchiveBytes(bytes, projectName);
}

export function downloadProjectArchiveBytes(
  bytes: Uint8Array,
  projectName: string
): void {
  downloadFile(
    [bytes as Uint8Array<ArrayBuffer>],
    "application/zip",
    projectArchiveFilename(projectName)
  );
}
