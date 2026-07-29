## Git workflow

For any new change:

- Create a dedicated branch named `<type>/<ticket-id>` before editing,
    where type is the type of change (feat for feature, fix for bug-fix, chore
    for other refactoring, docs for documentation-only change) and ticket-id
    references the id of the github issue describing the change. If no ticket is
    provided, fallback to a short description.
- Commit completed, verified work with a focused commit message.
- Push the branch and open a draft pull request referencing the issue unless the user explicitly says not to.
- Do not commit directly to `main`.
