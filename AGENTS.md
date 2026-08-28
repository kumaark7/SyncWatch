# AGENTS.md

## Project Agent Instructions

These instructions apply to all Codex work in this repository.

### 1. General Engineering Rules

- Inspect the existing project structure before making changes.
- Preserve existing functionality unless the task explicitly requires behavioral changes.
- Do not rewrite unrelated code.
- Reuse existing components, utilities, styling conventions, design tokens, and architecture where practical.
- Prefer small, focused changes over unnecessary large rewrites.
- Do not introduce new frameworks or dependencies without a clear technical reason.
- Keep code maintainable, readable, and consistent with the existing codebase.
- Run relevant build, lint, type-check, and test commands after changes when those scripts exist.
- Fix regressions introduced by your own changes before considering the task complete.

### 2. Frontend and UI/UX Work

For every task involving frontend layout, visual styling, components, responsive behavior, interaction design, accessibility, or UI/UX:

**Read `docs/UI_UX_STANDARD.md` before editing the interface.**

Treat that file as the project's UI/UX implementation standard.

### 3. Responsive Design Requirement

Do not treat mobile as a scaled-down desktop layout.

For major UI changes, intentionally consider:

- 320px
- 375px
- 430px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

Check:

- overflow
- clipping
- wrapping
- spacing
- navigation
- tables
- forms
- dialogs
- touch targets
- fixed/sticky elements
- content density
- empty/loading/error states

### 4. Preserve Functional Behavior

For visual or UX tasks:

- Do not change backend behavior unless explicitly requested.
- Do not change API contracts unless explicitly requested.
- Do not remove working features for aesthetic reasons.
- Do not silently change user flows.
- Preserve authentication, permissions, validation, data handling, and state behavior.

### 5. UI Change Workflow

Before coding:

1. Inspect the relevant page and shared components.
2. Identify actual UX problems.
3. Determine desktop, tablet, and mobile behavior.
4. Reuse the existing design system where possible.
5. Decide which changes are necessary and which are merely decorative.

During implementation:

1. Keep responsive behavior intentional.
2. Use reusable components instead of duplicated markup.
3. Include hover, focus, active, disabled, loading, empty, and error states where applicable.
4. Avoid introducing inconsistent styling.

Before completion:

1. Re-check the changed interface at the required viewport widths.
2. Look for layout regressions.
3. Verify keyboard and touch usability.
4. Verify no unintended horizontal scrolling exists.
5. Run relevant project checks.

### 6. Design Restraint

Do not make the interface look "modern" by default through excessive decoration.

Avoid unnecessary:

- gradients
- glassmorphism
- glow effects
- huge border radii
- excessive shadows
- oversized typography
- giant cards
- decorative animations
- arbitrary accent colors
- excessive whitespace
- visual noise

Prefer clarity, hierarchy, consistency, usability, and information density appropriate to the product.

### 7. Task Completion Standard

A frontend task is not complete merely because the code compiles.

It is complete when:

- functionality is preserved
- desktop behavior is intentional
- mobile behavior is intentional
- intermediate widths behave correctly
- accessibility basics are covered
- interaction states are handled
- visual hierarchy is clear
- styling is internally consistent
- there is no unintended clipping or overflow
- relevant project checks pass
