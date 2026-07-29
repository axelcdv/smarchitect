# Persist project state in IndexedDB

The MVP will store active Project Documents, raw YAML drafts, persistent Undo and Redo transactions, Checkpoints, and the Item Library as structured IndexedDB records. Cache Storage is reserved for offline application assets, and OPFS is deferred because the MVP does not require an internal file-oriented store.
