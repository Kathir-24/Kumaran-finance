# UI/UX PHASE EXECUTION

Execute exactly one UI/UX implementation phase per invocation.

## Step 1 — Understand

- Read the relevant project documentation.
- Inspect affected routes and components.
- Understand existing dependencies and implementation.
- Identify shared component dependencies.

## Step 2 — Plan

- List the exact files expected to change.
- Describe current problems.
- Describe intended improvements.
- Identify possible regressions.
- Define acceptance criteria.

## Step 3 — Implement

- Implement only the current phase.
- Follow project conventions.
- Make minimal, targeted changes.
- Preserve existing functionality.
- Avoid unrelated refactoring.

## Step 4 — Test

Run appropriate:
- Type checking.
- Linting.
- Build checks.
- Unit tests.
- Integration tests.
- Browser tests.
- Accessibility tests.

Use existing project scripts and tooling.

## Step 5 — Visual verification

Where browser access is available:

- Open the actual application.
- Inspect affected pages.
- Test relevant viewport sizes.
- Test Tamil and English.
- Inspect screenshots.
- Check for clipping, overflow and overlapping.
- Check console errors.

Do not substitute code inspection for browser verification.

## Step 6 — Regression verification

Verify that:
- Existing functionality still works.
- Shared components remain consistent.
- Unrelated pages have not regressed.
- Existing tests remain passing.

## Step 7 — Report

Create or update the relevant audit documentation.

Report:
1. What was implemented.
2. Files modified.
3. Problems fixed.
4. Tests executed.
5. Test results.
6. Screenshots or visual evidence.
7. Known limitations.
8. Remaining issues.

## Step 8 — Stop

Stop after completing the current phase.

Do not automatically start the next phase.

Present the results and wait for explicit user approval.
