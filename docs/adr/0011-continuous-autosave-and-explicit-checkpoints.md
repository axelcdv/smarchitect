# Separate continuous autosave from explicit Checkpoints

Every accepted edit will be autosaved for crash recovery without adding noise to visible history. A Checkpoint is instead an immutable, named milestone explicitly created by the Homeowner; restoring one creates a new current state and never erases the history that followed it.
