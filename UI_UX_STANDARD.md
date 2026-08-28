# UI / UX Engineering Standard

## Purpose

This document defines the frontend UI/UX quality standard for this project.

When working on interface-related tasks, act as both:

- a senior product/UI designer
- a senior frontend engineer

The objective is not merely to make the interface functional.

The interface should be:

- clear
- responsive
- accessible
- visually intentional
- consistent
- maintainable
- production-ready

Do not optimize only for screenshots. Optimize for actual use.

---

# 1. Core UI/UX Principles

## 1.1 Understand Before Editing

Before changing UI:

1. Inspect the current implementation.
2. Understand the page's main purpose.
3. Identify the primary user action.
4. Identify secondary actions.
5. Inspect shared components and current styling conventions.
6. Determine what is already working well.
7. Identify actual usability problems.
8. Preserve functionality that does not need to change.

Do not redesign unrelated parts of the application.

---

## 1.2 Avoid Generic AI-Generated UI

Do not default to stereotypical AI-generated interfaces.

Avoid excessive use of:

- glassmorphism
- gradients
- glowing borders
- giant cards
- very large rounded corners
- huge hero-style headings inside dashboards
- random decorative shapes
- arbitrary purple/blue gradients
- excessive shadows
- floating elements without functional value
- excessive empty space
- unnecessary animation

Every visual treatment should have a UX reason.

---

# 2. Responsive Design

Responsive design is mandatory.

Do not build a desktop interface and simply shrink it.

Each major viewport category should have intentional behavior.

## 2.1 Required Viewports

Review major screens at approximately:

- 320px
- 375px
- 430px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

These are checkpoints, not a license to hardcode only these widths.

Layouts should behave smoothly between them.

---

## 2.2 Small Mobile: 320px

At 320px:

- no accidental horizontal scrolling
- no clipped labels
- no inaccessible actions
- no oversized fixed-width components
- important controls remain usable
- dialogs remain usable
- long content wraps or truncates appropriately
- tables use an intentional mobile strategy

Always consider 320px as the stress test.

---

## 2.3 Mobile: 375px to 430px

Mobile interfaces should feel designed for touch.

Consider:

- vertical hierarchy
- compact but comfortable spacing
- reachable actions
- bottom sheets where appropriate
- responsive navigation
- full-width controls where useful
- stacked or reorganized information
- reduced secondary metadata
- large enough touch targets
- keyboard behavior for forms

Do not rely only on:

```css
flex-direction: column;
```

as the mobile strategy.

Reconsider the information architecture where necessary.

---

## 2.4 Tablet: Around 768px

Tablet layouts should not feel like oversized mobile or broken desktop.

Consider:

- two-column layouts where useful
- collapsible navigation
- reduced sidebar width
- denser cards
- adaptive tables
- flexible form layouts
- intermediate typography and spacing

---

## 2.5 Desktop: 1024px to 1440px

Desktop layouts should make useful use of horizontal space.

Avoid:

- unnecessarily narrow centered content
- oversized empty margins
- giant cards with little information
- unnecessarily large typography
- content that feels stretched

Prefer:

- clear grid systems
- deliberate max-widths
- aligned sections
- useful multi-column layouts
- appropriate information density
- predictable actions

---

## 2.6 Wide Desktop: 1440px to 1920px+

Large screens should remain intentional.

Do not simply stretch everything.

Use:

- max-width containers
- constrained readable text widths
- expanded data views when useful
- wider workspaces where the product benefits from them
- stable spacing systems

For dashboards, editors, terminals, file managers, analytics, and admin interfaces, wider screens may justify greater information density.

---

# 3. Layout and Grid

Use a coherent layout system.

Prefer:

- CSS Grid
- Flexbox
- consistent container widths
- repeatable gaps
- responsive min/max sizing

Avoid:

- arbitrary pixel positioning
- unnecessary absolute positioning
- fragile fixed widths
- deeply nested wrappers with no semantic or layout purpose

Use fixed dimensions only where the component genuinely requires them.

---

# 4. Spacing System

Use a consistent spacing scale.

Recommended base scale:

- 4px
- 8px
- 12px
- 16px
- 20px
- 24px
- 32px
- 40px
- 48px
- 64px

Not every value must be used.

Avoid random values such as:

- 13px
- 27px
- 41px

unless there is a specific reason.

Repeated components should have identical spacing rules.

---

# 5. Typography

Typography must establish hierarchy.

Suggested scale:

- 12px: metadata, compact labels
- 14px: supporting text
- 16px: standard body
- 18px: emphasized body
- 20px to 24px: section headings
- 28px to 36px: page titles
- 40px+: marketing hero content only when justified

Maintain comfortable line-height.

Do not use huge headings in dense application interfaces.

Use font weight deliberately.

Avoid using bold text everywhere.

---

# 6. Visual Hierarchy

Every screen should make the following obvious:

1. What page or area the user is in.
2. What the user can do here.
3. What the primary action is.
4. Which actions are secondary.
5. Which information is important.
6. Which information is supporting detail.

Create hierarchy using:

- typography
- spacing
- grouping
- alignment
- contrast
- size
- placement

Do not rely on color alone.

---

# 7. Color

Reuse the project's existing palette and design tokens.

Do not introduce new colors casually.

Colors should have semantic purpose.

Examples:

- primary action
- success
- warning
- error
- informational
- neutral
- selected/active

Maintain sufficient text contrast.

Do not communicate important state exclusively with color.

---

# 8. Buttons and Actions

Use a clear action hierarchy.

Typical hierarchy:

1. Primary
2. Secondary
3. Tertiary
4. Destructive

Do not make every action look primary.

## Button requirements

Buttons should have:

- clear labels
- hover state
- active state
- focus-visible state
- disabled state
- loading state when applicable

Icon-only buttons require:

- an accessible label
- recognizable iconography
- an adequate click/touch target
- tooltip when useful

Target approximately 44px touch area for important mobile controls where practical.

---

# 9. Forms

Forms must remain clear and usable.

Use:

- visible labels
- helpful descriptions where needed
- appropriate input types
- clear validation messages
- disabled states
- loading submission states
- keyboard-accessible controls
- logical tab order
- visible focus states

Do not use placeholder text as the only label for important fields.

Group related fields.

Avoid unnecessarily long forms.

---

# 10. Navigation

Navigation must communicate location and hierarchy.

Desktop and mobile navigation may use different patterns.

Desktop options may include:

- top navigation
- sidebar
- contextual subnavigation

Mobile options may include:

- compact header
- drawer
- bottom navigation
- overflow menu
- progressive disclosure

Do not compress a large desktop sidebar into an unusable miniature mobile sidebar.

Active navigation state should be clear.

---

# 11. Tables and Dense Data

Tables require intentional responsive behavior.

## Desktop

Prioritize:

- scanability
- useful density
- clear column alignment
- sortable headers where applicable
- aligned numeric values
- sticky headers when beneficial
- readable row states

## Mobile

Choose one strategy intentionally:

- horizontal scrolling
- responsive cards
- prioritized columns
- expandable rows
- detail drawer
- stacked key/value layout

Do not allow accidental overflow.

Avoid hiding critical data merely to make the table fit.

---

# 12. Cards

Cards should represent meaningful grouping.

Do not wrap every piece of content inside a card.

Cards should have:

- consistent padding
- consistent radius
- predictable header/body structure
- clear grouping purpose

Avoid oversized cards with large empty areas.

Dashboard cards should favor useful information density.

---

# 13. Modals and Dialogs

Dialogs should have:

- clear title
- concise explanation
- obvious primary action
- obvious cancel/close action
- correct destructive treatment when applicable
- keyboard accessibility
- viewport-aware maximum height
- internal scrolling for long content

On mobile, consider:

- full-screen modal
- bottom sheet
- nearly full-width dialog

when these patterns provide better usability.

A desktop-sized fixed modal should not overflow a phone screen.

---

# 14. Empty States

Do not leave users with unexplained blank areas.

A useful empty state explains:

- what is empty
- why it may be empty
- what the user can do next

Keep empty states concise.

Decorative illustrations are optional.

---

# 15. Loading States

Avoid unnecessary full-screen blocking.

Choose the loading pattern based on context.

Use:

- skeletons for structural page content
- inline spinners for small asynchronous actions
- button loading states for submissions
- progress indication for long-running operations

Avoid major layout shifts when content loads.

---

# 16. Error States

Errors should explain:

1. what failed
2. what the user can do next

Where useful, include:

- retry
- refresh
- edit input
- go back
- contact/support path

Do not expose raw implementation errors to normal users unless the product is specifically a developer/admin tool where technical detail is useful.

---

# 17. Success and Feedback States

Important user actions should produce clear feedback.

Examples:

- saved
- uploaded
- copied
- deleted
- connected
- disconnected
- submitted

Avoid excessive toast notifications for trivial state changes.

Use inline feedback when it is more contextual.

---

# 18. Accessibility

Accessibility is part of implementation quality.

Use semantic HTML whenever possible.

Requirements:

- logical heading hierarchy
- keyboard navigation
- visible focus-visible states
- sufficient contrast
- accessible form labels
- accessible error messages
- meaningful button labels
- alt text for informative images
- accessible dialogs
- proper table semantics
- appropriate ARIA only when native semantics are insufficient

Do not remove focus outlines without replacing them with an equivalent visible focus treatment.

---

# 19. Touch and Pointer Interaction

For touch interfaces:

- avoid tiny controls
- avoid hover-only functionality
- keep frequently used actions easy to reach
- separate destructive controls from common actions
- avoid dense clusters of tiny icon buttons

For pointer interfaces:

- use hover feedback
- use tooltips where beneficial
- retain keyboard accessibility

---

# 20. Icons

Use one consistent icon family already present in the project.

Do not casually mix:

- emoji
- Unicode symbols
- custom SVGs
- multiple icon libraries

Icons should support meaning.

Do not replace understandable text labels with ambiguous icons merely to save space.

---

# 21. Animation and Motion

Motion should communicate state or spatial relationship.

Preferred transition duration:

- approximately 120ms to 250ms

Suitable uses:

- hover transitions
- menu opening
- accordion expansion
- modal appearance
- subtle page-state changes

Avoid:

- constant looping animation
- excessive bouncing
- unnecessary parallax
- animations that delay interaction
- motion added only for decoration

Respect `prefers-reduced-motion` where appropriate.

---

# 22. CSS and Styling Architecture

Follow the styling architecture already used by the project.

Do not introduce Tailwind, Bootstrap, Material UI, CSS-in-JS, or another styling system unless the task genuinely requires it.

Avoid:

- duplicate responsive rules
- uncontrolled z-index values
- excessive `!important`
- arbitrary magic numbers
- duplicated styles
- deeply nested selectors
- unnecessary global overrides

Use CSS variables or design tokens for repeated values.

---

# 23. Component Architecture

Prefer reusable components for repeated UI patterns.

Good candidates include:

- buttons
- inputs
- cards
- dialogs
- dropdowns
- status badges
- empty states
- loading states
- table controls
- pagination
- alerts
- navigation items

Do not over-componentize trivial one-use markup.

Balance reuse with readability.

---

# 24. Interaction States

Interactive components should account for applicable states:

- default
- hover
- focus
- active
- selected
- disabled
- loading
- empty
- error
- success

Do not design only the ideal happy path.

---

# 25. Content Density

Different products require different density.

## Dashboards / Admin / Developer Tools

Prefer:

- compact spacing
- useful information density
- clear scan patterns
- predictable controls
- strong table/list ergonomics
- minimal decorative space

## Marketing / Business Sites

Prefer:

- stronger storytelling
- clear CTA hierarchy
- comfortable reading width
- larger section spacing
- deliberate imagery
- conversion-focused layout

Do not apply marketing-style oversized whitespace to dense management tools.

---

# 26. Images and Media

Images should have a functional or communicative purpose.

Use:

- correct aspect ratios
- responsive sizing
- lazy loading where appropriate
- object-fit intentionally
- useful alt text

Avoid stretching images.

Do not use decorative images that reduce readability or contrast.

---

# 27. Responsive Navigation Behavior

Explicitly define how navigation changes across breakpoints.

Examples:

### Desktop
- full sidebar
- expanded labels
- utility actions visible

### Tablet
- compact sidebar
- collapsible labels
- grouped actions

### Mobile
- drawer
- bottom navigation
- compact top bar
- overflow menu

Choose based on the product's usage pattern.

---

# 28. Mobile Keyboard Behavior

For mobile forms and app-like interfaces:

- ensure fields remain visible when the keyboard opens
- avoid fixed elements covering active inputs
- use suitable input modes
- keep submit actions reachable
- avoid layouts that jump unpredictably

This is particularly important for chat, terminal, login, search, and messaging interfaces.

---

# 29. Fixed and Sticky Elements

Use fixed/sticky UI deliberately.

Verify that:

- content is not obscured
- mobile safe areas are respected
- stacked sticky elements do not overlap
- dialogs are not hidden behind fixed navigation
- z-index values remain controlled

---

# 30. Overflow

Unintended horizontal scrolling is considered a defect.

Check:

- long file names
- URLs
- code
- tables
- tabs
- breadcrumb paths
- badges
- button groups
- form controls
- terminal/editor containers

Use:

- wrapping
- truncation
- scroll containers
- responsive reorganization

based on the content type.

---

# 31. Long Text and Edge Cases

Test with:

- very long titles
- very long usernames
- long email addresses
- long file paths
- long URLs
- large numbers
- untranslated strings
- empty values
- missing images

Interfaces should degrade gracefully.

---

# 32. Destructive Actions

Destructive actions should be visually and behaviorally distinct.

Examples:

- delete
- remove
- disconnect
- terminate
- reset
- revoke

Use confirmation when consequences are significant.

Confirmations should explain the consequence.

Do not use confirmation dialogs for every minor reversible action.

---

# 33. Authentication Screens

Authentication UI should prioritize clarity and trust.

Requirements:

- clear primary action
- straightforward error messages
- visible recovery path
- clear loading state
- keyboard usability
- responsive form width
- no distracting decorative clutter

For multi-factor authentication, clearly communicate the current step.

---

# 34. Dashboard Interfaces

Dashboard UI should optimize for quick comprehension.

Prioritize:

- current status
- key metrics
- warnings
- required actions
- recent activity
- navigation to detail

Avoid turning every metric into a giant card.

Use tables/lists where they communicate data more efficiently.

---

# 35. File Managers

For file-manager interfaces, prioritize:

- path clarity
- file/folder distinction
- sorting
- selection behavior
- bulk operations
- context actions
- upload state
- download state
- responsive action menus
- long filename handling

On mobile, context menus and action bars should remain touch-friendly.

---

# 36. Terminals and Editors

For terminal/editor interfaces:

- maximize useful workspace
- avoid unnecessary decorative chrome
- preserve viewport height
- ensure tabs remain manageable
- handle many tabs
- provide clear active state
- support overflow intentionally
- keep important session/server context visible

On mobile:

- account for the software keyboard
- keep session controls reachable
- avoid narrow unusable sidebars
- use horizontally scrollable tab bars or compact selectors if needed

---

# 37. Information Architecture Review

Before redesigning a page, ask:

- What is the user trying to accomplish?
- What information do they need first?
- Which actions are frequent?
- Which actions are rare?
- Which actions are dangerous?
- Which information can be progressively disclosed?
- Which content deserves persistent visibility?

Use those answers to determine layout.

---

# 38. Implementation Workflow

For substantial UI tasks:

## Step 1: Inspect

Inspect:

- route/page
- shared components
- CSS/styling files
- design tokens
- navigation
- related responsive behavior

## Step 2: Audit

Identify:

- hierarchy problems
- spacing inconsistencies
- overflow
- weak mobile behavior
- unclear actions
- accessibility problems
- unnecessary visual noise

## Step 3: Plan

Determine:

- desktop structure
- tablet adaptation
- mobile structure
- component reuse
- interaction states

## Step 4: Implement

Make focused changes.

Preserve working behavior.

## Step 5: Validate

Check major viewport widths and interaction states.

## Step 6: Clean Up

Remove:

- duplicated CSS
- obsolete styles
- dead markup
- temporary debugging code
- unnecessary overrides

---

# 39. Completion Checklist

Before considering a UI task complete, verify:

## Layout
- [ ] 320px works
- [ ] 375px works
- [ ] 430px works
- [ ] 768px works
- [ ] 1024px works
- [ ] 1280px works
- [ ] 1440px works
- [ ] 1920px works

## Responsive
- [ ] No unintended horizontal scrolling
- [ ] Navigation adapts correctly
- [ ] Tables have an intentional mobile strategy
- [ ] Forms remain usable
- [ ] Modals fit the viewport
- [ ] Fixed/sticky elements do not obscure content
- [ ] Long content degrades gracefully

## Interaction
- [ ] Hover state exists where relevant
- [ ] Focus-visible state exists
- [ ] Disabled state exists
- [ ] Loading state exists where needed
- [ ] Error state is usable
- [ ] Empty state is handled
- [ ] Success feedback is appropriate

## Accessibility
- [ ] Semantic HTML used
- [ ] Keyboard navigation works
- [ ] Labels are present
- [ ] Contrast is acceptable
- [ ] Icon-only actions have accessible names
- [ ] Dialog behavior is accessible

## Visual Quality
- [ ] Spacing is consistent
- [ ] Typography hierarchy is clear
- [ ] Alignment is consistent
- [ ] Colors are intentional
- [ ] Icons are consistent
- [ ] No unnecessary visual effects
- [ ] Information density matches the product type

## Engineering
- [ ] Existing functionality is preserved
- [ ] No unnecessary dependency was added
- [ ] Reusable components are used where appropriate
- [ ] No redundant CSS remains
- [ ] Relevant build/test/lint/type-check commands pass

---

# 40. Final Standard

A UI change is not complete because it looks attractive in one screenshot.

It is complete when the interface:

- supports the user's task efficiently
- behaves intentionally on desktop
- behaves intentionally on mobile
- remains usable at intermediate widths
- preserves existing functionality
- handles non-ideal states
- is accessible at a practical baseline
- is visually coherent
- is technically maintainable
- does not introduce responsive regressions
