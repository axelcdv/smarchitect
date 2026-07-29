# Home Remodeling

This context supports homeowners exploring possible changes to a home before professional design and construction. It is intended for early-stage space planning, not permit or construction documentation.

## Language

**Homeowner**:
A non-professional user exploring remodeling possibilities for a home they own, occupy, or plan to occupy.
_Avoid_: Architect, designer, construction professional

**Project Document**:
The authoritative, versioned description of one remodeling project, shared by the graphical editor, manual editing, and AI tools.
_Avoid_: Export, database record, proprietary project file

**Existing State**:
The measured layout of the home before remodeling, kept separately from imagined changes.
_Avoid_: Original proposal, default design

**Design Proposal**:
A complete remodeling alternative derived from the Existing State. It may change partitions, openings, room uses, fixtures, and furniture.
_Avoid_: Proposition, furniture layout, version

**Proposal Synchronization**:
An explicit operation that brings an Existing State correction into a Design Proposal, applying safe changes and asking the Homeowner to resolve conflicts.
_Avoid_: Automatic propagation, refresh

**Level**:
A vertically distinct occupiable part of a home represented by its own plan, such as a ground floor or upper floor.
_Avoid_: Layer, page, canvas

**Wall**:
A physical vertical divider with thickness and height that bounds or separates spaces.
_Avoid_: Line, room edge

**Opening**:
A door, window, or unfilled passage hosted by a Wall.
_Avoid_: Furniture, wall gap

**Door**:
An Opening closed by one or more movable panels that are hinged or sliding.
_Avoid_: Passage, doorway

**Window**:
An Opening that admits light and may be fixed, hinged, or sliding.
_Avoid_: Glass door, wall decoration

**Passage**:
An unfilled Opening through a Wall, without a Door or Window.
_Avoid_: Door, doorway

**Room**:
A named space inferred from an area enclosed by Walls rather than drawn as an independent shape.
_Avoid_: Polygon, layer

**Room Label**:
Room information anchored at a point within an enclosed space, allowing the information to persist when surrounding Walls change.
_Avoid_: Room polygon, text annotation

**Furniture Definition**:
A reusable description of a kind of movable furnishing, including its name and physical dimensions.
_Avoid_: Furniture Placement, catalogue product

**Fixture Definition**:
A reusable description of a kind of installed item, such as a kitchen cabinet, sink, toilet, or radiator.
_Avoid_: Furniture Definition, building structure

**Item Library**:
A collection of reusable Furniture Definitions and Fixture Definitions available independently of any remodeling project.
_Avoid_: Furniture Library, catalogue, furniture shop

**Furniture Placement**:
A positioned and oriented occurrence of a Furniture Definition within the Existing State or a Design Proposal.
_Avoid_: Furniture Definition, library item

**Fixture Placement**:
A positioned and oriented occurrence of a Fixture Definition within the Existing State or a Design Proposal.
_Avoid_: Fixture Definition, Furniture Placement

**Checkpoint**:
An immutable, named milestone in a project’s history, explicitly created by the Homeowner and available for later restoration.
_Avoid_: Autosave, backup, current version

**Project Archive**:
A portable package containing the current Project Document and its named Checkpoints.
_Avoid_: Project Document, proprietary backup
