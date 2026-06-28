# Refined Control Room UI Design

## Objective

Redesign the entire frontend so machine monitoring feels professional, calm, and immediately readable. Preserve all behavior, routes, data flows, and information density while replacing the current sharp, high-contrast presentation with a softer engineering control-room system.

## Visual Direction

Use an adaptive control-room aesthetic with a light theme as the default and a coordinated dark theme for night monitoring.

- Light canvas: warm mineral grey with soft white instrumentation surfaces.
- Dark canvas: deep blue-charcoal rather than pure black.
- Primary ink: deep navy for strong hierarchy without harsh black.
- Operational accent: muted teal for normal actions and healthy signals.
- Status accents: desaturated green, amber, red, and slate with sufficient contrast.
- Atmosphere: faint engineering-grid and radial illumination, never busy behind data.
- Geometry: medium radii, quiet borders, layered shadows, and compact technical labels.

The memorable element is a consistent “instrument panel” language: every major surface feels like a precise monitoring module, with clear state, calm depth, and restrained signal colour.

## Typography

Use a characterful technical display face for headings and machine identifiers, paired with a highly readable humanist sans-serif for body text and controls. Use a tabular mono face for measurements, timestamps, percentages, and trace details.

Typography must improve scanning:

- Page titles and key section headings have clear size and weight separation.
- Eyebrow labels use modest uppercase tracking only where they denote instrument categories.
- Dense tables and charts retain compact sizes but gain better line height and contrast.
- Numeric values use tabular figures where alignment matters.

## Application-Wide System

### Navigation and shell

- Soften the sidebar into a stable navigation rail with grouped destinations, clearer selected state, and a compact brand/instrument mark.
- Refine the header into a light command bar with breadcrumb hierarchy, identity, and session actions.
- Keep the persistent demo notice visible but reduce its visual dominance through a calm informational treatment.
- Increase content breathing room responsively without sacrificing dashboard density.

### Surfaces and controls

- Replace square, flat cards with softly rounded panels, subtle borders, and low-elevation shadows.
- Standardize inputs, selectors, tabs, dialogs, tables, badges, tooltips, and buttons through shared UI primitives and theme tokens.
- Use one dominant primary action treatment; secondary actions remain quieter.
- Ensure focus rings, hover states, disabled states, and destructive actions remain unambiguous.

### Status language

- Healthy: stable teal/green.
- Watch: warm amber.
- Risk: controlled red/coral.
- Offline: neutral slate.
- Never rely on colour alone; retain labels, icons, or supporting text.

## Page Treatments

### Login

Create a composed two-panel entry experience: product narrative and operational proof on one side, one-click demo access and account sign-in on the other. Keep the provenance notice present. The page should feel like entering a real monitoring workspace, not a marketing landing page.

### Dashboard

Prioritize fleet posture and actionability. Summary metrics become calm instrument tiles, charts receive clearer framing and legends, and machine cards expose status and risk without excessive colour. Use staggered page-entry motion that respects reduced-motion preferences.

### Machines and machine detail

Improve scanning through clearer filters, consistent status chips, tabular numeric alignment, and stronger separation between identity, telemetry, predictions, recommendations, and history.

### Chat

Make the assistant workspace feel like an engineering diagnostic console: quieter thread list, readable message widths, distinct user/assistant surfaces, compact trace panels, and clear prompt controls. Scripted tool traces remain visible and understandable.

### Simulator

Group inputs by operating domain, make source context and forecast horizon obvious, and strengthen the visual distinction between configuration, run state, output charts, and recommendations.

### History, account, and admin

Apply the same panel, table, filter, form, and status system. Administrative density remains efficient but gains clearer grouping and less visual friction.

## Motion and Responsiveness

- Use subtle CSS transitions for surface lift, selection, focus, and status changes.
- Use one restrained page-load reveal sequence rather than continuous animation.
- Respect `prefers-reduced-motion`.
- Maintain usable mobile navigation, readable tables or horizontal overflow, and stacked panels at narrow widths.

## Accessibility

- Preserve semantic structure and keyboard navigation.
- Meet WCAG AA contrast for text and operational states.
- Keep visible focus indicators.
- Do not encode machine state with colour alone.
- Keep touch targets practical on mobile.
- Avoid decorative backgrounds that reduce chart or text legibility.

## Architecture and Scope

The redesign is presentation-only. It will primarily change global design tokens, layout components, shared UI primitives, and high-impact page composition classes. Provider contracts, authentication behavior, routes, data processing, simulations, and chat logic remain unchanged.

Prefer central token and primitive improvements over page-specific overrides. Page edits are limited to hierarchy or composition that shared styling cannot solve cleanly.

## Verification

- Existing Vitest provider/auth/component tests remain green.
- ESLint and the production build pass.
- Existing Playwright entry-to-chat journey remains green.
- Browser inspection covers login, dashboard, machines, chat, simulator, admin, mobile layout, and dark mode.
- Visual checks confirm readable contrast, consistent status semantics, focus visibility, and reduced-motion handling.
