# Preview and confirm forward schema migrations

Each application release will read its current Project Document schema and supported older versions. Older documents are migrated forward only after the Homeowner previews and confirms the migration, with the original import preserved; documents using a newer unsupported schema remain untouched and fail with a clear compatibility error rather than being partially interpreted.
