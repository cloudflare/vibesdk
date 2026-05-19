---
name: frontend-design-saas
description: S-tier SaaS dashboard and product UI reference. Use this skill when building application shells, data tables, settings panels, billing pages, dashboards, auth flows, admin tools, or any internal/customer-facing SaaS product UI. Inspired by Stripe, Linear, Vercel, Airbnb, Notion. Covers neutral-led design tokens, sidebar+content shells, dense data UIs, form-heavy configuration pages, command palettes, empty states, and the accessibility (WCAG AA+) bar these products clear.
---

# SaaS Design System (Stripe / Linear / Vercel lineage)

> **AI-Optimized Design Reference** for building S-tier SaaS dashboards, admin consoles, billing pages, settings UIs, data-dense application shells, and product surfaces.
>
> Tonal anchors: `stripe.com/dashboard`, `linear.app`, `vercel.com/dashboard`, `notion.so/teamspace`, `clerk.com`, `planetscale.com/console`.

---

## Quick Reference (TL;DR)

```
Brand Accent:    #5E6AD2 (indigo) - replace with product brand
Neutrals:        #FFFFFF → #F8FAFC → #F1F5F9 → #E2E8F0 → #94A3B8 → #475569 → #0F172A
Text:            #0F172A (primary) / #475569 (muted) / #94A3B8 (subtle)
Border:          #E2E8F0 (default) / #CBD5E1 (strong)
Font Sans:       "Inter", "Geist", system-ui (NOT Arial, NOT Roboto)
Font Mono:       "JetBrains Mono", "Geist Mono", ui-monospace
Base Spacing:    4px (scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
Border Radius:   Buttons/inputs = 6-8px (NOT pill), Cards = 8-12px, Modals = 12-16px
Shadow:          Tight, low-spread, single-direction (NOT diffuse marketing shadows)
Density:         Compact-to-comfortable; row heights 36-44px, button heights 32-36px
```

The fastest way to get this wrong: use marketing-page aesthetics (huge type, generous whitespace, pill buttons, gradient hero shadows) in a product surface. SaaS UIs are **dense, neutral, fast, and quiet**. The brand color appears in <5% of the pixels and earns its weight by marking only what's interactive or active.

---

## 1. Brand Foundation

### Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Users First** | Workflows, keyboard navigation, and information density beat decoration. |
| **Quiet by Default** | Neutrals dominate; the brand color is reserved for primary action, active state, and focus. |
| **Speed & Density** | Snappy transitions (≤200ms), compact row heights, no entrance animations on every page load. |
| **Opinionated Defaults** | Single canonical pattern per surface (one button hierarchy, one date picker, one empty state). |
| **Meticulous Craft** | 1px borders aligned to pixel grid, focus rings 2px offset 2px, motion uses ease-out not linear. |
| **Accessible (WCAG AA+)** | 4.5:1 text contrast, 3:1 UI element contrast, every interactive surface keyboard-reachable. |
| **Predictable** | Same component looks/behaves identically on every page; no marketing-grade variants. |

### Visual Identity Rules

- **Do not use pure black on pure white.** Use `#0F172A` on `#FFFFFF` (or `#0B1220` on `#0A0E1A` in dark mode).
- **Brand color is the accent, never the dominant.** If the brand color fills more than ~5% of the viewport in steady state, something is wrong.
- **Avoid pill buttons** (`border-radius: 9999px`) for SaaS actions. Pills read as marketing/consumer; SaaS uses `6-8px` radius for buttons and inputs.
- **No glassmorphism, no blur, no gradient borders.** The aesthetic is precision, not richness.
- **Shadows are tight and downward.** Not diffuse, not multi-direction. Reserved for floating layers (popovers, modals, dropdowns).
- **One font.** Inter / Geist / IBM Plex Sans / native system stack. Avoid mixing display + body fonts; SaaS uses a single workhorse sans.
- **Mono for IDs, code, tokens, money.** Tabular figures (`font-variant-numeric: tabular-nums`) for any column of numbers.

### Reference apps to mentally calibrate against

| Surface to build | Look at |
|---|---|
| Application shell | Linear, Vercel, Stripe Dashboard |
| Data table | Stripe `/payments`, Linear backlog, PlanetScale branches |
| Settings page | Vercel project settings, Clerk dashboard, GitHub repo settings |
| Billing / invoice | Stripe billing, Vercel usage |
| Empty state | Linear, Notion, Vercel deployments |
| Command palette | Linear ⌘K, Vercel ⌘K, Raycast |
| Auth | Clerk hosted pages, Stripe Connect onboarding |
| Onboarding checklist | Stripe Atlas, Vercel project import |

---

## 2. Color System

### 2.1 Neutral Scale (the backbone)

SaaS UIs are 80–90% neutrals. The neutral scale carries the entire interface; brand is sprinkled on top. Use a slightly cool neutral (slate) by default — it reads more "product" than warm grays which feel marketing/lifestyle.

| Token | Hex | Usage |
|---|---|---|
| `--neutral-0` | `#FFFFFF` | Page background (light mode), surface lifted onto canvas |
| `--neutral-50` | `#F8FAFC` | Canvas background, alternating row stripe |
| `--neutral-100` | `#F1F5F9` | Hover background, subtle fill, table header |
| `--neutral-200` | `#E2E8F0` | **Default border**, divider |
| `--neutral-300` | `#CBD5E1` | Strong border, input border on focus-within parent |
| `--neutral-400` | `#94A3B8` | **Subtle text** (placeholders, disabled, captions) |
| `--neutral-500` | `#64748B` | Tertiary text, icon default |
| `--neutral-600` | `#475569` | **Muted text** (descriptions, secondary labels) |
| `--neutral-700` | `#334155` | Strong icon, hover text |
| `--neutral-800` | `#1E293B` | Heading in dense UIs, code text |
| `--neutral-900` | `#0F172A` | **Primary text**, primary icons |
| `--neutral-950` | `#020617` | Highest contrast (rare; only for critical labels) |

### 2.2 Brand Accent (single color, used sparingly)

Pick **one** accent. Use a 6-step ramp so hover/active/focused/disabled all derive from the same hue. Defaults below use indigo (`#5E6AD2`, Linear's accent) — swap the hue for your brand but keep the structure.

| Token | Hex | Usage |
|---|---|---|
| `--brand-50` | `#EEF0FB` | Selected row background, badge background, focus ring background |
| `--brand-100` | `#DDE0F7` | Hover on brand surfaces |
| `--brand-200` | `#B9C0EF` | Disabled brand button, decorative |
| `--brand-500` | `#7B85DC` | Brand hover surface stroke |
| `--brand-600` | `#5E6AD2` | **Primary brand** — default button bg, link text, focus ring, active nav item |
| `--brand-700` | `#4A56C0` | Hover state for primary button |
| `--brand-800` | `#3A45A8` | Active/pressed state |
| `--brand-900` | `#2A3284` | High-contrast brand text on light background |

### 2.3 Semantic / Status Colors

Used for state — never for decoration. Each has a `text`, `bg`, `border` triplet so badges and inline messages stay legible.

| State | `text` | `bg` (filled) | `bg-subtle` (badge) | `border` |
|---|---|---|---|---|
| **Success** | `#15803D` | `#16A34A` | `#DCFCE7` | `#86EFAC` |
| **Warning** | `#A16207` | `#CA8A04` | `#FEF9C3` | `#FDE68A` |
| **Error / Destructive** | `#B91C1C` | `#DC2626` | `#FEE2E2` | `#FCA5A5` |
| **Info** | `#1D4ED8` | `#2563EB` | `#DBEAFE` | `#93C5FD` |
| **Neutral (default badge)** | `#334155` | `#64748B` | `#F1F5F9` | `#CBD5E1` |

Rules:
- Inline form errors: `text` color on `bg-subtle` background, `border` for the input.
- Toasts: `bg-subtle` panel, `text` heading, `--neutral-700` body.
- Status badges: `text` on `bg-subtle` + 1px `border`. Never use solid `bg` for badges (too loud).

### 2.4 Data Visualization Palette

When you need >1 color for charts. Categorical — visually distinct, similar luminance. Avoid the brand color in this palette so brand reads as "interactive" elsewhere.

```
--chart-1: #2563EB  (blue)
--chart-2: #16A34A  (green)
--chart-3: #CA8A04  (amber)
--chart-4: #DC2626  (red)
--chart-5: #9333EA  (violet)
--chart-6: #0891B2  (cyan)
--chart-7: #DB2777  (pink)
--chart-8: #65A30D  (lime)
```

### 2.5 Dark Mode Mapping

SaaS dark modes are **not just inverted**. They are slightly desaturated, slightly lifted, with carefully tuned elevation. Use `#0A0E1A` (or `#0B0F1C`) as the canvas — NEVER `#000000`. Pure black creates harsh contrast and exposes any banding in shadows.

| Token | Light | Dark |
|---|---|---|
| `--bg-canvas` | `#F8FAFC` | `#0A0E1A` |
| `--bg-surface` | `#FFFFFF` | `#111827` |
| `--bg-elevated` | `#FFFFFF` | `#1F2937` |
| `--bg-overlay` (popover/modal) | `#FFFFFF` | `#1F2937` |
| `--text-primary` | `#0F172A` | `#F1F5F9` |
| `--text-muted` | `#475569` | `#94A3B8` |
| `--text-subtle` | `#94A3B8` | `#64748B` |
| `--border-default` | `#E2E8F0` | `#1F2937` |
| `--border-strong` | `#CBD5E1` | `#374151` |
| `--brand-bg-subtle` | `#EEF0FB` | `rgba(94, 106, 210, 0.16)` |
| `--brand-fg` | `#5E6AD2` | `#A5B4FC` |

In dark mode the **brand color shifts lighter** (toward `--brand-500/400` instead of `--brand-600/700`) to maintain contrast against the dark canvas.

---

## 3. Typography

### 3.1 Font Stack

```css
--font-sans: "Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI",
             "SF Pro Text", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Geist Mono", "SF Mono", "Menlo", "Consolas",
             ui-monospace, monospace;
```

Hard rules:
- **Never use `Arial`, `Helvetica`, `Roboto`, or `Times`** in a SaaS UI. These read as default/unstyled. If you can't load a webfont, fall through to `system-ui` instead.
- **Never mix two display fonts.** One sans + one mono is the entire stack.
- **`font-feature-settings: "cv11", "ss01", "ss03"`** for Inter (or whatever stylistic sets your font has) — small caps and alternate forms make tables look intentional.
- **`font-variant-numeric: tabular-nums`** on EVERY column that contains numbers (money, dates, IDs, counts). Non-tabular figures make rows shimmer.

### 3.2 Type Scale (SaaS-tuned — denser than marketing)

| Token | Size | Line Height | Weight | Letter Spacing | Use |
|---|---|---|---|---|---|
| `text-2xs` | 11px / 0.6875rem | 1.36 (15px) | 500 | 0.04em | Microlabels (uppercase metadata, table column tags) |
| `text-xs` | 12px / 0.75rem | 1.33 (16px) | 400/500 | 0 | Captions, badge text, table secondary |
| `text-sm` | 13px / 0.8125rem | 1.38 (18px) | 400/500 | 0 | **Default UI text**: table rows, buttons, form labels |
| `text-base` | 14px / 0.875rem | 1.43 (20px) | 400/500 | 0 | Body text, paragraph copy in panels |
| `text-md` | 15px / 0.9375rem | 1.47 (22px) | 400/500 | 0 | Comfortable reading (descriptions, modals) |
| `text-lg` | 16px / 1rem | 1.5 (24px) | 500/600 | -0.005em | Card headings, sidebar section labels |
| `text-xl` | 18px / 1.125rem | 1.44 (26px) | 600 | -0.01em | Subsection headings |
| `text-2xl` | 20px / 1.25rem | 1.4 (28px) | 600 | -0.015em | Page subheadings |
| `text-3xl` | 24px / 1.5rem | 1.33 (32px) | 600 | -0.02em | Page title (h1 in dashboards) |
| `text-4xl` | 30px / 1.875rem | 1.2 (36px) | 600/700 | -0.025em | Marketing-adjacent hero in settings |

**Critical**: the default UI size in SaaS is **13px or 14px**, NOT 16px. Stripe is 14px. Linear is 13px. Vercel is 14px. 16px feels too big and creates pages that scroll forever.

### 3.3 Weights

| Weight | Value | Use |
|---|---|---|
| Regular | 400 | Body, table cells, descriptions |
| Medium | 500 | Default for buttons, labels, table headers, navigation, badge text |
| Semibold | 600 | Headings, emphasized stats, active nav |
| Bold | 700 | Rare — only marketing-adjacent surfaces or KPI numbers |

**Never** use weight 800 or 900 in a SaaS UI.

### 3.4 Letter Spacing

| Context | Value |
|---|---|
| Body / table | 0 |
| Headings ≥18px | -0.01em to -0.025em (tighter as size grows) |
| Microlabels / uppercase | 0.04em to 0.06em |
| Mono | 0 |

### 3.5 Text Rendering

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
}

.numeric, table, [data-numeric] {
  font-variant-numeric: tabular-nums;
}
```

---

## 4. Spacing System

### 4.1 Base Unit

```css
--space-unit: 4px;
```

### 4.2 Scale

| Token | px | rem | Common Use |
|---|---|---|---|
| `space-0` | 0 | 0 | Reset |
| `space-px` | 1 | — | Hairlines, dividers |
| `space-0.5` | 2 | 0.125 | Tight icon-to-text gaps |
| `space-1` | 4 | 0.25 | Inline tight |
| `space-1.5` | 6 | 0.375 | — |
| `space-2` | 8 | 0.5 | Default tight gap, icon-text, badge padding |
| `space-2.5` | 10 | 0.625 | Input vertical padding (compact) |
| `space-3` | 12 | 0.75 | Input vertical padding (default), small card |
| `space-4` | 16 | 1 | **Default card/panel padding**, form field gaps |
| `space-5` | 20 | 1.25 | Section subheading gap |
| `space-6` | 24 | 1.5 | Card padding (comfortable), section internal |
| `space-8` | 32 | 2 | Page section gap, large card padding |
| `space-10` | 40 | 2.5 | Major section gap |
| `space-12` | 48 | 3 | Page-level section gap |
| `space-16` | 64 | 4 | Hero, max page-section |

**Density convention** (which scale value to default to):

- Buttons: `8px 12px` (sm), `8px 14px` (md), `10px 16px` (lg) — vertical padding stays tight
- Inputs: `8px 12px` (sm), `9px 12px` (md), `10px 14px` (lg)
- Cards: `16px` (sm), `20-24px` (md), `32px` (lg / settings panel)
- Table cells: `10px 16px` (compact), `12px 16px` (default), `16px 20px` (comfortable)
- Page padding: `24px` (mobile) → `32px` (desktop) → `48px` (wide settings)

---

## 5. Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-none` | 0 | Table cells, full-bleed sections |
| `--radius-sm` | 4px | Badges, tags, small chips |
| `--radius-md` | 6px | **Default**: buttons, inputs, dropdowns, menu items |
| `--radius-lg` | 8px | Cards, panels, popovers |
| `--radius-xl` | 12px | Modals, large surfaces, sheets |
| `--radius-2xl` | 16px | Marketing-adjacent (pricing card, onboarding) |
| `--radius-full` | 9999px | Avatars, status dots, **NOT buttons** |

Rules:
- **Buttons in SaaS UIs use 6px, not pill (`9999px`).** Pills are for marketing/consumer apps. The exception is a "tag" or "chip" inside a table cell.
- **Match input and button radius.** If button = 6px, input = 6px. Visual consistency in form rows.
- **Cards never share radius with modals.** Cards = 8px, modals = 12px+. This is how the modal reads as a different elevation layer.

---

## 6. Shadow System (Elevation)

SaaS shadows are **tight, downward, single-direction**. They mark elevation; they do not decorate. No glows, no colored shadows, no inset highlights, no large spread radii.

### 6.1 Elevation Tokens

```css
/* Light mode */
--shadow-xs:  0 1px 2px 0 rgba(15, 23, 42, 0.04);
--shadow-sm:  0 1px 2px 0 rgba(15, 23, 42, 0.05),
              0 1px 3px 0 rgba(15, 23, 42, 0.06);
--shadow-md:  0 2px 4px -1px rgba(15, 23, 42, 0.06),
              0 4px 6px -2px rgba(15, 23, 42, 0.04);
--shadow-lg:  0 4px 6px -2px rgba(15, 23, 42, 0.05),
              0 10px 15px -3px rgba(15, 23, 42, 0.08);
--shadow-xl:  0 8px 10px -4px rgba(15, 23, 42, 0.06),
              0 20px 25px -5px rgba(15, 23, 42, 0.10);
--shadow-2xl: 0 25px 50px -12px rgba(15, 23, 42, 0.18);

/* Focus ring (NOT a shadow, but the only "glow" allowed) */
--ring-focus: 0 0 0 3px rgba(94, 106, 210, 0.20);
--ring-error: 0 0 0 3px rgba(220, 38, 38, 0.16);

/* Dark mode: shadows almost invisible; elevation is conveyed via background lightening */
--shadow-xs-dark:  0 1px 2px 0 rgba(0, 0, 0, 0.30);
--shadow-sm-dark:  0 1px 3px 0 rgba(0, 0, 0, 0.40);
--shadow-md-dark:  0 4px 8px -2px rgba(0, 0, 0, 0.50);
--shadow-lg-dark:  0 12px 20px -6px rgba(0, 0, 0, 0.55);
```

### 6.2 Elevation → Component Mapping

| Layer | Shadow | Examples |
|---|---|---|
| 0 (flat on canvas) | none | Sidebar, page body, inline rows |
| 1 (resting card) | `--shadow-xs` or none + 1px border | Default card on `--bg-canvas` |
| 2 (hovered card) | `--shadow-sm` | Card with `:hover` state |
| 3 (dropdown, popover) | `--shadow-md` | Menu, popover, select dropdown |
| 4 (modal, dialog) | `--shadow-xl` | Dialog, slide-over |
| 5 (toast over modal) | `--shadow-2xl` | Toast, command palette over modal backdrop |

### 6.3 Border-vs-Shadow Decision

For most cards, **prefer a 1px border over a shadow**. Borders are crisper at any DPI and read more "product". Use shadow only when:
- The element is floating over content (popover, modal, dropdown, toast)
- A drag-and-drop ghost is rendered
- A row is "lifted" to indicate selection while dragging

---

## 7. Animation System

### 7.1 Principle

SaaS motion is **fast, ease-out, and only on user-initiated events**. No entrance animations on page mount, no decorative parallax, no stagger on every grid. Motion's job is to confirm an action happened, not to entertain.

### 7.2 Easing

```css
/* Default — used for most state transitions */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* expo-out, snappy */

/* For things that recoil (modal entrance, popover) */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Press / active (deceleration into rest) */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Linear — for indeterminate progress / spinners only */
--ease-linear: linear;
```

**Do NOT use** `ease`, `ease-in`, or unspecified defaults. They feel sluggish in SaaS contexts.

### 7.3 Duration Scale

| Token | ms | Use |
|---|---|---|
| `--duration-75` | 75 | Color change, opacity flip (button press color) |
| `--duration-100` | 100 | Hover background fill |
| `--duration-150` | 150 | **Default** — most transitions |
| `--duration-200` | 200 | Dropdown/popover enter |
| `--duration-250` | 250 | Modal/dialog enter |
| `--duration-300` | 300 | Slide-over (drawer) enter |
| `--duration-500` | 500 | Skeleton shimmer cycle |

**Anything longer than 300ms in a product UI is wrong.** Marketing pages can take more time; product UIs cannot.

### 7.4 Standard Transitions

```css
/* Color/border (default for all interactive elements) */
button, a, input, select, textarea, [role="button"] {
  transition:
    background-color var(--duration-150) var(--ease-out),
    border-color var(--duration-150) var(--ease-out),
    color var(--duration-150) var(--ease-out),
    box-shadow var(--duration-150) var(--ease-out);
}

/* Modal/dialog */
.dialog-enter { animation: dialog-enter 250ms var(--ease-out-back); }
@keyframes dialog-enter {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Popover/dropdown */
.popover-enter { animation: popover-enter 150ms var(--ease-out); }
@keyframes popover-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Toast slide-in */
.toast-enter { animation: toast-enter 200ms var(--ease-out); }
@keyframes toast-enter {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Skeleton shimmer */
.skeleton {
  background: linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 50%, var(--neutral-100) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
```

### 7.5 What NOT to Animate

- **Page mount.** Render synchronously. The page is the priority, not the motion.
- **Sidebar nav items individually staggering in.** Render the whole nav at once.
- **Tab content fade.** Switching tabs is an instant context change; fade hides the change.
- **Table rows.** A 1000-row table that fades in row-by-row is unusable.

### 7.6 What SHOULD Animate

- Button hover (background-color 100ms)
- Focus ring (box-shadow 150ms)
- Modal/dialog enter and exit (250ms)
- Popover/dropdown enter (150ms)
- Toast slide-in (200ms)
- Skeleton shimmer (loading states)
- Accordion expand/collapse (height 200ms)
- Optimistic UI confirmations (checkmark scale-in 150ms)

### 7.7 `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Always include. SaaS users may have vestibular sensitivity or use the OS-level reduce-motion setting.

---

## 8. Layout System

### 8.1 The Canonical SaaS Shell

```
┌─────────────────────────────────────────────────────────────────┐
│ [Topbar: workspace switcher | search ⌘K | user menu] 48px       │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│              │   Page header                                    │
│              │   ┌────────────────────────────────────────────┐ │
│              │   │ Title             [primary action] [⋯ menu]│ │
│   Sidebar    │   │ Description / breadcrumb                   │ │
│   (240-     │   └────────────────────────────────────────────┘ │
│    280px)    │                                                  │
│              │   Page body (cards, tables, settings)            │
│   Nav items  │                                                  │
│   Sections   │   ┌──────────────────────────────────────────┐   │
│   Footer     │   │  Card / Panel                            │   │
│              │   └──────────────────────────────────────────┘   │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

This is the Stripe/Linear/Vercel/Notion layout. Three regions:

1. **Topbar** (48–56px): workspace/team switcher on the left, global search (`⌘K`) center or right, user menu on far right. Stays fixed during scroll.
2. **Sidebar** (240–280px): primary nav. Collapsible to a 56px icon rail on narrow screens. Stays fixed during scroll.
3. **Content** (remaining width, max ~1200px centered for readability OR full-width for tables): page header → page body.

Variations:
- **Linear-style** has no topbar — the sidebar takes the whole left edge, search lives inside the content header.
- **Notion-style** has only a sidebar, page-level breadcrumbs at top of content.
- **Settings-style** uses a *secondary* sidebar (settings nav) inside the content area, so two sidebars are visible.

### 8.2 Container Widths

| Token | px | Use |
|---|---|---|
| `--container-sm` | 640 | Single-column forms, auth, dialogs |
| `--container-md` | 768 | Settings forms, account pages |
| `--container-lg` | 1024 | Dashboard pages, default content max |
| `--container-xl` | 1280 | Wide dashboards with sidebars-in-content |
| `--container-2xl` | 1536 | Data tables, monitoring views (full-bleed) |

**Tables get `--container-2xl` or full-bleed.** Settings forms get `--container-md` (max ~720px reading column).

### 8.3 Breakpoints

| Name | min-width | Behavior |
|---|---|---|
| `sm` | 640px | Form inputs reach full width on phones |
| `md` | 768px | Two-column form layouts kick in |
| `lg` | 1024px | Sidebar appears (below this, sidebar becomes a sheet/drawer) |
| `xl` | 1280px | Sidebar stays expanded; data tables show all columns |
| `2xl` | 1536px | Multi-column dashboards |

Mobile rule: the sidebar collapses to a hamburger that opens a full-height sheet. The topbar's search and user menu remain.

### 8.4 Grid Patterns

```css
/* Page header — title left, actions right */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

/* Two-column form (label left, input right) — settings page idiom */
.form-row {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  gap: 24px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-default);
}
.form-row:last-child { border-bottom: none; }
.form-row__label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.form-row__hint  { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* Card grid (3-col on desktop, 2 on tablet, 1 on mobile) */
.card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) { .card-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .card-grid { grid-template-columns: repeat(3, 1fr); } }

/* KPI strip — auto-fit, never wider than 280, never narrower than 200 */
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
```

### 8.5 Sidebar Anatomy

```
[Workspace switcher]      32px row, hover bg, dropdown chevron
─────────────────────
SECTION LABEL             11px uppercase, --neutral-500, 8px y-padding
  [icon] Item 1           36px row, 13px text, 8px gap, hover bg-100
  [icon] Item 2           selected: bg-brand-50 + brand-700 text
  [icon] Item 3
─────────────────────
SECTION LABEL
  [icon] Item 4
─────────────────────
                          (stretches to fill)
[avatar] user@email       Bottom; opens user menu upward
```

Key spec:
- Sidebar bg: `--bg-canvas` (slightly tinted from page surface) OR `--bg-surface` flat
- Nav items: 36px tall, 8px horizontal padding, 6px radius, gap 8px between icon + text
- Active item: `bg: var(--brand-50)`, `color: var(--brand-700)`, **no border, no left-accent stripe** (Linear-style minimal)
- Section labels: `text-2xs` uppercase, `--neutral-500`, 8px y-padding
- Width: 256px default, 56px collapsed (icons only)

---

## 9. Dark Mode

### 9.1 Detection

```html
<script>
  (function() {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  })();
</script>
```

Inline in `<head>` BEFORE any stylesheets to prevent flash-of-light-theme on dark-preferred users.

### 9.2 CSS Token Mapping

```css
:root {
  --bg-canvas: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-elevated: #FFFFFF;
  --text-primary: #0F172A;
  --text-muted: #475569;
  --text-subtle: #94A3B8;
  --border-default: #E2E8F0;
  --border-strong: #CBD5E1;
  --brand-fg: #5E6AD2;
  --brand-bg-subtle: #EEF0FB;
}

.dark {
  --bg-canvas: #0A0E1A;
  --bg-surface: #111827;
  --bg-elevated: #1F2937;
  --text-primary: #F1F5F9;
  --text-muted: #94A3B8;
  --text-subtle: #64748B;
  --border-default: #1F2937;
  --border-strong: #374151;
  --brand-fg: #A5B4FC;
  --brand-bg-subtle: rgba(94, 106, 210, 0.16);
}
```

### 9.3 Three-Way Theme Toggle

Always offer `system | light | dark`. The user expects to match OS preference by default but be able to override.

```javascript
function setTheme(mode /* 'system' | 'light' | 'dark' */) {
  if (mode === 'system') {
    localStorage.removeItem('theme');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } else {
    localStorage.setItem('theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    document.documentElement.classList.toggle('dark', e.matches);
  }
});
```

### 9.4 Dark-Mode-Specific Rules

- **Borders go invisible.** In dark mode, a 1px border with `rgba(255, 255, 255, 0.08)` reads cleaner than the inverted neutral. Use a slightly translucent border for surfaces, solid `--border-default` for input fields.
- **No drop shadows.** Or, dramatically reduce them. In dark mode, elevation is conveyed by *lighter* surface backgrounds, not by darker shadows underneath.
- **Brand color shifts lighter.** `--brand-fg` becomes `#A5B4FC` (brand-300/400 range) so it has enough contrast against the dark canvas.
- **Image / chart luminance.** If you render charts/screenshots inside a card, the card background should be `--bg-elevated` (lighter than canvas) so the artwork doesn't appear floating on void.

---

## 10. Accessibility

### 10.1 Color Contrast

Minimum ratios:
- **Body text on background: 4.5:1** (WCAG AA Normal Text)
- **Large text (≥18px or 14px bold) on background: 3:1**
- **UI components (button border, input border, focus ring) against adjacent color: 3:1**
- **Non-text indicators (icons that convey state): 3:1**

Verify the included palette:
- `#0F172A` on `#FFFFFF` = 19.3:1 ✓
- `#475569` (muted) on `#FFFFFF` = 7.5:1 ✓
- `#94A3B8` (subtle) on `#FFFFFF` = 3.6:1 ✓ (large text / decorative only)
- `#5E6AD2` (brand) on `#FFFFFF` = 5.7:1 ✓
- `#FFFFFF` on `#5E6AD2` (brand button) = 5.7:1 ✓

### 10.2 Focus States

```css
/* Default focus ring for all interactive elements */
*:focus { outline: none; }
*:focus-visible {
  outline: 2px solid var(--brand-fg);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* For elements with their own visual treatment (buttons, inputs), use box-shadow ring */
button:focus-visible,
[role="button"]:focus-visible,
a:focus-visible {
  outline: none;
  box-shadow: var(--ring-focus);
}

input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--brand-fg);
  box-shadow: var(--ring-focus);
}
```

**Never remove the focus ring without replacing it.** This is the single most common SaaS accessibility regression.

### 10.3 Keyboard Map (every SaaS app should implement)

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `/` | Focus the page search input |
| `g` then `d` | Go to dashboard (vim-style nav, optional but Linear/GitHub do it) |
| `?` | Show keyboard shortcut cheat sheet |
| `Esc` | Close modal, dismiss popover, blur input |
| `Tab` / `Shift+Tab` | Move focus forward/back |
| `Enter` | Activate focused button/link; submit form when input focused |
| `Space` | Toggle checkbox/switch; activate button |
| `↑` / `↓` | Navigate list items, table rows, menu items |
| `j` / `k` | Same as ↓ / ↑ (vim-style; optional) |

### 10.4 Semantic Patterns

- Buttons use `<button>`, links use `<a href>`. **Never** use a `<div onClick>` for either.
- Form fields have a visible `<label>` (or `aria-label` if visually replaced by a placeholder pattern).
- Required fields: visible `*` marker AND `aria-required="true"`.
- Error messages: linked via `aria-describedby`, role `alert` for the first error.
- Tables: `<th scope="col">` headers, optional `<caption>` for context.
- Modals: trap focus, restore focus to trigger on close, `aria-modal="true"`, `role="dialog"`, labeled by heading.
- Toasts: `role="status"` for non-critical, `role="alert"` for errors.

### 10.5 Touch Targets

Minimum 44×44px (WCAG 2.5.5). On desktop SaaS, buttons can be 32-36px tall as long as the **clickable hit area** (via padding) reaches 44px.

```css
.icon-button {
  position: relative;
  width: 32px;
  height: 32px;
}
.icon-button::before {
  content: '';
  position: absolute;
  inset: -6px;  /* extends hit area to 44x44 */
}
```

### 10.6 Screen Reader Utilities

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sr-only-focusable:focus {
  position: static;
  width: auto;
  height: auto;
  clip: auto;
  white-space: normal;
}
```

Use `.sr-only` for "Skip to main content" links and icon-only button labels.

---

## 11. Decorative Elements (Used Sparingly)

SaaS UIs avoid heavy decoration. The few decorative idioms that DO appear:

### 11.1 Section Dividers

```css
.divider {
  height: 1px;
  background: var(--border-default);
  margin: 24px 0;
}

/* Vertical divider (e.g., between toolbar groups) */
.divider-v {
  width: 1px;
  background: var(--border-default);
  align-self: stretch;
  margin: 0 8px;
}
```

### 11.2 Inline Pills / Status Dots

```css
/* Status dot (used in tables: ● Active) */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  vertical-align: middle;
  margin-right: 6px;
}
.status-dot--success { background: #16A34A; }
.status-dot--warning { background: #CA8A04; }
.status-dot--error   { background: #DC2626; }
.status-dot--neutral { background: #94A3B8; }

/* Pulsing dot for "live" / "syncing" */
.status-dot--pulse {
  position: relative;
}
.status-dot--pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: inherit;
  animation: pulse-ring 1.6s ease-out infinite;
}
@keyframes pulse-ring {
  0%   { transform: scale(1);   opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

### 11.3 Empty-State Iconography Placeholder

For empty states, draw a single 1.5px-stroke line icon at 48–64px size in `--neutral-300`. Do not use 3D illustrations or stock vectors — they break the "quiet product" register.

```html
<div class="empty-state">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
       style="color: var(--neutral-300);">
    <!-- single line-art icon (e.g., a Lucide icon) -->
  </svg>
  <h3>No customers yet</h3>
  <p>Customers appear here after their first successful payment.</p>
  <button>Create test customer</button>
</div>
```

### 11.4 Subtle Background Grid (for empty canvases)

For dashboard backgrounds, an OPTIONAL very subtle dot grid is acceptable:

```css
.canvas-grid {
  background-color: var(--bg-canvas);
  background-image: radial-gradient(circle, var(--neutral-200) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0;
}
```

Opacity: never above 30%. Most SaaS apps omit this entirely.

### 11.5 Keyboard Shortcut Chips

```css
.kbd {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.2;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-bottom-width: 2px;  /* mechanical key look */
  border-radius: 4px;
  vertical-align: middle;
}
```

Usage: `<span class="kbd">⌘</span><span class="kbd">K</span>` inside tooltips, menu items, command palette.

---

## 12. Component Quick Reference

### Buttons

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `primary` | `--brand-600` | `#FFFFFF` | none | The one primary action per surface |
| `secondary` | `--bg-surface` | `--text-primary` | `--border-default` 1px | Most actions ("Cancel", "Save", "Edit") |
| `ghost` | transparent | `--text-primary` | none | Toolbar buttons, table row actions |
| `destructive` | `#DC2626` | `#FFFFFF` | none | Delete, revoke, irreversible |
| `destructive-outline` | `--bg-surface` | `#B91C1C` | `#FCA5A5` | Less aggressive destructive |
| `link` | none | `--brand-600` | none, underline on hover | Inline navigation actions |

Sizes: `sm` (28px tall, 12px text), `md` (32px tall, 13px text — **default**), `lg` (40px tall, 14px text).

### Inputs

| State | Border | Background | Shadow |
|---|---|---|---|
| default | `--border-default` | `--bg-surface` | none |
| hover | `--border-strong` | `--bg-surface` | none |
| focus | `--brand-fg` | `--bg-surface` | `--ring-focus` |
| error | `#DC2626` | `--bg-surface` | `--ring-error` |
| disabled | `--border-default` | `--neutral-50` | none, `opacity: 0.6` |

Sizes match buttons: `sm` (28px), `md` (32px default), `lg` (40px).

### Cards

| Variant | Background | Border | Padding | Shadow |
|---|---|---|---|---|
| default | `--bg-surface` | 1px `--border-default` | 20px | none |
| interactive | `--bg-surface` | 1px `--border-default` | 20px | hover: `--shadow-sm` |
| ghost | none | none | 0 | none — for grouping without enclosure |
| elevated | `--bg-elevated` | none | 24px | `--shadow-md` |
| outline-only | none | 1px `--border-default` | 16px | none — for placeholder/empty slots |

### Badges / Status Pills

| Variant | Background | Text | Border |
|---|---|---|---|
| neutral | `--neutral-100` | `--neutral-700` | none |
| brand | `--brand-50` | `--brand-700` | none |
| success | `#DCFCE7` | `#15803D` | none |
| warning | `#FEF9C3` | `#A16207` | none |
| error | `#FEE2E2` | `#B91C1C` | none |
| info | `#DBEAFE` | `#1D4ED8` | none |

Sizing: padding `2px 8px`, font 11–12px, weight 500, radius 4px (NOT pill). Optional leading status dot.

---

## 13. File Structure Recommendation

```
project/
├── src/
│   ├── styles/
│   │   ├── tokens.css           # All CSS custom properties (one file, single source of truth)
│   │   ├── base.css             # Reset, html/body, typography defaults, focus
│   │   └── globals.css          # @import the above + utility classes
│   ├── components/
│   │   ├── primitives/          # Lowest-level, design-token-aware
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Switch.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Kbd.tsx
│   │   │   └── Spinner.tsx
│   │   ├── overlays/            # Floating layers
│   │   │   ├── Dialog.tsx
│   │   │   ├── Sheet.tsx
│   │   │   ├── Popover.tsx
│   │   │   ├── DropdownMenu.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── CommandPalette.tsx
│   │   ├── data/                # Data display
│   │   │   ├── DataTable.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── forms/
│   │   │   ├── FormField.tsx
│   │   │   ├── FormRow.tsx
│   │   │   └── FormSection.tsx
│   │   └── shell/               # The app frame
│   │       ├── AppShell.tsx
│   │       ├── Sidebar.tsx
│   │       ├── Topbar.tsx
│   │       ├── PageHeader.tsx
│   │       └── Breadcrumb.tsx
│   └── lib/
│       ├── theme.ts             # Theme toggle (system/light/dark)
│       ├── shortcuts.ts         # Global keyboard handler
│       └── format.ts            # Money, date, relative time helpers
├── tailwind.config.ts           # Tokens mirrored from tokens.css
└── tsconfig.json
```

Rules:
- **`tokens.css` is the single source of truth.** `tailwind.config.ts` reads from it (or duplicates its values, but only as a mirror).
- **Primitives have no business logic.** They accept props, render styled DOM. State lives in feature components that wrap them.
- **No component crosses layer boundaries.** A primitive can't import from `shell/`; `shell/` can't import from `data/`.

---

## 14. Full CSS Custom Properties

Copy into `styles/tokens.css`:

```css
:root {
  /* ── Brand ── */
  --brand-50:  #EEF0FB;
  --brand-100: #DDE0F7;
  --brand-200: #B9C0EF;
  --brand-500: #7B85DC;
  --brand-600: #5E6AD2;
  --brand-700: #4A56C0;
  --brand-800: #3A45A8;
  --brand-900: #2A3284;
  --brand-fg: var(--brand-600);
  --brand-bg-subtle: var(--brand-50);

  /* ── Neutrals (slate) ── */
  --neutral-0:   #FFFFFF;
  --neutral-50:  #F8FAFC;
  --neutral-100: #F1F5F9;
  --neutral-200: #E2E8F0;
  --neutral-300: #CBD5E1;
  --neutral-400: #94A3B8;
  --neutral-500: #64748B;
  --neutral-600: #475569;
  --neutral-700: #334155;
  --neutral-800: #1E293B;
  --neutral-900: #0F172A;
  --neutral-950: #020617;

  /* ── Semantic surfaces ── */
  --bg-canvas:   var(--neutral-50);
  --bg-surface:  var(--neutral-0);
  --bg-elevated: var(--neutral-0);
  --bg-hover:    var(--neutral-100);

  --text-primary: var(--neutral-900);
  --text-muted:   var(--neutral-600);
  --text-subtle:  var(--neutral-400);

  --border-default: var(--neutral-200);
  --border-strong:  var(--neutral-300);

  /* ── State ── */
  --success-fg:  #15803D;
  --success-bg:  #DCFCE7;
  --warning-fg:  #A16207;
  --warning-bg:  #FEF9C3;
  --error-fg:    #B91C1C;
  --error-bg:    #FEE2E2;
  --info-fg:     #1D4ED8;
  --info-bg:     #DBEAFE;

  /* ── Chart palette ── */
  --chart-1: #2563EB;
  --chart-2: #16A34A;
  --chart-3: #CA8A04;
  --chart-4: #DC2626;
  --chart-5: #9333EA;
  --chart-6: #0891B2;
  --chart-7: #DB2777;
  --chart-8: #65A30D;

  /* ── Typography ── */
  --font-sans: "Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI",
               "SF Pro Text", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Geist Mono", "SF Mono", "Menlo", "Consolas",
               ui-monospace, monospace;

  /* ── Spacing (multiples of 4) ── */
  --space-unit: 4px;

  /* ── Radius ── */
  --radius-none: 0;
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-2xl:  16px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-xs:  0 1px 2px 0 rgba(15, 23, 42, 0.04);
  --shadow-sm:  0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.06);
  --shadow-md:  0 2px 4px -1px rgba(15, 23, 42, 0.06), 0 4px 6px -2px rgba(15, 23, 42, 0.04);
  --shadow-lg:  0 4px 6px -2px rgba(15, 23, 42, 0.05), 0 10px 15px -3px rgba(15, 23, 42, 0.08);
  --shadow-xl:  0 8px 10px -4px rgba(15, 23, 42, 0.06), 0 20px 25px -5px rgba(15, 23, 42, 0.10);
  --shadow-2xl: 0 25px 50px -12px rgba(15, 23, 42, 0.18);
  --ring-focus: 0 0 0 3px rgba(94, 106, 210, 0.20);
  --ring-error: 0 0 0 3px rgba(220, 38, 38, 0.16);

  /* ── Motion ── */
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-back:   cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);
  --duration-75:  75ms;
  --duration-100: 100ms;
  --duration-150: 150ms;
  --duration-200: 200ms;
  --duration-250: 250ms;
  --duration-300: 300ms;

  /* ── Layout ── */
  --container-sm:  640px;
  --container-md:  768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1536px;
  --sidebar-w:        256px;
  --sidebar-w-collapsed: 56px;
  --topbar-h:         48px;
}

.dark {
  --bg-canvas:   #0A0E1A;
  --bg-surface:  #111827;
  --bg-elevated: #1F2937;
  --bg-hover:    rgba(255, 255, 255, 0.04);

  --text-primary: #F1F5F9;
  --text-muted:   #94A3B8;
  --text-subtle:  #64748B;

  --border-default: #1F2937;
  --border-strong:  #374151;

  --brand-fg:         #A5B4FC;
  --brand-bg-subtle:  rgba(94, 106, 210, 0.16);

  --success-fg: #4ADE80;
  --success-bg: rgba(22, 163, 74, 0.16);
  --warning-fg: #FACC15;
  --warning-bg: rgba(202, 138, 4, 0.16);
  --error-fg:   #F87171;
  --error-bg:   rgba(220, 38, 38, 0.16);
  --info-fg:    #60A5FA;
  --info-bg:    rgba(37, 99, 235, 0.16);

  --shadow-xs:  0 1px 2px 0 rgba(0, 0, 0, 0.30);
  --shadow-sm:  0 1px 3px 0 rgba(0, 0, 0, 0.40);
  --shadow-md:  0 4px 8px -2px rgba(0, 0, 0, 0.50);
  --shadow-lg:  0 12px 20px -6px rgba(0, 0, 0, 0.55);
  --shadow-xl:  0 20px 32px -10px rgba(0, 0, 0, 0.60);
  --shadow-2xl: 0 30px 60px -15px rgba(0, 0, 0, 0.70);
}

/* ── Base ── */
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "cv11" 1, "ss01" 1;
}

body {
  margin: 0;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.43;
}

.numeric, table, [data-numeric="true"] {
  font-variant-numeric: tabular-nums;
}

*:focus { outline: none; }
*:focus-visible {
  outline: 2px solid var(--brand-fg);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 15. Forensic Visual Analysis

> **Design Language DNA & Implementation Physics**
> Reverse-engineered patterns from Stripe Dashboard, Linear, Vercel, Notion, Clerk, PlanetScale.

### 15.1 Visual Hierarchy & Spatial Logic

#### Density Tier

| Tier | Row Height | Button Height | Default Text | When |
|---|---|---|---|---|
| **Compact** (Linear, dev tools) | 32px | 28px | 13px | Power-user surfaces, data-heavy tables |
| **Default** (Stripe, Vercel) | 40px | 32px | 14px | The default SaaS product UI |
| **Comfortable** (Notion, Clerk) | 48px | 36px | 15px | Content-heavy, settings, billing |
| **Spacious** (Auth, onboarding) | 56px+ | 40px+ | 16px | Single-purpose conversion pages |

**Pick one tier per product, not per page.** Mixing density breaks the rhythm.

#### Layout Constants

```
Content width:
├── Tables / lists:       full bleed within --container-2xl (1536px)
├── Dashboards:           --container-xl (1280px) centered
├── Settings forms:       --container-md (768px) — readable column
└── Auth / onboarding:    --container-sm (640px) centered

Page padding (X):
├── Mobile:    16px (px-4)
├── Tablet:    24px (px-6)
└── Desktop:   32px (px-8)

Page padding (Y):
├── Page header → content:     16-24px
├── Section → section:         32-40px
└── Last section → page end:   64px (so footer doesn't crowd)

Grid gaps:
├── KPI cards:           12px
├── Card grids:          16px (sm) → 20px (md) → 24px (lg)
├── Form fields:         16px (tight) or 20px (default)
└── Settings rows:       0 — separated by 1px bottom border
```

#### The "Three Heights" Rule

In a SaaS UI, three vertical rhythms coexist:

1. **Page rhythm**: 24px / 32px / 48px between page sections.
2. **Component rhythm**: 12px / 16px / 20px inside cards and panels.
3. **Inline rhythm**: 4px / 6px / 8px between adjacent elements (icon + label, badge + text).

Each rhythm is a multiple of 4 but **does not reuse** the same numbers from another rhythm. Inline gaps stay ≤8px, component gaps stay 12–20px, page gaps stay ≥24px. This is what makes a SaaS UI feel "organized" without conscious effort.

### 15.2 Color Science & Elevation

#### How elevation is conveyed (without heavy shadows)

| Layer | Light Mode | Dark Mode |
|---|---|---|
| Canvas | `#F8FAFC` (1 step down from white) | `#0A0E1A` |
| Surface (default card) | `#FFFFFF` + 1px border | `#111827` + 1px `rgba(255,255,255,0.04)` border |
| Elevated (popover) | `#FFFFFF` + `--shadow-md` | `#1F2937` + low shadow |
| Modal | `#FFFFFF` + `--shadow-xl` + backdrop blur | `#1F2937` + `--shadow-xl` + backdrop blur |

In light mode, elevation = subtle shadow + 1px border.
In dark mode, elevation = LIGHTER background (the higher the layer, the lighter the bg) + nearly-invisible shadow.

#### Brand color is "interaction language"

- Brand color = "this is interactive, this is selected, this is focused."
- Anything else uses neutrals.
- Status colors (success/error/etc.) are ONLY for status — never for buttons that don't represent that status.

A useful test: **squint at the UI**. You should see 90% gray-on-white, with brand pinpricks marking exactly the interactive surface you'd click.

#### Selected-state convention

| State | Convention |
|---|---|
| Hover | Background shifts by 1 step (`--bg-surface` → `--bg-hover`) |
| Active (pressed) | Background shifts by 2 steps OR scale(0.98) |
| Selected (persistent) | `--brand-bg-subtle` background + `--brand-fg` text. **No border change.** |
| Focused (keyboard) | `--ring-focus` box-shadow ring. Independent of hover/selected. |
| Disabled | `opacity: 0.5` + `cursor: not-allowed`. Color unchanged. |

### 15.3 Typography & Micro-Copy

#### The "13/14 default" rule

The default body/UI size is **13px or 14px**. Headings step up modestly (no 48px headlines in a dashboard). The biggest text in a typical product page is the H1 at 24–30px.

| Element | Size | Weight |
|---|---|---|
| H1 (page title) | 24px | 600 |
| H2 (section) | 18px | 600 |
| H3 (card heading) | 15-16px | 600 |
| Body / table cell | 13-14px | 400 |
| Label / button | 13-14px | 500 |
| Microlabel / caption | 11-12px | 500 (uppercase optional) |
| Mono (id, code, money) | 12-13px | 400 |

#### Micro-copy patterns

**Buttons** — verb + object, never just verb:
- ✅ "Create customer", "Save changes", "Delete invoice"
- ❌ "Submit", "OK", "Click here"

**Empty state headings** — declarative, not interrogative:
- ✅ "No active subscriptions"
- ❌ "You don't have any subscriptions yet, would you like to create one?"

**Inline help / hints** — single sentence, no period (because it's not a sentence in form context):
- ✅ "Used for receipts and customer emails"
- ❌ "This email will be used for receipts and customer emails."

**Destructive confirmation** — type-to-confirm for irreversible:
- "Type `acme-corp` to confirm deletion" — see GitHub's repo deletion modal.

**Toast text** — past tense, with optional action:
- ✅ "Invoice sent. [Undo]"
- ❌ "Sending invoice…" (use a loading state for in-flight)

### 15.4 Component Anatomy

#### Button (the most-touched primitive)

```
┌────────────────────────────────────┐
│  [icon] [label]            [⌘K]    │   ← gap 8px between icon/label, 12px to shortcut
└────────────────────────────────────┘
   ↑ padding 12-14px              ↑ padding 12-14px
   ─ height: 32px (default)
   ─ radius: 6px
   ─ font: 13px / 500
```

Variants:
- `primary` — solid brand bg, white text. ONE per surface.
- `secondary` — surface bg, neutral border, primary text. Most actions.
- `ghost` — no bg, no border. Toolbar / row actions.
- `destructive` — solid red bg. Reserved for irreversible.

States:
- default → hover (bg shifts) → active (bg shifts more / scale 0.98) → focus (ring) → disabled (opacity 0.5)

Forbidden:
- Pill radius (`9999px`) — that's marketing
- Gradient background — that's marketing
- Drop shadow — buttons are flat against the surface

#### Input

```
┌────────────────────────────────────┐
│  [icon] placeholder text      [×]  │   ← optional leading icon, trailing clear
└────────────────────────────────────┘
   ─ height: 32px (default)
   ─ radius: 6px
   ─ border: 1px --border-default
   ─ padding: 0 12px (or 0 36px when icon present)
   ─ font: 14px / 400
```

Focus state: border → `--brand-fg`, add `--ring-focus` box-shadow. **Never use solid background change for focus** — borders + ring are the convention.

Error state: border → `#DC2626`, ring → `--ring-error`. Show error message below input in `#B91C1C`, 12px, with `aria-describedby` linking.

#### Card

```
┌──────────────────────────────────┐
│  Heading            [actions]    │   ← header row, 16-20px from edges
│  Optional description            │
├──────────────────────────────────┤   ← 1px divider OR padding gap
│                                  │
│  Card body                       │
│                                  │
└──────────────────────────────────┘
   ─ radius: 8px
   ─ border: 1px --border-default
   ─ background: --bg-surface
   ─ padding: 20-24px
   ─ shadow: none (default)
```

The card has a 1px border by default. NO shadow. NO inner glow. The border is what carries the elevation — it implies a layer.

Interactive cards (e.g., clickable list items): hover lightens border to `--border-strong` AND adds `--shadow-sm`. Don't change the background.

### 15.5 Animation Physics

#### Speed map

```
Color/border transitions:     100-150ms
Hover state:                  100ms
Focus ring appearance:        150ms
Dropdown / popover enter:     150ms
Modal / dialog enter:         200-250ms
Slide-over (drawer) enter:    300ms
Toast slide-in:               200ms
Tab switch:                   instant (no animation)
Page mount:                   instant
Skeleton shimmer cycle:       1500ms
Spinner rotation:             750ms per turn
```

#### Easing map

```
Linear → only for indeterminate progress / spinners
ease-out (expo-out, --ease-out) → DEFAULT for everything else
ease-out-back → modal/popover entrance (subtle overshoot)
ease-in-out → reversible transitions (accordion height)
ease-in → almost never; exit animations only
```

#### The "no entrance animation" rule

Page mount animations are bad UX in SaaS:
- The user already navigated; the destination is the priority.
- An entrance animation delays perceived load time.
- Staggered grids look "designed" on first view and tedious on the second.

The ONLY place entrance animation belongs in a product UI is **overlay layers**: modals, popovers, toasts. These are appearing on top of an already-visible page, so the motion is meaningful (where did this come from?).

### 15.6 Technical Deliverables

#### Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EEF0FB', 100: '#DDE0F7', 200: '#B9C0EF',
          500: '#7B85DC', 600: '#5E6AD2', 700: '#4A56C0',
          800: '#3A45A8', 900: '#2A3284',
        },
        neutral: {
          0:   '#FFFFFF', 50:  '#F8FAFC', 100: '#F1F5F9',
          200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
          500: '#64748B', 600: '#475569', 700: '#334155',
          800: '#1E293B', 900: '#0F172A', 950: '#020617',
        },
        canvas:   'var(--bg-canvas)',
        surface:  'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
      },
      fontFamily: {
        sans: ['Inter', 'Geist', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'SF Mono', 'Menlo', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs':  ['11px', { lineHeight: '15px', letterSpacing: '0.04em' }],
        xs:     ['12px', { lineHeight: '16px' }],
        sm:     ['13px', { lineHeight: '18px' }],
        base:   ['14px', { lineHeight: '20px' }],
        md:     ['15px', { lineHeight: '22px' }],
        lg:     ['16px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        xl:     ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        '2xl':  ['20px', { lineHeight: '28px', letterSpacing: '-0.015em' }],
        '3xl':  ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '4xl':  ['30px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        none: '0',
        sm:   '4px',
        DEFAULT: '6px',
        md:   '6px',
        lg:   '8px',
        xl:   '12px',
        '2xl': '16px',
        full: '9999px',
      },
      boxShadow: {
        xs:  '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        sm:  '0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.06)',
        md:  '0 2px 4px -1px rgba(15, 23, 42, 0.06), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
        lg:  '0 4px 6px -2px rgba(15, 23, 42, 0.05), 0 10px 15px -3px rgba(15, 23, 42, 0.08)',
        xl:  '0 8px 10px -4px rgba(15, 23, 42, 0.06), 0 20px 25px -5px rgba(15, 23, 42, 0.10)',
        '2xl': '0 25px 50px -12px rgba(15, 23, 42, 0.18)',
        focus: 'var(--ring-focus)',
        'focus-error': 'var(--ring-error)',
      },
      transitionTimingFunction: {
        out:      'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        75: '75ms', 100: '100ms', 150: '150ms',
        200: '200ms', 250: '250ms', 300: '300ms',
      },
      maxWidth: {
        '8xl': '1536px',
      },
      animation: {
        'dialog-enter':  'dialog-enter 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'popover-enter': 'popover-enter 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-enter':   'toast-enter 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer:         'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        'dialog-enter': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'popover-enter': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-enter': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to:   { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

#### Framer Motion Variants

```typescript
// src/lib/motion.ts
import type { Variants, Transition } from 'framer-motion';

const easeOut: Transition['ease'] = [0.16, 1, 0.3, 1];
const easeOutBack: Transition['ease'] = [0.34, 1.56, 0.64, 1];

/** Modals, dialogs */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.25, ease: easeOutBack },
  },
  exit: {
    opacity: 0, y: 4, scale: 0.99,
    transition: { duration: 0.15, ease: easeOut },
  },
};

/** Dropdowns, popovers, menus */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: easeOut } },
  exit: { opacity: 0, y: -2, transition: { duration: 0.10, ease: easeOut } },
};

/** Toasts */
export const toastVariants: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.20, ease: easeOut } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.15, ease: easeOut } },
};

/** Slide-over / drawer */
export const sheetVariants: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: 0.30, ease: easeOut } },
  exit: { x: '100%', transition: { duration: 0.25, ease: easeOut } },
};

/** Backdrop fade */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.20, ease: 'linear' } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'linear' } },
};

/** Optimistic checkmark (action confirmation) */
export const checkmarkVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1, opacity: 1,
    transition: { duration: 0.20, ease: easeOutBack },
  },
};

/** Accordion expand/collapse */
export const accordionVariants: Variants = {
  collapsed: { height: 0, opacity: 0, transition: { duration: 0.20, ease: easeOut } },
  expanded: { height: 'auto', opacity: 1, transition: { duration: 0.25, ease: easeOut } },
};
```

#### Global Keyboard Handler

```typescript
// src/lib/shortcuts.ts
type Handler = (e: KeyboardEvent) => void;

const handlers = new Map<string, Set<Handler>>();

export function register(combo: string, handler: Handler) {
  if (!handlers.has(combo)) handlers.set(combo, new Set());
  handlers.get(combo)!.add(handler);
  return () => handlers.get(combo)?.delete(handler);
}

function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // Don't trigger global shortcuts inside text fields (except Esc and Mod+K)
    const target = e.target as HTMLElement;
    const inField = target.matches('input, textarea, [contenteditable]');
    const combo = keyOf(e);
    if (inField && combo !== 'escape' && combo !== 'mod+k') return;
    const set = handlers.get(combo);
    if (set?.size) {
      e.preventDefault();
      set.forEach((h) => h(e));
    }
  });
}
```

Usage:
```typescript
useEffect(() => register('mod+k', () => setCommandOpen(true)), []);
useEffect(() => register('/', () => searchRef.current?.focus()), []);
```

---

## 16. SaaS Module Patterns

### 16.1 Application Shell

The canonical layout. Implement once, share across all authenticated pages.

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-canvas text-neutral-900 dark:text-neutral-50">
      <Topbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

Key invariants:
- The whole viewport is `h-screen` with `overflow-hidden`. Only the main content area scrolls.
- The topbar and sidebar are **fixed in place**. They stay visible during scroll.
- The content area has its own scroll context (`overflow-y-auto`), so sticky table headers work inside.
- Max content width caps at `--container-2xl` (1280–1536px) for readability; centered with `mx-auto`.

### 16.2 Page Header

Every page in the app starts with a header. Standard shape:

```tsx
<div className="flex items-start justify-between gap-4 mb-6">
  <div className="min-w-0">
    <Breadcrumb items={[{ label: 'Customers' }, { label: 'Acme Corp' }]} />
    <h1 className="mt-1 text-2xl font-semibold tracking-tight">
      {title}
    </h1>
    {description && (
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {description}
      </p>
    )}
  </div>
  <div className="flex items-center gap-2 shrink-0">
    <Button variant="secondary" size="sm">Export</Button>
    <Button variant="primary" size="sm">New customer</Button>
  </div>
</div>
```

Rules:
- **One H1 per page.** Sub-sections use H2/H3.
- **Max one primary button** in the actions area. Secondary actions can be a chain of `secondary`/`ghost`. Overflow → `…` dropdown.
- **Breadcrumb only when 2+ levels deep.** A bare page doesn't need a breadcrumb that just says "Customers".

### 16.3 Data Tables

The most-used surface in SaaS. Specifications:

```
Row height:        40px (default) / 48px (with avatar)
Cell padding:      0 16px horizontal, vertical centered
Header padding:    same horizontal, 12px vertical
Header background: --bg-canvas (1 step darker than body) — sticks during scroll
Border:            1px between header and body, NO row separators by default
Hover:             row bg → --bg-hover
Selection:         row bg → --brand-bg-subtle, leftmost cell shows brand color stripe (3px wide, only on selected)
Column header:     13px, 500 weight, --text-muted, uppercase optional
Cell text:         13-14px, 400 weight
Numeric columns:   right-aligned, tabular-nums
```

#### Column types

| Type | Alignment | Wrapping | Special |
|---|---|---|---|
| ID / handle | left | nowrap | `font-mono`, `text-neutral-500` |
| Primary name | left | nowrap → truncate | `font-medium` |
| Description | left | clamp 1-2 lines | secondary |
| Date / time | left | nowrap | `data-numeric="true"`, relative on hover absolute |
| Amount / money | right | nowrap | `font-mono`, `tabular-nums` |
| Status | left | nowrap | `<Badge>` |
| Avatar + name | left | nowrap | 24px avatar + 8px gap + name |
| Row actions | right | none | `<DropdownMenu>` triggered by `⋯` icon |

#### Empty / loading / error

- **Empty**: Show empty state component inside the table body row spanning all columns.
- **Loading (initial)**: Render 5–10 skeleton rows matching the column structure.
- **Loading (subsequent)**: Overlay the existing data at 50% opacity with a thin top progress bar.
- **Error**: Replace tbody with an error state row (icon, message, retry button).

#### Pagination

For server-side: bottom-aligned, "Showing 1–25 of 1,247" left, prev/next buttons right. Avoid numbered pagination unless explicitly requested — `Prev | 1 2 3 … 50 | Next` clutters more than it helps.

For client-side small datasets (<200 rows): no pagination; let it scroll within a max-height container.

### 16.4 Settings Pages

Three layouts to choose from:

**A. Single-column settings** (small projects, profile pages):
```
Page header
─────
Form section heading
  Field row (label left @ 240px, input right)
  Field row
  ─ 1px divider ─
  Field row
Form section heading
  Field row
─────
[Save] (sticky bottom OR inline after fields)
```

**B. Sub-nav settings** (most products):
```
Page header
─────
[Profile] [Team] [Billing] [Integrations] [API keys]   ← tabs OR secondary sidebar
─────
Selected tab's content (using layout A)
```

**C. Full app-within-app** (large products):
```
Sidebar → "Settings"
  Sub-sidebar (256px) ────┬──── Content (single-column form)
   Profile                │
   Account                │
   Notifications          │
   Team                   │
   Billing                │
```

Each pattern uses the same form row primitive:

```tsx
<div className="grid grid-cols-[240px_1fr] gap-6 py-5 border-b border-default last:border-b-0">
  <div>
    <label className="text-sm font-medium">Display name</label>
    <p className="mt-1 text-xs text-neutral-500">
      Shown to teammates in mentions and on activity feeds.
    </p>
  </div>
  <div>
    <Input value={name} onChange={setName} maxLength={64} />
    <p className="mt-1.5 text-xs text-neutral-500">{name.length}/64</p>
  </div>
</div>
```

Save patterns:
- **Per-field autosave** (Notion-style): each field debounces and saves on blur. Inline "Saved" toast or checkmark next to the field.
- **Per-section save** (Stripe-style): "Save changes" button activates when the form is dirty, lives at section footer.
- **Page-level sticky save bar** (Vercel-style): when dirty, a bar slides up from bottom: `[Reset]                    [Save changes]`.

Pick one per product and use it everywhere. Mixing is jarring.

### 16.5 Empty States

The empty state is a first-class surface in SaaS. Stripe and Linear use them as activation moments.

Anatomy:
```
[Single line-art icon, 48px, --neutral-300]
[Heading: declarative — "No customers yet"]
[1-line description: what they'd see when populated + why it's empty]
[Primary action: the obvious next step — "Create customer"]
[Secondary action (optional): docs link, sample data]
```

Implementation:
```tsx
<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
  <div className="mb-4 text-neutral-300">
    <UsersIcon size={48} strokeWidth={1.5} />
  </div>
  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
    No customers yet
  </h3>
  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">
    Customers appear here after their first successful payment. You can also
    create one manually.
  </p>
  <div className="mt-6 flex items-center gap-2">
    <Button variant="primary" size="sm">Create customer</Button>
    <Button variant="ghost" size="sm" as="a" href="/docs/customers">
      Read the docs →
    </Button>
  </div>
</div>
```

Variants:
- **First-run empty**: full activation messaging with primary action.
- **Filtered empty** ("No customers match this search"): just heading + suggestion to clear filters. No primary CTA.
- **Permissioned empty** ("You don't have access"): icon + reason + contact-admin link.
- **Error-as-empty**: don't use empty state for errors. Use a dedicated error state with retry.

### 16.6 Authentication

Auth pages are the **only place** in a SaaS where you allow yourself spacious design — they're conversion-focused, single-task surfaces.

Layout:
```
┌────────────────────────────────────────────────┐
│                                                │
│            [logo, 32px]                        │   ← Top centered
│                                                │
│            Sign in to Acme                     │   ← 24px / 600
│            Welcome back                        │   ← 14px / muted
│                                                │
│       ┌────────────────────────────┐           │
│       │ [continue with google]     │           │
│       │ [continue with github]     │           │
│       ├────────────────────────────┤           │
│       │ ─── or ───                 │           │
│       ├────────────────────────────┤           │
│       │ Email                      │           │
│       │ [_____________________]    │           │
│       │ Password           [Forgot]│           │
│       │ [_____________________]    │           │
│       │ [        Sign in       ]   │           │
│       └────────────────────────────┘           │
│                                                │
│       Don't have an account? Sign up →         │
│                                                │
└────────────────────────────────────────────────┘
```

Specs:
- Card max-width: 400px
- Card padding: 32px
- Field gap: 16px
- Primary button: full-width
- Social/SSO buttons: above the email/password divider
- No marketing copy, no "value props" — that's what `/pricing` is for

### 16.7 Modals & Dialogs

Use modals **sparingly**. They block the entire page; only acceptable for:
1. Destructive confirmation (delete, revoke)
2. Critical inline forms (≤5 fields, no nested complexity)
3. Quick previews (image, log line expansion)

For anything bigger, use a **slide-over (sheet)** that takes the right 40-50% of the viewport.

Anatomy:
```
┌──────────────────────────────────┐
│  Delete invoice INV-1024     [×] │   ← Header: title + close button
├──────────────────────────────────┤
│                                  │
│  This action cannot be undone.   │
│  The invoice and its payment     │   ← Body: 14px text
│  history will be permanently     │
│  removed.                        │
│                                  │
│  Type INV-1024 to confirm:       │
│  [_________________]             │
│                                  │
├──────────────────────────────────┤
│              [Cancel] [Delete]   │   ← Footer: secondary left, primary right
└──────────────────────────────────┘
```

Specs:
- Width: 480px (sm), 560px (default), 720px (lg)
- Radius: 12px
- Shadow: `--shadow-xl`
- Backdrop: `rgba(15, 23, 42, 0.40)` with `backdrop-filter: blur(2px)` (optional)
- Header padding: 20px 24px
- Body padding: 20px 24px (no top divider; spacing alone separates)
- Footer padding: 16px 24px, right-aligned button group, top border
- Close button: top-right `×` icon, 32px hit area
- ESC closes; focus trapped; `aria-modal="true"`; focus restored to trigger on close

### 16.8 Slide-Overs / Sheets

For larger inline forms ("New customer", "Edit project"). Slides in from the right.

Specs:
- Width: 480px (sm), 640px (default), 800px (lg)
- Full-height
- Same header/body/footer structure as modal
- Backdrop optional (Linear: yes; Stripe: no — sheet floats over content)
- Slide animation: 300ms ease-out
- ESC closes; click outside dismisses (unless dirty form — confirm first)

### 16.9 Toasts

Bottom-right corner (default) or top-right. Max 4 stacked; older ones fade.

Anatomy:
```
┌─────────────────────────────────────┐
│ [icon] Invoice INV-1024 sent. [Undo]│
└─────────────────────────────────────┘
```

Specs:
- Width: 320–400px
- Padding: 12px 16px
- Radius: 8px
- Background: `--bg-elevated` (or status-tinted for error)
- Shadow: `--shadow-lg`
- Border: 1px `--border-default`
- Leading icon: 16px status color
- Auto-dismiss: 5s (success) / 8s (error) / never (with action button)
- Hover pauses the dismiss timer
- Action button: link-style, brand color

Variants:
- `success` — green check icon, body text only
- `error` — red alert icon, expand-on-hover for full message
- `info` — blue info icon
- `loading` — spinner icon, persistent until completed (replace with success/error)

### 16.10 Command Palette (⌘K)

The defining "S-tier SaaS" feature. Linear, Vercel, Raycast, Stripe all have one.

Anatomy:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Type a command or search…                          esc   │
├─────────────────────────────────────────────────────────────┤
│ RECENTLY USED                                                │
│   [→]  Go to customers                          ⌘ G C       │
│   [+]  Create invoice                           ⌘ N I       │
│                                                              │
│ ACTIONS                                                      │
│   [+]  Create customer                          ⌘ N C       │
│   [+]  Create invoice                           ⌘ N I       │
│   [↗]  Export data                                          │
│                                                              │
│ NAVIGATION                                                   │
│   [→]  Dashboard                                ⌘ G D       │
│   [→]  Customers                                ⌘ G C       │
│   [→]  Invoices                                 ⌘ G I       │
│                                                              │
│ HELP                                                         │
│   [?]  Keyboard shortcuts                                   │
│   [↗]  Open documentation                                   │
└─────────────────────────────────────────────────────────────┘
   ↑↓ navigate    ↵ select    esc close
```

Specs:
- Width: 640px, max-height: 480px
- Position: vertically centered, slightly above center (top: 20vh)
- Backdrop: `rgba(15, 23, 42, 0.40)` blur 4px
- Input: 14px, no border, padding 16px, autofocus
- Result row: 36px tall, 13px text, hover bg + leading icon
- Selected (keyboard nav): `--brand-bg-subtle` + `--brand-fg` text
- Section headers: 11px uppercase, `--text-muted`, 12px y-padding
- Trailing shortcut hints: `<kbd>` chips, mono 11px
- Footer (sticky): keyboard legend in `--text-subtle`

Implementation libs to consider: `cmdk` (the canonical lib, what Vercel and Linear use).

### 16.11 Onboarding Checklist

Top of dashboard for first 7-14 days OR until all items complete:

```
┌──────────────────────────────────────────────────────────┐
│  Get started                                  [×] dismiss │
│  3 of 5 complete                                          │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░  60%                                 │
│                                                           │
│  ✓ Create your workspace                                  │
│  ✓ Invite a teammate                                      │
│  ✓ Connect your first source                              │
│  ○ Create your first chart    →  [Open guide]            │
│  ○ Set up alerts              →  [Open guide]            │
└──────────────────────────────────────────────────────────┘
```

Specs:
- Card with `--shadow-sm`, dismissable
- Progress bar 4px tall, brand color fill
- Completed items: subtle (60% opacity), strikethrough text optional
- Pending items: hover reveals primary action button
- Dismissable but persist completion state on backend

### 16.12 Billing / Usage Surfaces

```
Current plan                    [Manage]
─────
[ Pro plan                                ]
[ $99/mo · renews March 1                 ]
[ Includes: 10 seats, 100k events, 50GB   ]

Usage this period
─────
Events processed     ████████████░░░░  62,341 / 100,000
Storage used         ███░░░░░░░░░░░░░  12.4 GB / 50 GB
Active users         ██████░░░░░░░░░░  6 / 10

Recent invoices                 [Download all]
─────
Mar 1, 2025          $99.00          [Paid]      [PDF]
Feb 1, 2025          $99.00          [Paid]      [PDF]
Jan 1, 2025          $99.00          [Paid]      [PDF]
```

Specs:
- Plan card uses `--bg-elevated` background
- Usage bars: full-width, 8px tall, `--brand-bg-subtle` track + `--brand-fg` fill (or warning color when ≥80%)
- Invoice list: table with right-aligned amount, status badge, download link

---

## 17. Component Snippets

> Copy-paste-ready. React + Tailwind by default; vanilla HTML provided where the React version would obscure the structural CSS. All examples assume the `tokens.css` and tailwind config from Sections 14 / 15.6 are loaded.

### 17.1 Buttons

#### BTN-PRIMARY

```tsx
<button
  className="inline-flex items-center justify-center gap-1.5
             h-8 px-3 rounded-md text-sm font-medium
             bg-brand-600 text-white
             hover:bg-brand-700
             active:bg-brand-800
             focus-visible:outline-none focus-visible:shadow-focus
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors duration-150"
>
  Save changes
</button>
```

#### BTN-SECONDARY

```tsx
<button
  className="inline-flex items-center justify-center gap-1.5
             h-8 px-3 rounded-md text-sm font-medium
             bg-surface text-neutral-900 dark:text-neutral-50
             border border-neutral-200 dark:border-neutral-800
             hover:bg-neutral-50 dark:hover:bg-neutral-800/50
             hover:border-neutral-300 dark:hover:border-neutral-700
             active:bg-neutral-100 dark:active:bg-neutral-800
             focus-visible:outline-none focus-visible:shadow-focus
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors duration-150"
>
  Cancel
</button>
```

#### BTN-GHOST

```tsx
<button
  className="inline-flex items-center justify-center gap-1.5
             h-8 px-2.5 rounded-md text-sm font-medium
             bg-transparent text-neutral-700 dark:text-neutral-300
             hover:bg-neutral-100 dark:hover:bg-neutral-800/50
             hover:text-neutral-900 dark:hover:text-neutral-50
             focus-visible:outline-none focus-visible:shadow-focus
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors duration-150"
>
  Edit
</button>
```

#### BTN-DESTRUCTIVE

```tsx
<button
  className="inline-flex items-center justify-center gap-1.5
             h-8 px-3 rounded-md text-sm font-medium
             bg-red-600 text-white
             hover:bg-red-700
             active:bg-red-800
             focus-visible:outline-none focus-visible:shadow-focus-error
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors duration-150"
>
  Delete project
</button>
```

#### BTN-ICON (square)

```tsx
<button
  aria-label="Settings"
  className="inline-flex items-center justify-center
             w-8 h-8 rounded-md
             bg-transparent text-neutral-600 dark:text-neutral-400
             hover:bg-neutral-100 dark:hover:bg-neutral-800/50
             hover:text-neutral-900 dark:hover:text-neutral-50
             focus-visible:outline-none focus-visible:shadow-focus
             transition-colors duration-150"
>
  <SettingsIcon className="w-4 h-4" strokeWidth={1.75} />
</button>
```

#### BTN-LOADING

```tsx
<button
  disabled
  className="inline-flex items-center justify-center gap-2
             h-8 px-3 rounded-md text-sm font-medium
             bg-brand-600 text-white opacity-80 cursor-progress"
>
  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
  Saving…
</button>
```

#### BTN-LINK

```tsx
<a
  href="/docs"
  className="inline-flex items-center gap-1
             text-sm font-medium text-brand-600 dark:text-brand-fg
             hover:text-brand-700 hover:underline underline-offset-4
             focus-visible:outline-none focus-visible:shadow-focus
             rounded-sm transition-colors duration-150"
>
  Read the docs
  <ArrowRightIcon className="w-3.5 h-3.5" />
</a>
```

#### BTN-SEGMENTED (radio group)

```tsx
<div className="inline-flex p-0.5 bg-neutral-100 dark:bg-neutral-800/50 rounded-md gap-0.5">
  {options.map((opt) => (
    <button
      key={opt.value}
      onClick={() => setValue(opt.value)}
      className={cn(
        'px-2.5 h-7 rounded text-sm font-medium transition-colors duration-100',
        value === opt.value
          ? 'bg-surface text-neutral-900 dark:text-neutral-50 shadow-xs'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
      )}
    >
      {opt.label}
    </button>
  ))}
</div>
```

### 17.2 Inputs

#### INPUT-TEXT

```tsx
<input
  type="text"
  placeholder="customer@example.com"
  className="block w-full h-8 px-3 rounded-md text-sm
             bg-surface text-neutral-900 dark:text-neutral-50
             placeholder:text-neutral-400 dark:placeholder:text-neutral-500
             border border-neutral-200 dark:border-neutral-800
             hover:border-neutral-300 dark:hover:border-neutral-700
             focus:border-brand-600 focus:outline-none focus:shadow-focus
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-colors duration-150"
/>
```

#### INPUT-WITH-LABEL-HELP

```tsx
<div className="space-y-1.5">
  <label htmlFor="email" className="block text-sm font-medium">
    Work email
  </label>
  <input
    id="email"
    type="email"
    aria-describedby="email-help"
    className="block w-full h-8 px-3 rounded-md text-sm
               bg-surface border border-neutral-200 dark:border-neutral-800
               focus:border-brand-600 focus:outline-none focus:shadow-focus"
  />
  <p id="email-help" className="text-xs text-neutral-500">
    We'll use this for receipts and password resets.
  </p>
</div>
```

#### INPUT-ERROR-STATE

```tsx
<div className="space-y-1.5">
  <label htmlFor="email-err" className="block text-sm font-medium">
    Work email
  </label>
  <input
    id="email-err"
    aria-invalid="true"
    aria-describedby="email-err-msg"
    className="block w-full h-8 px-3 rounded-md text-sm
               bg-surface border border-red-500
               focus:outline-none focus:shadow-focus-error"
  />
  <p id="email-err-msg" role="alert" className="text-xs text-red-600 dark:text-red-400">
    Enter a valid email address.
  </p>
</div>
```

#### INPUT-WITH-LEADING-ICON

```tsx
<div className="relative">
  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
  <input
    type="search"
    placeholder="Search customers…"
    className="block w-full h-8 pl-8 pr-3 rounded-md text-sm
               bg-surface border border-neutral-200 dark:border-neutral-800
               focus:border-brand-600 focus:outline-none focus:shadow-focus"
  />
  <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex
                   items-center gap-0.5 px-1.5 h-5 rounded text-[11px] font-mono
                   text-neutral-500 bg-neutral-100 dark:bg-neutral-800
                   border border-neutral-200 dark:border-neutral-700">
    ⌘K
  </kbd>
</div>
```

#### TEXTAREA

```tsx
<textarea
  rows={4}
  placeholder="What's this for?"
  className="block w-full px-3 py-2 rounded-md text-sm
             bg-surface border border-neutral-200 dark:border-neutral-800
             focus:border-brand-600 focus:outline-none focus:shadow-focus
             resize-y min-h-[80px]
             transition-colors duration-150"
/>
```

#### SELECT (native)

```tsx
<div className="relative">
  <select
    className="appearance-none block w-full h-8 pl-3 pr-9 rounded-md text-sm
               bg-surface text-neutral-900 dark:text-neutral-50
               border border-neutral-200 dark:border-neutral-800
               focus:border-brand-600 focus:outline-none focus:shadow-focus
               transition-colors duration-150"
  >
    <option>USD</option>
    <option>EUR</option>
    <option>GBP</option>
  </select>
  <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
</div>
```

#### CHECKBOX

```tsx
<label className="inline-flex items-center gap-2 cursor-pointer select-none">
  <input
    type="checkbox"
    className="peer sr-only"
    checked={checked}
    onChange={(e) => setChecked(e.target.checked)}
  />
  <span
    className="grid place-items-center w-4 h-4 rounded-[4px]
               bg-surface border border-neutral-300 dark:border-neutral-700
               peer-checked:bg-brand-600 peer-checked:border-brand-600
               peer-focus-visible:shadow-focus
               transition-colors duration-100"
  >
    {checked && (
      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
  <span className="text-sm">Send email receipts</span>
</label>
```

#### SWITCH (toggle)

```tsx
<button
  role="switch"
  aria-checked={on}
  onClick={() => setOn(!on)}
  className={cn(
    'relative inline-flex items-center w-9 h-5 rounded-full',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:shadow-focus',
    on ? 'bg-brand-600' : 'bg-neutral-300 dark:bg-neutral-700'
  )}
>
  <span
    className={cn(
      'inline-block w-4 h-4 rounded-full bg-white shadow-sm',
      'transition-transform duration-150',
      on ? 'translate-x-[18px]' : 'translate-x-0.5'
    )}
  />
</button>
```

#### RADIO GROUP

```tsx
<div role="radiogroup" aria-label="Plan" className="space-y-2">
  {plans.map((plan) => (
    <label
      key={plan.id}
      className={cn(
        'flex items-start gap-3 p-3 rounded-md border cursor-pointer',
        'transition-colors duration-100',
        value === plan.id
          ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-fg/10'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
      )}
    >
      <input
        type="radio"
        name="plan"
        value={plan.id}
        checked={value === plan.id}
        onChange={() => setValue(plan.id)}
        className="peer sr-only"
      />
      <span className={cn(
        'mt-0.5 grid place-items-center w-4 h-4 rounded-full border-2',
        value === plan.id ? 'border-brand-600' : 'border-neutral-300 dark:border-neutral-600'
      )}>
        {value === plan.id && (
          <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
        )}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{plan.name}</span>
        <span className="block text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
          {plan.description}
        </span>
      </span>
      <span className="text-sm font-medium tabular-nums">{plan.price}</span>
    </label>
  ))}
</div>
```

### 17.3 Form Row (label-left, input-right)

```tsx
function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-2 md:gap-6 py-5
                    border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <div>
        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {label}
        </label>
        {hint && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Usage
<form>
  <FormRow label="Display name" hint="Shown to teammates in mentions.">
    <Input value={name} onChange={setName} maxLength={64} />
  </FormRow>
  <FormRow label="Time zone">
    <Select value={tz} onChange={setTz}>{tzOptions}</Select>
  </FormRow>
</form>
```

### 17.4 Cards

#### CARD-DEFAULT

```tsx
<div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
  <div className="flex items-start justify-between mb-3">
    <div>
      <h3 className="text-base font-semibold">API keys</h3>
      <p className="text-xs text-neutral-500 mt-0.5">
        Used to authenticate requests to your account.
      </p>
    </div>
    <Button variant="secondary" size="sm">Create key</Button>
  </div>
  <div className="text-sm">{/* card body */}</div>
</div>
```

#### CARD-KPI (stat tile)

```tsx
<div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
  <div className="flex items-center justify-between">
    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
      Active subscriptions
    </p>
    <UsersIcon className="w-4 h-4 text-neutral-400" />
  </div>
  <div className="mt-2 flex items-baseline gap-2">
    <span className="text-3xl font-semibold tabular-nums tracking-tight">
      1,247
    </span>
    <span className="text-xs font-medium text-green-600 dark:text-green-400">
      +12.4%
    </span>
  </div>
  <p className="mt-0.5 text-xs text-neutral-500">vs. previous 30 days</p>
</div>
```

#### CARD-INTERACTIVE (clickable list item)

```tsx
<button
  className="group w-full text-left
             bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg p-4
             hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm
             focus-visible:outline-none focus-visible:shadow-focus
             transition-all duration-150"
>
  <div className="flex items-center gap-3">
    <Avatar src={project.icon} size={32} />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate">{project.name}</div>
      <div className="text-xs text-neutral-500 truncate">{project.url}</div>
    </div>
    <ChevronRightIcon className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 group-hover:translate-x-0.5 transition-all" />
  </div>
</button>
```

### 17.5 Data Table

```tsx
function DataTable({ rows, columns }: Props) {
  return (
    <div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="relative flex-1 max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="search"
            placeholder="Search…"
            className="block w-full h-8 pl-8 pr-3 rounded-md text-sm
                       bg-surface border border-neutral-200 dark:border-neutral-800
                       focus:border-brand-600 focus:outline-none focus:shadow-focus"
          />
        </div>
        <Button variant="secondary" size="sm">
          <FilterIcon className="w-3.5 h-3.5" /> Filter
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm">Export</Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400',
                    col.numeric ? 'text-right' : 'text-left',
                    col.sortable && 'cursor-pointer hover:text-neutral-900'
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <ChevronDownIcon className={cn('w-3 h-3', sortDir === 'asc' && 'rotate-180')} />
                    )}
                  </span>
                </th>
              ))}
              <th className="w-8 px-4 py-2.5" /> {/* row action column */}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group border-t border-neutral-200 dark:border-neutral-800
                           hover:bg-neutral-50 dark:hover:bg-neutral-900/30
                           transition-colors duration-100"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5',
                      col.numeric && 'text-right tabular-nums font-mono text-xs',
                      col.muted && 'text-neutral-500'
                    )}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                <td className="px-2 py-2.5">
                  <button
                    aria-label="Row actions"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                               w-7 h-7 rounded grid place-items-center
                               hover:bg-neutral-200 dark:hover:bg-neutral-800
                               transition-opacity duration-100"
                  >
                    <MoreHorizontalIcon className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
        <span>Showing 1–25 of <span className="tabular-nums">1,247</span></span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled>Previous</Button>
          <Button variant="ghost" size="sm">Next</Button>
        </div>
      </div>
    </div>
  );
}
```

#### TABLE-SKELETON-ROW

```tsx
function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-neutral-200 dark:border-neutral-800">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 rounded skeleton"
                style={{ width: `${40 + Math.random() * 50}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
```

### 17.6 Navigation

#### SIDEBAR

```tsx
function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-canvas">
      {/* Workspace switcher */}
      <button className="flex items-center gap-2 m-2 p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors">
        <div className="w-6 h-6 rounded bg-brand-600 grid place-items-center text-white text-xs font-semibold">
          A
        </div>
        <span className="flex-1 text-left text-sm font-medium truncate">Acme Corp</span>
        <ChevronsUpDownIcon className="w-3.5 h-3.5 text-neutral-400" />
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <SidebarSection label="Workspace">
          <SidebarItem icon={<HomeIcon />} href="/" active>Dashboard</SidebarItem>
          <SidebarItem icon={<UsersIcon />} href="/customers" badge="247">Customers</SidebarItem>
          <SidebarItem icon={<FileTextIcon />} href="/invoices">Invoices</SidebarItem>
        </SidebarSection>

        <SidebarSection label="Settings">
          <SidebarItem icon={<SettingsIcon />} href="/settings">General</SidebarItem>
          <SidebarItem icon={<KeyIcon />} href="/settings/api-keys">API keys</SidebarItem>
        </SidebarSection>
      </nav>

      {/* User menu */}
      <button className="flex items-center gap-2 m-2 p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors">
        <Avatar size={24} src={user.avatar} />
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-xs text-neutral-500 truncate">{user.email}</div>
        </div>
      </button>
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-2">
      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({ icon, href, active, badge, children }: SidebarItemProps) {
  return (
    <a
      href={href}
      className={cn(
        'group flex items-center gap-2 px-2 h-8 rounded-md text-sm font-medium',
        'transition-colors duration-100',
        active
          ? 'bg-brand-50 dark:bg-brand-fg/10 text-brand-700 dark:text-brand-fg'
          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-50'
      )}
    >
      <span className={cn('shrink-0', active ? 'text-brand-600 dark:text-brand-fg' : 'text-neutral-500')}>
        {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4', strokeWidth: 1.75 })}
      </span>
      <span className="flex-1 truncate">{children}</span>
      {badge && (
        <span className="text-xs text-neutral-500 tabular-nums">{badge}</span>
      )}
    </a>
  );
}
```

#### TOPBAR

```tsx
function Topbar() {
  return (
    <header className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-surface">
      <button aria-label="Toggle sidebar" className="lg:hidden p-1.5 rounded hover:bg-neutral-100">
        <MenuIcon className="w-4 h-4" />
      </button>

      <button
        onClick={openCommand}
        className="hidden md:inline-flex items-center gap-2 flex-1 max-w-md
                   h-8 px-3 rounded-md text-sm
                   bg-neutral-50 dark:bg-neutral-900 text-neutral-500
                   border border-neutral-200 dark:border-neutral-800
                   hover:border-neutral-300 transition-colors"
      >
        <SearchIcon className="w-4 h-4" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto px-1.5 h-5 rounded text-[11px] font-mono
                        bg-surface border border-neutral-200 dark:border-neutral-700">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <IconButton aria-label="Notifications"><BellIcon /></IconButton>
        <IconButton aria-label="Help"><HelpCircleIcon /></IconButton>
        <Avatar size={28} src={user.avatar} />
      </div>
    </header>
  );
}
```

#### BREADCRUMB

```tsx
function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-xs text-neutral-500">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRightIcon className="w-3 h-3 mx-1 text-neutral-300" />}
          {item.href && i < items.length - 1 ? (
            <a href={item.href} className="hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors">
              {item.label}
            </a>
          ) : (
            <span className={i === items.length - 1 ? 'text-neutral-900 dark:text-neutral-50 font-medium' : ''}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
```

#### TABS

```tsx
<div role="tablist" className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      role="tab"
      aria-selected={active === tab.id}
      onClick={() => setActive(tab.id)}
      className={cn(
        'relative px-3 h-9 text-sm font-medium',
        'focus-visible:outline-none focus-visible:shadow-focus rounded-t-md',
        'transition-colors duration-150',
        active === tab.id
          ? 'text-neutral-900 dark:text-neutral-50'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
      )}
    >
      {tab.label}
      {tab.count !== undefined && (
        <span className="ml-1.5 text-xs text-neutral-400 tabular-nums">{tab.count}</span>
      )}
      {active === tab.id && (
        <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-brand-600 rounded-t" />
      )}
    </button>
  ))}
</div>
```

#### DROPDOWN MENU

```tsx
// Using Radix UI primitives (recommended) or headlessui
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <IconButton aria-label="More"><MoreHorizontalIcon /></IconButton>
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="end"
    className="min-w-[180px] bg-elevated rounded-lg shadow-md
               border border-neutral-200 dark:border-neutral-800 p-1
               animate-popover-enter"
  >
    <DropdownMenuItem className="flex items-center gap-2 px-2 h-8 rounded text-sm
                                  cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50
                                  focus:bg-neutral-100 focus:outline-none">
      <EditIcon className="w-3.5 h-3.5 text-neutral-500" />
      Edit
    </DropdownMenuItem>
    <DropdownMenuItem className="flex items-center gap-2 px-2 h-8 rounded text-sm
                                  cursor-pointer hover:bg-neutral-100">
      <CopyIcon className="w-3.5 h-3.5 text-neutral-500" />
      Duplicate
      <kbd className="ml-auto text-[10px] text-neutral-400 font-mono">⌘D</kbd>
    </DropdownMenuItem>
    <DropdownMenuSeparator className="h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
    <DropdownMenuItem className="flex items-center gap-2 px-2 h-8 rounded text-sm
                                  text-red-600 dark:text-red-400
                                  cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30">
      <Trash2Icon className="w-3.5 h-3.5" />
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### 17.7 Modal / Dialog

```tsx
// Using Radix Dialog or headlessui
<Dialog open={open} onOpenChange={setOpen}>
  <DialogOverlay
    className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px]
               data-[state=open]:animate-fade-in"
  />
  <DialogContent
    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
               w-full max-w-md bg-elevated rounded-xl shadow-xl
               border border-neutral-200 dark:border-neutral-800
               data-[state=open]:animate-dialog-enter"
  >
    <div className="flex items-start justify-between p-5 pb-3">
      <div>
        <DialogTitle className="text-base font-semibold">
          Delete invoice INV-1024?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          This action cannot be undone. The invoice and its payment history will be permanently removed.
        </DialogDescription>
      </div>
      <DialogClose className="-mr-1 -mt-1 p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
        <XIcon className="w-4 h-4" />
      </DialogClose>
    </div>

    <div className="px-5 pb-3">
      <label className="block text-sm font-medium mb-1.5">
        Type <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">INV-1024</code> to confirm
      </label>
      <Input value={confirm} onChange={setConfirm} autoFocus />
    </div>

    <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-200 dark:border-neutral-800">
      <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="destructive" size="sm" disabled={confirm !== 'INV-1024'}>Delete invoice</Button>
    </div>
  </DialogContent>
</Dialog>
```

#### SHEET (slide-over)

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetOverlay className="fixed inset-0 bg-neutral-900/30 backdrop-blur-[2px]" />
  <SheetContent
    side="right"
    className="fixed right-0 top-0 bottom-0 w-full max-w-xl
               bg-elevated border-l border-neutral-200 dark:border-neutral-800
               shadow-xl flex flex-col
               data-[state=open]:animate-slide-in-right"
  >
    <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800">
      <SheetTitle className="text-base font-semibold">New customer</SheetTitle>
      <SheetClose className="p-1.5 rounded hover:bg-neutral-100">
        <XIcon className="w-4 h-4" />
      </SheetClose>
    </div>

    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* form body */}
    </div>

    <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-200 dark:border-neutral-800">
      <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="primary" size="sm">Create customer</Button>
    </div>
  </SheetContent>
</Sheet>
```

### 17.8 Toast

```tsx
function Toast({ variant, title, description, action, onDismiss }: ToastProps) {
  const tone = {
    success: { icon: CheckCircleIcon, color: 'text-green-600 dark:text-green-400' },
    error:   { icon: AlertCircleIcon, color: 'text-red-600 dark:text-red-400' },
    info:    { icon: InfoIcon,        color: 'text-blue-600 dark:text-blue-400' },
    loading: { icon: LoaderIcon,      color: 'text-neutral-500 animate-spin' },
  }[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-3 w-[360px] p-3 pr-2
                 bg-elevated rounded-lg shadow-lg
                 border border-neutral-200 dark:border-neutral-800
                 animate-toast-enter"
    >
      <tone.icon className={cn('w-4 h-4 mt-0.5 shrink-0', tone.color)} strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            {description}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-1.5 text-xs font-medium text-brand-600 dark:text-brand-fg hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1 -m-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

Toaster container (fixed position):
```tsx
<div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
  {toasts.map((t) => (
    <div key={t.id} className="pointer-events-auto">
      <Toast {...t} />
    </div>
  ))}
</div>
```

### 17.9 Empty State

```tsx
function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 text-neutral-300 dark:text-neutral-600">
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex items-center gap-2">
          {primaryAction && (
            <Button variant="primary" size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

### 17.10 Loading States

#### SKELETON

```css
.skeleton {
  display: block;
  background: linear-gradient(
    90deg,
    var(--neutral-100) 25%,
    var(--neutral-200) 50%,
    var(--neutral-100) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}
.dark .skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 75%
  );
  background-size: 200% 100%;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
```

Skeleton card:
```tsx
<div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
  <div className="h-4 w-1/3 skeleton mb-3" />
  <div className="h-3 w-2/3 skeleton mb-1.5" />
  <div className="h-3 w-1/2 skeleton" />
</div>
```

#### SPINNER

```tsx
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin"
      style={{ animationDuration: '750ms' }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
```

#### PROGRESS BAR (determinate)

```tsx
function Progress({ value, max = 100, tone = 'brand' }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill =
    tone === 'warning' ? 'bg-yellow-500' :
    tone === 'error'   ? 'bg-red-500' :
    'bg-brand-600';
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden"
    >
      <div
        className={cn('h-full transition-[width] duration-500 ease-out', fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

### 17.11 Badges

```tsx
function Badge({ tone = 'neutral', dot, children }: BadgeProps) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    brand:   'bg-brand-50 text-brand-700 dark:bg-brand-fg/15 dark:text-brand-fg',
    success: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    warning: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
    error:   'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    info:    'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  };
  const dotTones = {
    neutral: 'bg-neutral-400',
    brand:   'bg-brand-600',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error:   'bg-red-500',
    info:    'bg-blue-500',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
      tones[tone]
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotTones[tone])} />}
      {children}
    </span>
  );
}

// Usage
<Badge tone="success" dot>Active</Badge>
<Badge tone="warning" dot>Trial ending</Badge>
<Badge tone="error" dot>Failed</Badge>
```

### 17.12 Tooltip

```tsx
// Using Radix Tooltip — apply these styles to the content
<TooltipContent
  side="top"
  sideOffset={4}
  className="z-50 px-2 py-1 rounded text-xs font-medium
             bg-neutral-900 text-neutral-50 dark:bg-neutral-50 dark:text-neutral-900
             shadow-md
             data-[state=delayed-open]:animate-popover-enter"
>
  {label}
  {shortcut && (
    <span className="ml-2 text-neutral-400 dark:text-neutral-500 font-mono">{shortcut}</span>
  )}
</TooltipContent>
```

Delay: 300ms hover before showing. Tooltips fire on focus too.

### 17.13 Avatar

```tsx
function Avatar({ src, name, size = 32 }: AvatarProps) {
  const initials = name?.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-full overflow-hidden
                 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300
                 font-medium shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{initials || '?'}</span>
      )}
    </span>
  );
}

// Avatar group with overlap
<div className="flex -space-x-1.5">
  {users.slice(0, 3).map((u) => (
    <Avatar key={u.id} {...u} size={24} className="ring-2 ring-surface" />
  ))}
  {users.length > 3 && (
    <span className="grid place-items-center w-6 h-6 rounded-full
                     bg-neutral-100 dark:bg-neutral-800 ring-2 ring-surface
                     text-[10px] font-medium text-neutral-600">
      +{users.length - 3}
    </span>
  )}
</div>
```

### 17.14 KPI Strip

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
  {kpis.map((kpi) => (
    <div
      key={kpi.label}
      className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-lg p-4"
    >
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
        {kpi.label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {kpi.value}
        </span>
        {kpi.delta && (
          <span className={cn(
            'text-xs font-medium',
            kpi.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
          </span>
        )}
      </div>
      {kpi.subtitle && (
        <p className="mt-0.5 text-xs text-neutral-500">{kpi.subtitle}</p>
      )}
    </div>
  ))}
</div>
```

### 17.15 Pagination

```tsx
function Pagination({ page, total, perPage, onChange }: PaginationProps) {
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const lastPage = Math.ceil(total / perPage);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-neutral-500">
      <span>
        Showing <span className="tabular-nums">{from}–{to}</span> of{' '}
        <span className="tabular-nums">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeftIcon className="w-3.5 h-3.5" /> Previous
        </Button>
        <Button variant="ghost" size="sm" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
          Next <ChevronRightIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

### 17.16 Command Palette (using `cmdk`)

```tsx
import { Command } from 'cmdk';

function CommandPalette({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[4px]" />
      <DialogContent
        className="fixed left-1/2 top-[20vh] -translate-x-1/2 w-full max-w-xl
                   bg-elevated rounded-xl shadow-xl
                   border border-neutral-200 dark:border-neutral-800
                   data-[state=open]:animate-dialog-enter overflow-hidden"
      >
        <Command className="flex flex-col">
          <div className="flex items-center gap-2 px-4 border-b border-neutral-200 dark:border-neutral-800">
            <SearchIcon className="w-4 h-4 text-neutral-400" />
            <Command.Input
              placeholder="Type a command or search…"
              className="flex-1 h-12 bg-transparent text-sm
                         placeholder:text-neutral-400 focus:outline-none"
            />
            <kbd className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded
                            bg-neutral-100 dark:bg-neutral-800 font-mono">esc</kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-neutral-500">
              No results.
            </Command.Empty>

            <Command.Group heading="Actions" className="cmdk-group">
              <Command.Item className="cmdk-item">
                <PlusIcon className="w-4 h-4 text-neutral-500" />
                <span>Create customer</span>
                <kbd className="ml-auto text-[10px] text-neutral-400 font-mono">⌘ N C</kbd>
              </Command.Item>
              {/* … */}
            </Command.Group>

            <Command.Group heading="Navigation" className="cmdk-group">
              <Command.Item className="cmdk-item">
                <HomeIcon className="w-4 h-4 text-neutral-500" />
                <span>Go to dashboard</span>
                <kbd className="ml-auto text-[10px] text-neutral-400 font-mono">⌘ G D</kbd>
              </Command.Item>
              {/* … */}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between gap-2 px-3 py-2
                          border-t border-neutral-200 dark:border-neutral-800
                          text-[11px] text-neutral-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono">↵</kbd> select
              </span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

Required CSS for `cmdk` items:
```css
.cmdk-group [cmdk-group-heading] {
  padding: 8px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
}
.cmdk-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
}
.cmdk-item[data-selected="true"] {
  background: var(--brand-bg-subtle);
  color: var(--brand-fg);
}
.cmdk-item[data-selected="true"] svg { color: currentColor; }
```

### 17.17 Sticky Save Bar (Vercel-style)

```tsx
{isDirty && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40
                  animate-popover-enter">
    <div className="flex items-center gap-3 pl-4 pr-2 py-2
                    bg-neutral-900 dark:bg-neutral-50 text-neutral-50 dark:text-neutral-900
                    rounded-full shadow-xl">
      <span className="text-sm">You have unsaved changes</span>
      <button
        onClick={onReset}
        className="text-sm text-neutral-400 hover:text-neutral-50 dark:hover:text-neutral-900 transition-colors"
      >
        Reset
      </button>
      <Button variant="primary" size="sm" onClick={onSave}>Save changes</Button>
    </div>
  </div>
)}
```

---

## 18. Pre-flight Checklist

Run through this before shipping any SaaS surface. Each "no" is a regression.

### Visual
- [ ] Background is `--bg-canvas` (not pure white).
- [ ] Text is `--text-primary` (not pure black).
- [ ] Brand color fills <10% of any viewport (squint test).
- [ ] No pill buttons (`border-radius: 9999px`) outside avatars and status dots.
- [ ] All borders 1px solid, color `--border-default`.
- [ ] All shadows are downward, low-spread, neutral (not colored, not glow).
- [ ] One font family for sans, one for mono. No display fonts mixed in.

### Density
- [ ] Default UI text is 13px or 14px (not 16px).
- [ ] Default button height is 32px.
- [ ] Default input height matches button height (32px).
- [ ] Table rows are 40px (default) or 32px (compact).
- [ ] Numeric columns use `font-variant-numeric: tabular-nums`.

### Interaction
- [ ] Every interactive element has hover + focus-visible + active states.
- [ ] Focus rings: `2px solid --brand-fg` outline OR `--ring-focus` box-shadow.
- [ ] Hover transitions ≤150ms.
- [ ] Modal/dialog enter ≤250ms.
- [ ] No animation on page mount (no entrance stagger).
- [ ] `prefers-reduced-motion` honored.

### Accessibility
- [ ] Body text contrast ≥4.5:1.
- [ ] UI element contrast (borders, focus rings) ≥3:1.
- [ ] Every form field has a `<label>` (or `aria-label`).
- [ ] Errors linked via `aria-describedby`, role `alert`.
- [ ] Modals trap focus, restore on close, `aria-modal="true"`.
- [ ] `⌘K`, `Esc`, `Tab`, `↑↓` work on every surface they apply to.
- [ ] Icon-only buttons have `aria-label`.

### Content
- [ ] One H1 per page.
- [ ] One primary button per surface (the rest are secondary/ghost).
- [ ] Button text is verb + object ("Save changes", not "Submit").
- [ ] Empty states have icon + declarative heading + 1-line description + primary action.
- [ ] Status badges use semantic color + dot, never solid backgrounds.

### Performance
- [ ] No CSS-in-JS in hot paths; tokens via CSS variables.
- [ ] Tables virtualize at >100 rows.
- [ ] Skeleton states for any data fetch taking >250ms.
- [ ] No layout shift on initial render (reserve space for async content).

### Dark Mode
- [ ] `.dark` class on `<html>`, set BEFORE first paint (no FOUC).
- [ ] Three-way theme toggle: system / light / dark.
- [ ] Borders are translucent or lighter in dark mode (not the same as light).
- [ ] Brand color shifts to lighter ramp step in dark mode (`--brand-600` → `--brand-fg: #A5B4FC`).
- [ ] Shadows nearly invisible in dark mode; elevation conveyed by lifted background.

---

*Last updated: synthesized from Stripe Dashboard, Linear, Vercel, Notion, Clerk, PlanetScale design patterns. Always pin to your product's brand color via the `--brand-*` scale; everything else stays intact.*
