# Store complete Design Proposal snapshots

Each Design Proposal will begin as a clone of the current Existing State and store a complete independent plan rather than a delta. Stable element IDs and source-revision metadata leave room for later explicit synchronization, while complete snapshots keep YAML and AI edits understandable and prevent Existing State corrections from propagating silently. Creating a proposal by duplicating another proposal is deferred.
