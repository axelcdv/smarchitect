# Home Remodeling Planner MVP

## Problem Statement

Homeowners exploring a remodel need to understand whether alternative layouts will fit their real home before paying for professional design and construction work. Existing home-planning products often hide project data in proprietary formats, make exact manual corrections awkward, and offer no dependable interface for AI tools.

A Homeowner needs one approachable application in which they can accurately describe the Existing State, create independent Design Proposals, place Furniture and Fixtures, and recover earlier work. The plan must remain understandable and editable outside the graphical interface. It must not pretend to produce permit-ready, construction-grade, or structural-engineering output.

## Solution

Build a desktop-first, local-first web application for early-stage home-remodeling exploration. The Homeowner draws a single-Level plan graphically or edits its synchronized YAML Project Document. Walls are authoritative; Openings attach to Walls; Rooms are inferred; and Furniture and Fixtures come from an editable Item Library.

The application continuously autosaves accepted edits, persists Undo and Redo across sessions, and lets the Homeowner create immutable project-wide Checkpoints. A plain YAML Project Document carries the current state, while an open ZIP-based Project Archive carries the current document and named Checkpoints.

The Project Document is the single source of truth for the graphical editor, manual editing, and AI tooling. A published JSON Schema and a provider-neutral headless CLI allow independent tools and AI agents to validate, inspect, migrate, and atomically modify projects. The MVP requires no account or backend, works offline after its first load, and guarantees compatibility with the current and previous major Chrome releases.

## User Stories

1. As a Homeowner, I want to start a remodeling project without creating an account, so that I can explore an idea immediately.
2. As a Homeowner, I want my project to remain on my device by default, so that I retain control over my home data.
3. As a Homeowner, I want the editor to keep working after I lose connectivity, so that a network outage does not interrupt planning.
4. As a Homeowner, I want to name a project, so that I can distinguish it from my other remodeling projects.
5. As a Homeowner, I want to describe the Existing State separately from imagined changes, so that I always retain an accurate baseline.
6. As a Homeowner, I want to create a Design Proposal by cloning the Existing State, so that I can explore changes without altering the baseline.
7. As a Homeowner, I want to create several independent Design Proposals, so that I can retain alternative ideas.
8. As a Homeowner, I want to rename a Design Proposal, so that each alternative has a meaningful identity.
9. As a Homeowner, I want to select one Design Proposal for editing, so that the workspace remains focused.
10. As a Homeowner, I want to delete a Design Proposal, so that obsolete alternatives do not clutter the project.
11. As a Homeowner, I want a proposal to remain unchanged when the Existing State is corrected, so that my design intent is never silently rewritten.
12. As a Homeowner, I want to see when a proposal predates an Existing State correction, so that I understand that its baseline is stale.
13. As a Homeowner, I want a stale proposal indicator to show its source revision and date, so that I can decide whether to retain it or start again.
14. As a Homeowner, I want to draw straight Walls at arbitrary angles, so that I can represent ordinary single-Level homes.
15. As a Homeowner, I want Walls to have physical thickness, so that the plan represents usable space rather than abstract lines.
16. As a Homeowner, I want Walls to have height, so that the plan can support vertical placement and future 3D visualization.
17. As a Homeowner, I want to enter Wall coordinates, length, angle, thickness, and height numerically, so that the plan matches my measurements.
18. As a Homeowner, I want graphical snapping for common angles and nearby Wall contacts, so that precise drawing is convenient.
19. As a Homeowner, I want intersecting and touching Walls to form junctions automatically, so that I do not maintain technical junction objects.
20. As a Homeowner, I want the plan to infer Rooms from enclosed Walls, so that Room shapes cannot drift away from their boundaries.
21. As a Homeowner, I want to place a Room Label inside an enclosed space, so that I can name and describe the Room.
22. As a Homeowner, I want a Room Label to remain with the space containing it when a Room is split, so that ordinary topology edits preserve meaning.
23. As a Homeowner, I want the editor to ask what to do when merged spaces contain multiple Room Labels, so that it does not silently discard Room information.
24. As a Homeowner, I want to add a hinged Door to a Wall, so that the plan shows its position, size, hinge side, and swing.
25. As a Homeowner, I want to add a sliding Door to a Wall, so that sliding layouts can be explored.
26. As a Homeowner, I want to add a fixed, hinged, or sliding Window to a Wall, so that the plan represents the home’s natural-light Openings.
27. As a Homeowner, I want Windows to include width, height, and sill height, so that their vertical position is explicit.
28. As a Homeowner, I want to add an unfilled Passage to a Wall, so that open connections between Rooms are represented without pretending they contain a Door.
29. As a Homeowner, I want an Opening to remain hosted within its Wall, so that the Project Document cannot contain physically meaningless references.
30. As a Homeowner, I want Doors and Windows rendered schematically rather than as manufacturer products, so that early planning stays simple.
31. As a Homeowner, I want an editable Item Library, so that I can reuse the Furniture and Fixtures relevant to my home.
32. As a Homeowner, I want to create a Furniture Definition with a name, width, depth, and height, so that I can represent a movable item.
33. As a Homeowner, I want to create a Fixture Definition with a name, width, depth, and height, so that I can represent an installed cabinet, sink, toilet, or radiator.
34. As a Homeowner, I want to edit an Item Library definition, so that its dimensions match the real item.
35. As a Homeowner, I want to place Furniture in the Existing State or a Design Proposal, so that I can evaluate layouts.
36. As a Homeowner, I want to place Fixtures in the Existing State or a Design Proposal, so that I can explore installed arrangements.
37. As a Homeowner, I want to position and rotate a Furniture Placement or Fixture Placement numerically or graphically, so that placement can be both quick and exact.
38. As a Homeowner, I want to set an item’s elevation above the finished floor, so that wall-mounted cupboards and other raised items are represented.
39. As a Homeowner, I want floor-standing items to default to zero elevation, so that common placement requires no vertical setup.
40. As a Homeowner, I want editing an embedded definition to update every Placement of that definition in the project, so that identical items remain consistent.
41. As a Homeowner, I want to make one Placement unique before resizing it, so that a one-off item does not alter its siblings.
42. As a Homeowner, I want Item Library changes to enter an existing project only when I explicitly request them, so that old layouts remain reproducible.
43. As a Homeowner, I want each project to embed the definitions it uses, so that the project remains portable without my Item Library.
44. As a Homeowner, I want geometric conflicts such as overlapping items to appear as warnings, so that unfinished exploratory states remain editable.
45. As a Homeowner, I want broken references and impossible dimensions to be hard errors, so that accepted project state remains structurally valid.
46. As a Homeowner, I want the plan to use metric measurements by default, so that initial versions match my expected units.
47. As a Homeowner, I want coordinates and dimensions to remain exact through repeated edits, so that numerical drift does not corrupt measurements.
48. As a Homeowner, I want the graphical editor to display dimensions derived from the authoritative geometry, so that I can inspect accuracy.
49. As a Homeowner, I want to pan and zoom a crisp vector plan, so that both whole-home and detailed edits are comfortable.
50. As a Homeowner, I want ordinary editing to remain fluid on a recent laptop for a large single-Level plan, so that the tool remains usable for realistic homes.
51. As a Homeowner, I want every accepted edit to autosave, so that a crash or reload does not lose work.
52. As a Homeowner, I want Undo and Redo history to survive browser reloads, so that I can recover mistakes noticed in a later session.
53. As a Homeowner, I want one graphical operation to be one undoable action, so that history matches my intent.
54. As a Homeowner, I want one applied YAML draft or AI operation batch to be one undoable action, so that external edits can be reverted atomically.
55. As a Homeowner, I want to create an immutable named Checkpoint, so that I can mark a meaningful project milestone.
56. As a Homeowner, I want a Checkpoint to capture the complete project, so that restoring it cannot mix incompatible proposal and library state.
57. As a Homeowner, I want restoring a Checkpoint to create a new current state, so that later history is never erased.
58. As a Homeowner, I want routine autosaves hidden from the named Checkpoint list, so that milestone history remains readable.
59. As a Homeowner, I want only one browser tab to edit a project at a time, so that concurrent local histories cannot overwrite each other.
60. As a Homeowner, I want another tab to open the project read-only, so that I can inspect it without risking corruption.
61. As a Homeowner, I want to take over editing explicitly from another tab, so that writer ownership is clear and the previous writer can flush its autosave.
62. As a Homeowner, I want to view the authoritative YAML beside the graphical editor, so that the open representation is visible rather than hidden.
63. As a Homeowner, I want to edit YAML inside the application, so that precise manual changes do not require repeated import and export.
64. As a Homeowner, I want YAML comments, ordering, and extension data preserved when I make graphical edits, so that manual authorship remains durable.
65. As a Homeowner, I want YAML changes to remain a draft until I apply them, so that incomplete typing does not mutate the plan.
66. As a Homeowner, I want the graphical editor to become read-only while a YAML draft is pending, so that two editing surfaces cannot compete.
67. As a Homeowner, I want precise paths and line locations for invalid YAML or schema errors, so that I can repair the draft.
68. As a Homeowner, I want an invalid draft retained after validation fails, so that my attempted edit is not discarded.
69. As a Homeowner, I want the last valid autosave protected from invalid manual or AI edits, so that experimentation cannot corrupt recoverable state.
70. As a Homeowner, I want graphical edits to update the YAML view immediately when no draft is pending, so that both views remain synchronized.
71. As a Homeowner, I want to export the current state as a plain YAML Project Document, so that I can inspect, version, or edit it with ordinary tools.
72. As a Homeowner, I want to import a YAML Project Document, so that I can resume work created by another compatible tool.
73. As a Homeowner, I want to export a Project Archive containing the current document and named Checkpoints, so that full project history is portable.
74. As a Homeowner, I want to import a Project Archive, so that moving to another browser or machine retains intentional milestones.
75. As a Homeowner, I want older schema versions previewed before migration, so that opening a file does not silently rewrite it.
76. As a Homeowner, I want the original older document preserved when I migrate it, so that the operation is reversible.
77. As a Homeowner, I want a newer unsupported document left untouched with a clear error, so that unsupported data is not partially interpreted.
78. As a third-party tool author, I want a published Project Document schema, so that I can generate structurally valid files.
79. As a third-party tool author, I want explicit extension maps, so that I can attach namespaced data without weakening the core schema.
80. As a third-party tool author, I want unknown extension data preserved by the graphical application, so that my metadata survives round trips.
81. As a third-party tool author, I want unknown core fields rejected, so that misspellings and unsupported concepts are visible.
82. As an AI agent, I want stable opaque IDs for referenced entities, so that I can modify relationships safely.
83. As an AI agent, I want a deterministic coordinate and rotation convention, so that generated geometry has unambiguous meaning.
84. As an AI agent, I want a headless CLI that reads files or standard input, so that I can operate without browser automation.
85. As an AI agent, I want the CLI to validate and inspect a Project Document, so that I can understand its state before changing it.
86. As an AI agent, I want the CLI to apply structured domain operations atomically, so that a failed batch cannot leave partial changes.
87. As an AI agent, I want the CLI to migrate supported older documents, so that automation follows the same compatibility rules as the app.
88. As an independent implementer, I want the schema, migrations, validation, geometry core, and CLI under a permissive open-source license, so that interoperable tooling does not require reverse engineering.
89. As a Homeowner, I want the application to explain that its plans are for early-stage exploration, so that I do not mistake them for permit or construction documents.
90. As a Homeowner, I want design warnings to remain advisory, so that the application does not imply structural-engineering authority.

## Implementation Decisions

- The product context is early-stage Homeowner space planning. It does not claim architectural, permit, construction, or structural-engineering correctness.
- The Project Document is the authoritative project state shared by the GUI, manual YAML editing, and AI tooling. No essential geometry or content may exist only in a proprietary binary or backend database.
- The MVP is local-first, accountless, and backend-free. It remains usable offline after the initial application load.
- The durable model supports multiple Levels, but the MVP GUI creates and edits a single Level only.
- Each Level has a local right-handed coordinate system: `x` increases rightward, `y` upward in plan view, and `z` upward from the finished floor. Rotations use counter-clockwise degrees from positive `x`, normalized to `[0, 360)`.
- Coordinates and physical dimensions use integer millimetres canonically. The MVP exposes metric input and display; imperial units are deferred.
- Each Level records a base elevation and default wall height. Placeable elements have a Level-local elevation, with zero representing the finished floor.
- Geometry is Wall-centric. A Wall owns an ordered reference path, thickness, and height; the reference path is the Wall centreline.
- The geometry API treats Walls as paths and locates Openings by distance along the host path. The initial schema validates straight paths only while preserving a clean extension point for circular arcs.
- Wall junctions are derived from intersections and endpoint contacts rather than stored as separate objects.
- Rooms are derived from areas enclosed by Walls. Room information is carried by Room Labels anchored at points within enclosed spaces.
- A Room split retains information on the side containing its Room Label. A merge with multiple Room Labels requires explicit resolution.
- Doors, Windows, and Passages are distinct Opening types hosted by Walls.
- Doors support hinged or sliding operation. Hinged Doors record hinge and swing direction; sliding Doors record slide direction.
- Windows record width, height, and sill height and support fixed, hinged, or sliding operation. Sliding elements omit manufacturer-specific tracks, pockets, hardware, and panel configurations.
- Passages record position, width, and height without a Door or Window.
- Furniture and Fixtures remain distinct domain concepts but share definition, placement, geometry, library, and editing mechanics.
- MVP Furniture Definitions and Fixture Definitions are named rectangular cuboids with width, depth, and height.
- Furniture Placements and Fixture Placements record position, orientation, and elevation.
- A project embeds a snapshot of each Item Definition it uses. Item Library changes enter a project only through an explicit update.
- Editing an embedded Item Definition updates all Placements that reference it. Editing one Placement’s shape first creates and assigns a unique definition; arbitrary dimension overrides are not stored on Placements.
- The Existing State is separate from all Design Proposals.
- A Design Proposal is created only by cloning the current Existing State. Proposal duplication is deferred.
- Each Design Proposal stores a complete independent plan with stable element IDs and source-revision metadata, rather than a delta.
- A Project Document may contain several independent Design Proposals, while the MVP’s primary journey uses one and the editor displays one at a time.
- Existing State corrections never silently alter proposals. The MVP marks affected proposals stale with source revision and date but provides no synchronization operation.
- Proposal overlays, comparisons, side-by-side editing, duplication, and synchronization are deferred.
- The canonical MVP serialization is a restricted YAML subset containing ordinary mappings, sequences, and scalars. Aliases, custom tags, and executable extensions are forbidden.
- Project Documents contain an explicit schema-version field and stable opaque IDs.
- JSON Schema Draft 2020-12 defines the public structural contract. Shared semantic validation separately enforces references, hosted Opening bounds, topology, and other cross-entity invariants.
- Unknown core fields are errors. The document and major entities provide explicit `extensions` maps keyed by globally unique identifiers; unknown extension data is ignored semantically and preserved losslessly.
- Graphical and structured edits update the YAML syntax tree rather than regenerating the document, preserving comments, object ordering, and untouched extension data.
- A YAML text change remains an unapplied draft until the Homeowner explicitly applies it. While a text draft differs from the active document, graphical editing is read-only.
- Invalid manual or AI edits are rejected atomically. The last valid autosave and raw invalid text are both retained, with errors reported by document path and line location.
- Schema migration is forward-only, previewed, and confirmed. The original import is preserved. Newer unsupported documents remain untouched and fail clearly.
- Every accepted GUI operation, applied YAML draft, or AI operation batch forms one undoable transaction.
- Autosave persists the active Project Document and Undo/Redo history across browser sessions.
- A Checkpoint is an immutable, explicitly named, project-wide snapshot. Restoring one creates a new current state and never deletes later history.
- Plain YAML exports the current Project Document. A Project Archive is an open ZIP containing `project.yaml` and separate YAML files for named Checkpoints.
- The graphical editor and CLI use one runtime-neutral TypeScript core for schema types, YAML round-tripping, validation, migrations, geometry, and domain operations.
- The CLI validates, inspects, migrates, and atomically applies structured domain operations through files or standard input/output. It has no AI-provider dependency.
- The web client is a React single-page application built with Vite and packaged as a static offline-capable PWA.
- SVG is the MVP 2D renderer. Geometry and hit-testing remain in the shared core rather than depending on SVG DOM behavior.
- IndexedDB stores active projects, raw drafts, transaction history, Checkpoints, and the Item Library. Cache Storage contains only the offline application shell. OPFS is deferred.
- A per-project Web Lock permits exactly one writable browser context. Other tabs open read-only and support explicit takeover after the writer flushes autosave.
- The MVP guarantees the current stable Chrome release and the immediately previous major release on desktop. Other browsers receive best-effort support.
- The editor targets mouse, trackpad, and keyboard. Touch-first editing is deferred; unsupported devices may receive a read-only experience.
- The guaranteed performance envelope for one active Level is 500 Walls, 500 Openings, and 2,000 Furniture or Fixture Placements on a typical recent laptop. Pan, zoom, and drag should remain visually fluid; ordinary domain operations should generally complete within about 100 ms.
- Hard validation errors are limited to broken structural invariants, including invalid references, non-positive dimensions, unparseable geometry, and Openings outside their host Walls.
- Spatial and usability concerns such as overlapping items, inaccessible Doors, or Furniture crossing Walls are non-blocking design warnings.
- The Project Document schema, runtime-neutral core, migrations, and CLI are open source under Apache-2.0. Licensing for the hosted UI remains undecided.
- Future 3D visualization is derived from the same authoritative geometry. It may add materials and camera settings but cannot maintain independently editable structural geometry.

## Testing Decisions

- Tests assert externally visible behavior and serialized outcomes, not internal class shapes, React component structure, SVG markup details, or implementation-specific algorithms.
- The primary behavioral seam is a public Project Workspace boundary that accepts a Project Document plus a validated domain transaction and returns the resulting document, diagnostics, warnings, and history effect. The same acceptance scenarios run through the browser-facing and CLI-facing adapters.
- A golden end-to-end scenario covers the confirmed MVP journey: create an Existing State; add Walls, Openings, Room Labels, Furniture, and Fixtures; create and edit a Design Proposal; create a Checkpoint; reload offline; apply a YAML edit; Undo and Redo it; then export and re-import both a Project Document and Project Archive without semantic, comment, ordering, or extension-data loss.
- Contract tests cover every published JSON Schema version, valid and invalid restricted YAML syntax, unknown core fields, namespaced extensions, stable references, and forward migration preview.
- Semantic tests cover hosted Opening bounds, positive dimensions, derived junctions, Room inference, Room Label behavior on split and merge, item elevation, and the separation between hard errors and design warnings.
- Transaction tests verify atomic failure, one-action Undo/Redo, persistent history across reloads, immutable Checkpoints, non-destructive Checkpoint restoration, and project-wide snapshot consistency.
- Proposal tests verify cloning from the Existing State, independence after creation, several stored proposals with one active proposal, source-revision provenance, and stale warnings without synchronization.
- Item Library tests verify embedded snapshots, explicit library updates, shared-definition edits, “make unique” behavior, and portability without the originating library.
- YAML round-trip tests compare concrete syntax as well as semantics, proving preservation of comments, ordering, and untouched extension data through GUI and CLI operations.
- CLI black-box tests exercise files and standard input/output, machine-readable diagnostics, migrations, inspection, atomic operation batches, exit status, and byte-safe handling of invalid drafts.
- Chrome end-to-end tests cover graphical drawing, numeric editing, snapping, selection, synchronized YAML drafts, read-only GUI state during pending drafts, IndexedDB reload recovery, service-worker offline startup, Project Archive import/export, and per-project Web Lock takeover.
- Rendering tests use behavioral geometry and interaction assertions. Screenshot tests are limited to a small set of high-value visual contracts such as Wall joins, Opening symbols, Room Labels, and selection state.
- Performance tests use the agreed 500-Wall, 500-Opening, and 2,000-Placement fixture and measure pan, zoom, drag, and ordinary operation latency in supported Chrome.
- Accessibility tests cover keyboard access to non-canvas controls, focus management, error announcements, contrast, and textual alternatives for plan diagnostics. The SVG plan editor itself is not claimed to be fully keyboard-editable in the MVP unless separately specified.
- Offline tests prove that drawing, YAML editing, validation, autosave, Undo/Redo, Checkpoints, and import/export work after the network is disabled following a successful initial load.
- Compatibility automation runs against current stable Chrome and the immediately previous major release.
- There is no prior test suite or existing application seam in the repository. These are new seams chosen at the highest practical boundary; lower-level unit tests are added only for geometry cases that cannot be diagnosed economically through the primary behavioral suite.

## Out of Scope

- Permit drawings, construction documents, professional architectural output, code-compliance certification, and structural-engineering analysis.
- Load-bearing or other structural-status classification and related advisories.
- More than one Level in the MVP graphical workflow, despite multi-Level support in the durable model.
- Curved Wall validation or editing in the MVP. Circular arcs are the first planned geometry extension after MVP.
- Imperial input and display.
- Persistent CAD-style geometric constraints such as parallel, perpendicular, equal-length, and locked-distance relationships.
- Custom Furniture or Fixture footprints, detailed 3D assets, manufacturer catalogues, track hardware, pocket depth, and panel-count mechanics.
- Proposal duplication, synchronization, overlays, comparisons, difference reports, and side-by-side editing.
- Cloud accounts, hosted persistence, cross-device synchronization, sharing, and real-time collaboration.
- A built-in AI assistant or dependency on a specific model provider.
- Touch-first plan editing and guaranteed phone or tablet editing.
- Guaranteed support for browsers other than the current and previous major Chrome releases.
- Independently editable 3D geometry.
- 3D visualization in the MVP.
- Hosted UI licensing and business-model decisions.

## Further Notes

- The canonical domain vocabulary is Homeowner, Project Document, Existing State, Design Proposal, Proposal Synchronization, Level, Wall, Opening, Door, Window, Passage, Room, Room Label, Furniture Definition, Fixture Definition, Item Library, Furniture Placement, Fixture Placement, Checkpoint, and Project Archive.
- The main MVP acceptance scenario is deliberately single-branch and single-proposal even though the Project Document can contain several independent proposals.
- Proposal Synchronization, curved Walls, imperial units, and 3D visualization are near- or later-term schema evolutions and must not be simulated through undocumented extension fields.
- The public format should include concise examples and migration fixtures alongside its JSON Schema so human authors and AI agents can learn valid patterns without reading application code.
- Because browser-local storage can be cleared by the user or browser, the UI should encourage periodic Project Archive export and request persistent storage when Chrome permits it.
- The repository currently contains only the domain glossary and ADRs; there is no existing product code or testing prior art.
