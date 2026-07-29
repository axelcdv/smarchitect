# Use a path-based Wall API with straight-only MVP validation

The MVP Project Document will validate only straight Walls, but geometry operations will treat each Wall as a path and locate hosted Openings by distance along it. A subsequent schema version can add circular-arc paths without redesigning Wall relationships; until then, documents containing curved Walls will fail validation clearly rather than render partially or incorrectly.
