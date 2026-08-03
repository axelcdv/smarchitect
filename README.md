# Smarchitect

Smarchitect is an open-format home-remodelling planner. This first tracer
creates a local, metric Project Document with one Level, exposes its YAML, and
validates the same document model in the browser and command line.

> Smarchitect supports early-stage space planning. Its output is not permit,
> engineering, or construction documentation.

## Develop

The repository uses Node.js and pnpm.

```sh
pnpm install
pnpm dev
```

Open the Vite URL in Chrome. The current UI can create and rename a project,
show the active Level, and import or export YAML.

Run all checks with:

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Project Document CLI

Build the packages, then validate a file:

```sh
pnpm build
pnpm --filter @smarchitect/cli start -- validate project.yaml
```

Use `-` to read from standard input:

```sh
pnpm --filter @smarchitect/cli start -- validate - < project.yaml
```

Inspect the complete semantic document through a file or standard input:

```sh
pnpm --filter @smarchitect/cli start -- inspect project.yaml
pnpm --filter @smarchitect/cli start -- inspect - < project.yaml
```

Apply a deterministic, provider-neutral operation batch. The result goes to
standard output unless `--output` selects a file:

```sh
pnpm --filter @smarchitect/cli start -- apply project.yaml \
  --operations examples/ai-operations.json --output updated-project.yaml
```

The batch is atomic. If any operation fails, no result is written, including
when the selected output path is also the input path. The versioned JSON format,
complete operation catalogue, output contracts, and deterministic examples are
documented in [`docs/cli.md`](docs/cli.md).

Commands use exit status `0` for success, `1` for invalid documents, migrations,
or domain operations, and `2` for usage, input, or output errors. Diagnostics are
JSON objects with stable `code`, `severity`, `path`, and `message` fields.

Supported older documents can be previewed and migrated explicitly without
changing the input file:

```sh
pnpm --filter @smarchitect/cli start -- migrate legacy-project.yaml --preview
pnpm --filter @smarchitect/cli start -- migrate legacy-project.yaml > migrated-project.yaml
```

## Open format

The authoritative JSON Schema is
[`packages/core/src/project-document.schema.json`](packages/core/src/project-document.schema.json).
It uses JSON Schema Draft 2020-12. The YAML representation is designed for
source control and manual or AI-assisted editing; imports reject YAML aliases,
anchors, and custom tags so a document remains explicit. Third-party data must
live in an `extensions` map keyed by a globally namespaced absolute URI.
Current documents declare both `schemaVersion: 1.1.0` and
`schemaDialect: https://json-schema.org/draft/2020-12/schema`. Version 1.0.0 is
accepted only through the preview-and-confirm migration flow; unsupported newer
versions are never rewritten.
