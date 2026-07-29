# Reject invalid Project Document edits atomically

Manual and AI edits will become the active project state only when the complete resulting Project Document validates. On failure, the application will preserve the last valid autosave, retain the raw invalid text for correction, report schema errors with document paths and line locations, and never silently repair or partially apply the edit.
