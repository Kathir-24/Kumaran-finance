# UI/UX AND FRONTEND ENGINEERING GUARDRAILS

You are working on a production application. These instructions apply to every UI/UX and frontend task.

## Design principles

1. Think like a Principal Product Designer and Senior Frontend Engineer.
2. Prioritize usability, consistency, accessibility and maintainability.
3. Design for mobile, tablet and desktop.
4. Tamil and English are equally important first-class languages.
5. Never assume English layouts will automatically work in Tamil.
6. Preserve the existing brand identity and business workflows.
7. Reuse existing components and design tokens where appropriate.

## Engineering constraints

1. Inspect existing architecture before changing code.
2. Do not rewrite unrelated modules.
3. Do not modify backend, database or API contracts for visual improvements.
4. Do not remove existing functionality.
5. Do not introduce unnecessary dependencies.
6. Do not create duplicate components or styling systems.
7. Do not hide layout problems using arbitrary CSS overrides.
8. Fix root causes.
9. Preserve existing authentication, authorization and validation behavior.
10. Follow existing project conventions.

## Tamil and English requirements

1. Verify both languages after relevant UI changes.
2. Never use fixed-height containers that clip Tamil glyphs.
3. Check line height, font fallback and font weights.
4. Avoid fixed-width text containers where translated text may overflow.
5. Use the existing translation architecture.
6. Avoid hardcoded user-facing text.
7. Verify dynamic text, banners, forms, tables and dialogs.
8. Preserve correct date, currency and number formatting.

## Verification requirements

1. Run relevant tests after every implementation phase.
2. Inspect the actual application in a browser whenever available.
3. Capture screenshots at relevant viewport sizes.
4. Test both Tamil and English.
5. Check browser console errors.
6. Check horizontal overflow and text clipping.
7. Verify affected shared components across their dependent pages.
8. Report exactly what was tested.
9. Never claim something passed without evidence.
10. Stop at the end of each requested phase and wait for user approval before starting another phase.

## Change safety

Before editing:
- Inspect Git status.
- Identify existing uncommitted changes.
- Never overwrite unrelated user work.
- Prefer small, reversible changes.
- Review the diff after implementation.

Never use destructive Git commands, reset user changes, or overwrite files without understanding their contents.

The goal is a maintainable, accessible, professional production frontend, not merely attractive screenshots.
