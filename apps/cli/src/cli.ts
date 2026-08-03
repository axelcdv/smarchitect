import {
  ProjectValidationError,
  ProjectWorkspace,
  previewProjectDocumentMigration,
  type Diagnostic
} from "@smarchitect/core";

export interface CliDependencies {
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
  stdout(value: string): void;
  stderr(value: string): void;
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function usage(): string {
  return `Usage:
  smarchitect validate [PROJECT_DOCUMENT|-]
  smarchitect migrate [PROJECT_DOCUMENT|-]

Validate a Project Document from a file or standard input.
Migrate a supported older document to standard output without changing the input.
`;
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies
): Promise<number> {
  const [command, input = "-"] = args;

  if (command === "--help" || command === "-h") {
    dependencies.stdout(usage());
    return 0;
  }

  if ((command !== "validate" && command !== "migrate") || args.length > 2) {
    dependencies.stderr(usage());
    return 2;
  }

  try {
    const source =
      input === "-"
        ? await dependencies.readStdin()
        : await dependencies.readFile(input);

    if (command === "migrate") {
      try {
        dependencies.stdout(previewProjectDocumentMigration(source).migratedSource);
        return 0;
      } catch (error) {
        if (!(error instanceof ProjectValidationError)) throw error;
        dependencies.stderr(jsonLine({
          migrated: false,
          diagnostics: error.diagnostics
        }));
        return 1;
      }
    }

    let diagnostics: Diagnostic[] = [];

    try {
      const workspace = ProjectWorkspace.importYaml(source);
      diagnostics = workspace.diagnostics;
    } catch (error) {
      if (!(error instanceof ProjectValidationError)) {
        throw error;
      }
      diagnostics = error.diagnostics;
    }

    const hasErrors = diagnostics.some(({ severity }) => severity === "error");
    dependencies.stdout(
      jsonLine({
        valid: !hasErrors,
        diagnostics
      })
    );

    return hasErrors ? 1 : 0;
  } catch (error) {
    dependencies.stderr(
      jsonLine({
        valid: false,
        diagnostics: [
          {
            code: "input.unreadable",
            severity: "error",
            path: input,
            message:
              error instanceof Error ? error.message : "Unable to read input."
          }
        ]
      })
    );
    return 2;
  }
}
