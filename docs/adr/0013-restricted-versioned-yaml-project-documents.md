# Use restricted, versioned YAML for Project Documents

The canonical MVP serialization will be YAML constrained to ordinary mappings, sequences, and scalar values, excluding aliases, custom tags, and executable extensions. A published machine-readable schema, an explicit schema-version field, and stable opaque IDs for referenced objects will make documents predictable for manual editing, migration, and AI tooling.
