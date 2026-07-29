# Enforce one writable browser context per project

The MVP will use a per-project Web Lock so only one Chrome tab or worker can mutate a project at a time. Additional tabs open read-only and may request an explicit takeover after the current writer flushes its autosave, preventing concurrent local histories from overwriting each other.
