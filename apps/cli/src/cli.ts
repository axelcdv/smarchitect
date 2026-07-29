import {
  ProjectValidationError,
  ProjectWorkspace,
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

Validate a Project Document from a file or standard input.
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

  if (command !== "validate" || args.length > 2) {
    dependencies.stderr(usage());
    return 2;
  }

  try {
    const source =
      input === "-"
        ? await dependencies.readStdin()
        : await dependencies.readFile(input);
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

    dependencies.stdout(
      jsonLine({
        valid: diagnostics.length === 0,
        diagnostics
      })
    );

    return diagnostics.length === 0 ? 0 : 1;
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
