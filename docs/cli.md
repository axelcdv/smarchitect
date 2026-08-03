# Provider-neutral Project Document CLI

The `smarchitect` executable is a deterministic adapter over the same Project
Workspace, validation, migration, geometry, and YAML-preserving domain operations
used by the browser. It stores no hidden project state and has no model-provider
dependency.

Build it once with `pnpm build`, then run it through
`pnpm --filter @smarchitect/cli start -- <arguments>`.

## Commands and output

- `validate [PROJECT|-]` emits JSON containing `ok`, `valid`, and `diagnostics`.
- `inspect [PROJECT|-]` emits JSON containing the complete semantic `document`,
  active plan and Level, derived Rooms, and diagnostics.
- `apply [PROJECT|-] --operations BATCH|- [--output RESULT|-]` applies a complete
  batch atomically. YAML goes to standard output by default. With a file output,
  the command writes the YAML once after every operation succeeds and emits a
  JSON receipt to standard output.
- `migrate [PROJECT|-] --preview` emits the source/target versions, changes, and
  complete migrated semantic document without writing anything.
- `migrate [PROJECT|-] [--output RESULT|-]` writes migrated YAML. The original is
  never changed unless it is explicitly selected as the output path, and even
  then writing occurs only after migration and validation succeed.

The Project Document and operation batch cannot both use standard input.
Successful commands exit `0`, document/domain failures exit `1`, and usage or
I/O failures exit `2`. Error output is JSON and diagnostics use stable `code`,
`severity`, `path`, and `message` fields. Validation errors may additionally
carry one-based `line` and `column` locations.

## Version 1 operation batches

Use a versioned JSON object. Supply an ISO 8601 `timestamp` when Existing State
operations must produce byte-for-byte deterministic revision metadata:

```json
{
  "version": 1,
  "timestamp": "2026-08-03T12:00:00.000Z",
  "operations": [
    {
      "op": "wall.add",
      "id": "wall_00000000-0000-4000-8000-000000000101",
      "input": {
        "start": { "x": 0, "y": 0 },
        "end": { "x": 4000, "y": 0 },
        "heightMm": 2500,
        "thicknessMm": 150
      }
    },
    {
      "op": "opening.add",
      "id": "opening_00000000-0000-4000-8000-000000000102",
      "input": {
        "kind": "passage",
        "hostWallId": "wall_00000000-0000-4000-8000-000000000101",
        "positionMm": 500,
        "widthMm": 900,
        "heightMm": 2100
      }
    }
  ]
}
```

Create operations require caller-selected stable IDs, so later operations in
the same batch can safely reference them. Operations execute in array order:

- Project and Level: `project.rename`, `level.update`.
- Walls: `wall.add`, `wall.update`, `wall.updateResolvingOpenings`,
  `wall.delete`. The resolving variant requires `resolution: "fit"` or
  `resolution: "delete"`.
- Openings: `opening.add`, `opening.update`, `opening.delete`.
- Room Labels: `roomLabel.add`, `roomLabel.update`, `roomLabel.delete`.
- Furniture: `furniture.place`, `furniture.updatePlacement`,
  `furniture.updateDefinition`, `furniture.makePlacementUnique`,
  `furniture.deletePlacement`.
- Fixtures: `fixture.place`, `fixture.updatePlacement`,
  `fixture.updateDefinition`, `fixture.makePlacementUnique`,
  `fixture.deletePlacement`.
- Design Proposals: `proposal.create`, `proposal.rename`, `proposal.select`,
  `proposal.delete`, and `existingState.select`.

`furniture.place` and `fixture.place` carry the complete embedded definition and
placement input. This keeps the Project Document portable and follows the same
embedded-snapshot rule as the graphical application. Updates use the public
Project Workspace input shapes in the JSON Schema vocabulary.

The two `makePlacementUnique` operations require `id` for the Placement and a
caller-selected `newDefinitionId`, making copy-on-write definition editing as
deterministic as other create operations.

If operation `n` fails, the diagnostic path is `/<n>`, `failedOperation` is `n`,
and the command writes no YAML. Since Project Workspace values are immutable,
earlier successful operations in that in-memory batch cannot leak into the
original document.

[`examples/ai-operations.json`](../examples/ai-operations.json) is a complete,
provider-independent batch that creates and edits every MVP plan entity. Running
the same source document, timestamp, and batch produces the same result.
