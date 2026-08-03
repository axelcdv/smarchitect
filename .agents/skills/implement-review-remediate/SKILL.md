---
name: implement-review-remediate
description: "Orchestrate a ticket or specification through three sequential, independent sub-agents: implementation and draft PR creation, two-axis PR review with posted GitHub comments, then remediation of every actionable comment. Use when the user asks for an end-to-end implementation flow that must finish with a reviewed, updated, ready-for-review pull request."
---

# Implement, Review, Remediate

Deliver one issue or specification through three explicit quality gates. Keep the
three top-level stage agents sequential so each receives a stable artifact from
the previous stage. Dependency skills may launch their own required helpers.

## Inputs and invariants

- Require an issue, ticket, or specification as the implementation source.
- Read the repository's `AGENTS.md` and contributing instructions before acting.
- Locate and read the complete `implement` and `code-review` skills before
  dispatching their stages. If either is unavailable, stop and tell the user
  which dependency is missing.
- Satisfy the dependency skills' issue-fetch prerequisites before dispatch. When
  repository issue-tracker instructions are absent, fetch the authoritative issue
  through available authenticated GitHub tooling and include its complete content
  in the sub-agent prompt.
- Preserve unrelated and dirty work. Prefer a dedicated worktree when the
  current checkout cannot safely switch branches.
- Follow the repository's branch, commit, push, and pull-request conventions.
- Never merge or close the pull request unless the user separately authorizes it.
- Keep the user informed between stages and when a stage is blocked.

## Stage 1: Implement and open a draft PR

Launch a fresh sub-agent using the `implement` skill. Give it:

- the authoritative issue or specification;
- the repository path and applicable instructions;
- responsibility for its dedicated branch or worktree;
- responsibility for tests, typechecking, build verification, commit, push, and
  draft PR creation;
- an instruction not to mark the PR ready or merge it.

Require the agent to return the branch, commit SHA, PR number and URL, verification
results, worktree state, and any caveats. Wait for completion. Do not advance
without a pushed draft PR and a clean implementation worktree.

Allow the `implement` skill to perform its required internal pre-commit review.
Treat that as implementation-stage validation only; it never replaces the fresh,
posted PR review in Stage 2.

## Stage 2: Mark ready and independently review

Confirm that the PR head matches the pushed implementation commit, then mark the
PR ready for review.

Launch a different fresh sub-agent using the `code-review` skill. Set the fixed
point to the PR base branch and the spec source to the originating issue or
specification. Require the skill's independent Standards and Spec axes.

The reviewer must:

- verify that the three-dot diff is non-empty;
- inspect relevant tests or reproduce suspected behavior before reporting it;
- post a GitHub `COMMENT` review, not an approval or request-changes review;
- post inline comments for actionable findings where GitHub permits;
- post the separated Standards and Spec summary even when no findings exist;
- return review URLs or IDs plus the exact actionable thread list and count.

Wait for the posted review before starting remediation. Treat the posted GitHub
review, rather than an in-memory summary, as the handoff artifact.

## Stage 3: Address review comments

Always launch a third fresh sub-agent. Give it the PR, review URL, exact actionable
thread list, branch or worktree, and originating spec. When there are no findings,
have it audit that no unresolved actionable threads exist and avoid an empty
commit.

For every actionable finding, require the agent to:

1. Fetch and read the full thread context.
2. Add a failing regression test first where practical.
3. Implement the narrowest complete fix.
4. Run focused checks while editing and the full required verification at the end.
5. Commit and push a focused follow-up to the same PR branch.
6. Reply with the fix and verification evidence, then resolve the thread only
   after the pushed code addresses it.

Have the agent assess non-blocking review observations separately. Fix low-risk
ones that improve the change; otherwise document the rationale without pretending
they were implemented.

## Final audit

Independently confirm and report:

- the PR is open and no longer a draft;
- the remote head matches the final branch commit, including the remediation
  commit when one was necessary;
- every actionable review thread has a reply and is resolved;
- the implementation worktree is clean;
- required tests, typechecking, and builds passed;
- CI or merge state, including any remaining external checks or blockers.

Link the PR, posted review, and remediation summary. Report that the PR was not
merged.
