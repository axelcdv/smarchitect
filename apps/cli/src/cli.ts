import {
  ProjectValidationError,
  ProjectWorkspace,
  previewProjectDocumentMigration,
  type Diagnostic
} from "@smarchitect/core";
import {
  OperationBatchError,
  applyOperationBatch,
  parseOperationBatch
} from "./operations.js";

export interface CliDependencies {
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
  writeFile?(path: string, value: string): Promise<void>;
  stdout(value: string): void;
  stderr(value: string): void;
}

type Command = "validate" | "inspect" | "apply" | "migrate";

interface CliOptions {
  command: Command;
  input: string;
  operations?: string;
  output: string;
  preview: boolean;
}

class CliUsageError extends Error {}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function usage(): string {
  return `Usage:
  smarchitect validate [PROJECT_DOCUMENT|-]
  smarchitect inspect [PROJECT_DOCUMENT|-]
  smarchitect apply [PROJECT_DOCUMENT|-] --operations OPERATIONS.json [--output RESULT|-]
  smarchitect migrate [PROJECT_DOCUMENT|-] [--preview] [--output RESULT|-]

PROJECT_DOCUMENT and OPERATIONS.json may each be a file or standard input, but
they cannot both use standard input. Apply and migrate write YAML to standard
output by default. --preview emits migration metadata as JSON without writing.
`;
}

function parseArgs(args: string[]): CliOptions | "help" {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return "help";
  }
  const commandArgument = args[0];
  if (
    commandArgument !== "validate"
    && commandArgument !== "inspect"
    && commandArgument !== "apply"
    && commandArgument !== "migrate"
  ) {
    throw new CliUsageError("A supported command is required.");
  }
  const command: Command = commandArgument;

  let input = "-";
  let operations: string | undefined;
  let output = "-";
  let preview = false;
  let inputSeen = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--operations" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`${argument} requires a path or \"-\".`);
      }
      if (argument === "--operations") operations = value;
      else output = value;
      index += 1;
    } else if (argument === "--preview") {
      preview = true;
    } else if (argument.startsWith("-") && argument !== "-") {
      throw new CliUsageError(`Unknown option \"${argument}\".`);
    } else if (!inputSeen) {
      input = argument;
      inputSeen = true;
    } else {
      throw new CliUsageError(`Unexpected argument \"${argument}\".`);
    }
  }

  if (
    (command === "validate" || command === "inspect")
    && (operations || output !== "-" || preview)
  ) {
    throw new CliUsageError(
      `${command} does not accept output or operation options.`
    );
  }
  if (command === "apply" && !operations) {
    throw new CliUsageError("apply requires --operations.");
  }
  if (command !== "apply" && operations) {
    throw new CliUsageError("--operations is supported only by apply.");
  }
  if (command !== "migrate" && preview) {
    throw new CliUsageError("--preview is supported only by migrate.");
  }
  if (preview && output !== "-") {
    throw new CliUsageError("--preview does not write an output file.");
  }
  if (command === "apply" && input === "-" && operations === "-") {
    throw new CliUsageError("The document and operation batch cannot both use standard input.");
  }
  return { command, input, operations, output, preview };
}

async function readInput(
  path: string,
  dependencies: CliDependencies
): Promise<string> {
  return path === "-"
    ? dependencies.readStdin()
    : dependencies.readFile(path);
}

async function writeYaml(
  source: string,
  options: CliOptions,
  dependencies: CliDependencies,
  result: Record<string, unknown>
): Promise<void> {
  if (options.output === "-") {
    dependencies.stdout(source);
    return;
  }
  if (!dependencies.writeFile) {
    throw new Error("This CLI environment cannot write output files.");
  }
  await dependencies.writeFile(options.output, source);
  dependencies.stdout(jsonLine({ ...result, output: options.output }));
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === "error");
}

function errorDiagnostic(
  code: string,
  path: string,
  error: unknown
): Diagnostic {
  return {
    code,
    severity: "error",
    path,
    message: error instanceof Error ? error.message : "Unknown error."
  };
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies
): Promise<number> {
  let options: CliOptions;
  try {
    const parsed = parseArgs(args);
    if (parsed === "help") {
      dependencies.stdout(usage());
      return 0;
    }
    options = parsed;
  } catch (error) {
    dependencies.stderr(jsonLine({
      ok: false,
      diagnostics: [errorDiagnostic("usage.invalid", "", error)],
      usage: usage()
    }));
    return 2;
  }

  let source: string;
  try {
    source = await readInput(options.input, dependencies);
  } catch (error) {
    dependencies.stderr(jsonLine({
      ok: false,
      diagnostics: [errorDiagnostic("input.unreadable", options.input, error)]
    }));
    return 2;
  }

  if (options.command === "validate" || options.command === "inspect") {
    try {
      const workspace = ProjectWorkspace.importYaml(source);
      const diagnostics = workspace.diagnostics;
      if (options.command === "inspect") {
        dependencies.stdout(jsonLine({
          ok: !hasErrors(diagnostics),
          document: workspace.document,
          activePlan: workspace.activePlanSelection,
          activeLevel: workspace.activeLevel,
          rooms: workspace.rooms,
          diagnostics
        }));
      } else {
        dependencies.stdout(jsonLine({
          ok: !hasErrors(diagnostics),
          valid: !hasErrors(diagnostics),
          diagnostics
        }));
      }
      return hasErrors(diagnostics) ? 1 : 0;
    } catch (error) {
      const diagnostics = error instanceof ProjectValidationError
        ? error.diagnostics
        : [errorDiagnostic("document.invalid", "", error)];
      dependencies.stdout(jsonLine({
        ok: false,
        ...(options.command === "validate" ? { valid: false } : {}),
        diagnostics
      }));
      return 1;
    }
  }

  if (options.command === "migrate") {
    try {
      const migration = previewProjectDocumentMigration(source);
      if (options.preview) {
        dependencies.stdout(jsonLine({
          ok: true,
          migration: {
            sourceVersion: migration.sourceVersion,
            targetVersion: migration.targetVersion,
            schemaDialect: migration.schemaDialect,
            changes: migration.changes
          },
          document: migration.document,
          diagnostics: []
        }));
      } else {
        await writeYaml(migration.migratedSource, options, dependencies, {
          ok: true,
          migrated: true,
          sourceVersion: migration.sourceVersion,
          targetVersion: migration.targetVersion
        });
      }
      return 0;
    } catch (error) {
      const diagnostics = error instanceof ProjectValidationError
        ? error.diagnostics
        : [errorDiagnostic("output.unwritable", options.output, error)];
      dependencies.stderr(jsonLine({ ok: false, migrated: false, diagnostics }));
      return error instanceof ProjectValidationError ? 1 : 2;
    }
  }

  let operationSource: string;
  try {
    operationSource = await readInput(options.operations!, dependencies);
  } catch (error) {
    dependencies.stderr(jsonLine({
      ok: false,
      applied: false,
      diagnostics: [errorDiagnostic(
        "input.unreadable",
        options.operations!,
        error
      )]
    }));
    return 2;
  }

  let result: ReturnType<typeof applyOperationBatch>;
  try {
    result = applyOperationBatch(source, parseOperationBatch(operationSource));
  } catch (error) {
    const diagnostics = error instanceof ProjectValidationError
      ? error.diagnostics
      : [errorDiagnostic(
          error instanceof OperationBatchError
            ? "operation.invalid"
            : "operations.invalid",
          error instanceof OperationBatchError
            ? `/${error.operationIndex}`
            : options.operations!,
          error
        )];
    dependencies.stderr(jsonLine({
      ok: false,
      applied: false,
      ...(error instanceof OperationBatchError
        ? { failedOperation: error.operationIndex }
        : {}),
      diagnostics
    }));
    return 1;
  }

  try {
    await writeYaml(result.workspace.exportYaml(), options, dependencies, {
      ok: true,
      applied: result.applied,
      diagnostics: result.workspace.diagnostics
    });
    return 0;
  } catch (error) {
    dependencies.stderr(jsonLine({
      ok: false,
      applied: false,
      diagnostics: [errorDiagnostic("output.unwritable", options.output, error)]
    }));
    return 2;
  }
}
