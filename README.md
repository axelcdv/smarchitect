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

## Validate a Project Document

Build the packages, then validate a file:

```sh
pnpm build
pnpm --filter @smarchitect/cli start -- validate project.yaml
```

Use `-` to read from standard input:

```sh
pnpm --filter @smarchitect/cli start -- validate - < project.yaml
```

The command prints JSON diagnostics and exits with `0` for a valid document,
`1` for an invalid document, and `2` for usage or input errors.

## Open format

The authoritative JSON Schema is
[`packages/core/src/project-document.schema.json`](packages/core/src/project-document.schema.json).
It uses JSON Schema Draft 2020-12. The YAML representation is designed for
source control and manual or AI-assisted editing; imports reject YAML aliases,
anchors, and custom tags so a document remains explicit. Third-party data must
live in an `extensions` map keyed by a globally namespaced absolute URI.
