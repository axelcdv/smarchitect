## Git workflow

For any new change:

- Create a dedicated branch named `<type>/<short-description>` before editing,
    where type is the type of change (feat for feature, fix for bug-fix, chore
    for other refactoring, docs for documentation-only change).
- Commit completed, verified work with a focused commit message.
- Push the branch and open a draft pull request unless the user explicitly says not to.
- Do not commit directly to `main`.
