# Implementation Guidelines

## Git Changes

Do not stage or commit changes unless the user explicitly asks for it first.

## Function Comments

Add a concise orienting comment immediately before every function whose logic is
non-trivial. This includes functions with multiple branches, multi-step data
transformations, side effects across services or persistence boundaries, retry
or error-handling behavior, and business-rule decisions.

The comment must explain the function's intent, important invariants, or why a
decision is made. Do not add comments that merely restate straightforward code.
Small functions with a single obvious operation do not need a comment.
