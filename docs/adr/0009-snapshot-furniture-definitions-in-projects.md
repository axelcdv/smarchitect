# Snapshot Item Definitions in Project Documents

A Project Document will embed a snapshot of every Furniture Definition and Fixture Definition used by its Placements, keeping the project portable and reproducible without access to its originating Item Library. Later library edits will enter a project only through an explicit update chosen by the Homeowner rather than silently changing existing designs.

Within a project, editing an embedded Furniture Definition or Fixture Definition updates all Placements that reference it. Editing only one placement first creates a distinct copy of the definition and reassigns that placement; arbitrary per-placement dimension overrides are not stored.
