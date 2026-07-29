# Give placeable elements Level-local elevation

Each Level uses a vertical coordinate whose zero is its finished floor, while the Level’s base elevation locates that floor relative to other Levels. Every placeable element has a vertical elevation, defaulting to zero for floor-standing items; its top is that elevation plus its height. Windows express this as sill height, Doors and Passages normally start at zero, and individual Walls may override the Level’s default wall height.
