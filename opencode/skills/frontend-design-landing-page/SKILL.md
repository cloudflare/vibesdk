---
name: frontend-design-landing-page
description: Marketing landing page and conversion-focused product page reference. Use this skill when building hero sections, feature grids, pricing pages, testimonials, CTAs, footers, navigation bars, or any public-facing marketing surface. Covers a warm, professional, developer-friendly design language (cream backgrounds, generous whitespace, pill CTAs, corner-bracket card decorations) and a complete token set, animation system, and copy-paste component snippets. NOT for product/dashboard UIs — use frontend-design-saas for those.
---

# Landing Page Design System

> **AI-Optimized Design Reference** for building warm, professional, conversion-focused marketing landing pages, product pages, feature pages, and pricing pages.

This skill captures a specific landing-page register: warm cream backgrounds (NOT pure white), brown text (NOT pure black), a single bold accent for CTAs, pill-rounded buttons, and signature corner-bracket card decorations. It's tuned for developer-adjacent / B2B products — the aesthetic feels human and crafted without being playful or consumer-y. Pin the accent color to your brand; the rest of the system is reusable as-is.

> **When to use this vs. `frontend-design-saas`:** Landing-page surfaces (homepage, /features, /pricing, /about, blog) → this skill. Product UI behind the login (dashboards, settings, tables) → `frontend-design-saas`.

---

## Quick Reference (TL;DR)

```
Brand Accent:    #FF4801 (replace with your brand) / #FF7038 (hover)
Background:      #FFFBF5 (warm cream) / #121212 (dark mode)
Text:            #521000 (warm brown) / #F0E3DE (dark mode)
Border:          #EBD5C1 (cream-tinted)
Font Sans:       "Inter" / "Geist" / "Manrope" / any modern grotesk
Font Mono:       "JetBrains Mono" / "IBM Plex Mono" / "Geist Mono"
Base Spacing:    4px (multiples: 8, 12, 16, 24, 32, 48, 64)
Border Radius:   Buttons = pill (9999px), Cards = 12-16px, Inputs = 8px, Hero = 16-20px
Signature:       Corner brackets on cards (8px decorative squares at corners)
```

This is a **landing-page** register, not a product-UI register. Buttons are pills (consumer/marketing read), backgrounds are warm cream (inviting, not sterile), and decorative idioms like corner brackets are welcome. For product surfaces behind auth, use the SaaS skill instead.

---

## 1. Brand Foundation

### Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Warm but Technical** | Cream tones soften technical content |
| **Professional yet Approachable** | Modern typography, generous whitespace |
| **Developer-Focused** | Monospace for code, terminal aesthetics |
| **Performance-Oriented** | Smooth animations convey speed |

### Visual Identity

- **Never use pure white** (`#FFFFFF`) for backgrounds — always warm cream (`#FFFBF5`)
- **Never use pure black** (`#000000`) for text — always warm brown (`#521000`)
- **Orange is the accent**, not the dominant color
- **Corner brackets** on cards are a signature decorative element
- **Dot patterns** and **dashed lines** add visual texture

---

## 2. Color System

### 2.1 Primary Palette (Light Mode)

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--lp-accent` | `#FF4801` | `rgb(255, 72, 1)` | Primary accent, CTAs, links |
| `--lp-accent-hover` | `#FF7038` | `rgb(255, 112, 56)` | Hover states |
| `--lp-accent-light` | `rgba(255, 72, 1, 0.1)` | — | Badges, light backgrounds |
| `--lp-text` | `#521000` | `rgb(82, 16, 0)` | Primary text |
| `--lp-text-muted` | `rgba(82, 16, 0, 0.6)` | — | Secondary text |
| `--lp-text-subtle` | `rgba(82, 16, 0, 0.38)` | — | Tertiary text, placeholders |
| `--lp-bg-page` | `#F5F1EB` | `rgb(245, 241, 235)` | Page background (outer) |
| `--lp-bg-100` | `#FFFBF5` | `rgb(255, 251, 245)` | Primary background |
| `--lp-bg-200` | `#FFFDFB` | `rgb(255, 253, 251)` | Card backgrounds |
| `--lp-bg-300` | `#FEF7ED` | `rgb(254, 247, 237)` | Hover backgrounds |
| `--lp-border` | `#EBD5C1` | `rgb(235, 213, 193)` | Borders, dividers |
| `--lp-border-light` | `rgba(235, 213, 193, 0.5)` | — | Subtle borders |

### 2.2 Primary Palette (Dark Mode)

| Token | Hex | Usage |
|-------|-----|-------|
| `--lp-accent` | `#F14602` | Primary accent |
| `--lp-accent-hover` | `#FF6D33` | Hover states |
| `--lp-text` | `#F0E3DE` | Primary text |
| `--lp-text-muted` | `rgba(255, 253, 251, 0.56)` | Secondary text |
| `--lp-bg-100` | `#121212` | Primary background |
| `--lp-bg-200` | `#191817` | Card backgrounds |
| `--lp-bg-300` | `#2A2927` | Hover backgrounds |
| `--lp-border` | `rgba(240, 227, 222, 0.13)` | Borders |

### 2.3 Category / Tag Colors (optional)

If your product has multiple feature categories that appear as tags or pills throughout the page (feature cards, navigation, etc.), define a small categorical palette. Keep luminance similar across the set so no single color overpowers the others.

| Slot | Primary | Background | Example use |
|----------|---------|------------|-------|
| Category A | `#0A95FF` | `rgba(10, 149, 255, 0.1)` | "Compute" / "Performance" |
| Category B | `#EE0DDB` | `rgba(238, 13, 219, 0.1)` | "Storage" / "Data" |
| Category C | `#19E306` | `#F2F5E1` | "AI" / "Intelligence" |
| Category D | `#9616FF` | `#F8EBEE` | "Media" / "Edge" |

These are placeholders — swap to your product's category palette. The goal is a small set of visually distinct accent colors used only on category labels, NEVER on primary CTAs (the brand accent owns that role).

### 2.4 Semantic Colors

| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Success | `#16A34A` | `#4ADE80` |
| Warning | `#EAB308` | `#FACC15` |
| Error | `#DC2626` | `#F87171` |
| Info | `#2563EB` | `#60A5FA` |

---

## 3. Typography

### 3.1 Font Families

```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", "Fira Code", "Consolas", monospace;
```

**Font Files:**
- `Kunst Grotesk Regular.woff2` (400)
- `Kunst Grotesk Medium.woff2` (500)
- `JetBrains Mono Regular.woff2` (400)

### 3.2 Type Scale

| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| `xs` | 12px (0.75rem) | 1.33 | 400 | Badges, captions, footnotes |
| `sm` | 14px (0.875rem) | 1.43 | 400 | Secondary text, labels |
| `base` | 16px (1rem) | 1.5 | 400 | Body text |
| `lg` | 18px (1.125rem) | 1.56 | 400/500 | Large body, subheadings |
| `xl` | 20px (1.25rem) | 1.4 | 500 | Section titles |
| `2xl` | 24px (1.5rem) | 1.33 | 500 | Card headings |
| `3xl` | 30px (1.875rem) | 1.2 | 500 | Section headings |
| `4xl` | 36px (2.25rem) | 1.11 | 500 | Page headings |
| `5xl` | 48px (3rem) | 1.0 | 500 | Hero headings |

### 3.3 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Normal | 400 | Body text, descriptions |
| Medium | 500 | Headings, buttons, emphasis |

### 3.4 Letter Spacing

| Context | Value | CSS |
|---------|-------|-----|
| Headings | -0.02em | `letter-spacing: -0.02em` |
| Body | Normal | `letter-spacing: normal` |
| Uppercase labels | 0.05em | `letter-spacing: 0.05em` |
| Logo text | -0.46px | `letter-spacing: -0.46px` |

### 3.5 Text Rendering

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1;
}
```

---

## 4. Spacing System

### 4.1 Base Unit

```css
--spacing-unit: 4px;
```

### 4.2 Spacing Scale

| Token | Value | Pixels | Common Usage |
|-------|-------|--------|--------------|
| `0` | 0 | 0px | Reset |
| `0.5` | 0.125rem | 2px | Tiny gaps |
| `1` | 0.25rem | 4px | Tight spacing |
| `1.5` | 0.375rem | 6px | Small gaps |
| `2` | 0.5rem | 8px | Default small padding |
| `3` | 0.75rem | 12px | Input padding, card gaps |
| `4` | 1rem | 16px | Standard padding |
| `5` | 1.25rem | 20px | Medium spacing |
| `6` | 1.5rem | 24px | Section padding (mobile) |
| `8` | 2rem | 32px | Large padding |
| `10` | 2.5rem | 40px | Section gaps |
| `12` | 3rem | 48px | Large section gaps |
| `16` | 4rem | 64px | Hero padding |
| `20` | 5rem | 80px | Major sections |
| `24` | 6rem | 96px | Max section spacing |

### 4.3 Common Spacing Patterns

```css
/* Card padding */
padding: 24px;  /* p-6 */

/* Input padding */
padding: 12px;  /* p-3 */

/* Button padding */
padding: 12px 24px;  /* py-3 px-6 */

/* Section padding (responsive) */
padding: 32px 16px;  /* Mobile */
padding: 48px 32px;  /* Tablet */
padding: 64px 48px;  /* Desktop */

/* Grid gaps */
gap: 16px;  /* Cards */
gap: 24px;  /* Sections */
```

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 4px | Small badges |
| `rounded` | 6px | Tags, small elements |
| `rounded-md` | 8px | Inputs |
| `rounded-lg` | 12px | Icon containers, panels |
| `rounded-xl` | 16px | Hero sections |
| `rounded-2xl` | 20px | Large hero sections |
| `rounded-full` | 9999px | Buttons, pills, avatars |
| `rounded-none` | 0 | Cards (sharp edges) |

### Common Patterns

```css
/* Buttons - always fully rounded */
border-radius: 9999px;

/* Cards - sharp edges */
border-radius: 0;

/* Inputs */
border-radius: 8px;

/* Hero sections (desktop) */
border-radius: 16px;

/* Progress bars */
border-radius: 9999px;

/* Icon containers */
border-radius: 8px;
```

---

## 6. Shadow System

### 6.1 Shadow Stack (Signature Effect)

Used on hero sections and elevated cards for depth with inner glow.

```css
/* Light Mode */
--shadow-stack: 
  1px 6px 6px 0 rgba(255, 255, 255, 0.2) inset,
  0 0 0px 0 rgba(255, 255, 255, 0.35) inset,
  0 4px 12px 0 rgba(0, 0, 0, 0.02),
  0 2px 12px 0 rgba(0, 0, 0, 0.03);

/* Dark Mode */
--shadow-stack-dark:
  1px 6px 16px 0 rgba(255, 255, 255, 0.05) inset,
  0 4px 12px 0 rgba(0, 0, 0, 0.02),
  0 2px 12px 0 rgba(0, 0, 0, 0.03);
```

### 6.2 Utility Shadows

```css
/* Subtle shadow for cards */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);

/* Standard card shadow */
--shadow-card: 
  0 1px 3px rgba(82, 16, 0, 0.04),
  0 4px 12px rgba(82, 16, 0, 0.02);

/* Elevated shadow */
--shadow-lg: 
  0 10px 15px -3px rgba(0, 0, 0, 0.1),
  0 4px 6px -4px rgba(0, 0, 0, 0.1);

/* Focus ring shadow */
--shadow-focus: 0 0 0 3px rgba(255, 72, 1, 0.2);
```

---

## 7. Animation System

### 7.1 Timing Functions

```css
/* Standard ease-out (default for most transitions) */
--ease-out: cubic-bezier(0, 0, 0.2, 1);

/* Button interactions */
--ease-button: cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Active/press states */
--ease-active: cubic-bezier(0.55, 0.085, 0.68, 0.53);

/* Smooth deceleration */
--ease-decel: cubic-bezier(0.4, 0, 0.2, 1);
```

### 7.2 Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-instant` | 100ms | Micro-interactions |
| `--duration-fast` | 150ms | Default transitions |
| `--duration-normal` | 200ms | Hover states |
| `--duration-medium` | 300ms | Theme transitions |
| `--duration-slow` | 500ms | Complex animations |
| `--duration-long` | 1000ms | Page transitions |

### 7.3 Standard Transitions

```css
/* Color transitions (default) */
transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;

/* Button transitions */
transition: all 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Card hover */
transition: box-shadow 0.2s ease, transform 0.2s ease;

/* Input focus */
transition: border-color 0.15s ease, box-shadow 0.15s ease;
```

### 7.4 Keyframe Animations

```css
/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide up */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Pulse (loading) */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Progress bar fill */
@keyframes progressFill {
  from { width: 0; }
  to { width: var(--progress-width); }
}

/* Infinite scroll (logos) */
@keyframes infiniteScroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

### 7.5 Framer Motion Presets (React)

```javascript
// Fade in
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 }
};

// Slide up
const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
};

// Stagger children
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } }
};

// Scale on hover
const scaleHover = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 }
};

// Button press
const buttonPress = {
  whileTap: { scale: 0.98, y: 1 }
};
```

---

## 8. Layout System

### 8.1 Container Widths

| Token | Value | Usage |
|-------|-------|-------|
| `--container-sm` | 640px | Narrow content |
| `--container-md` | 768px | Medium content |
| `--container-lg` | 1024px | Standard content |
| `--container-xl` | 1200px | Wide content |
| `--container-2xl` | 1480px | Full-width sections |

### 8.2 Breakpoints

| Name | Min Width | Usage |
|------|-----------|-------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### 8.3 Grid Patterns

```css
/* 2-column grid */
display: grid;
grid-template-columns: repeat(2, 1fr);
gap: 16px;

/* 3-column grid */
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 16px;

/* 4-column grid */
display: grid;
grid-template-columns: repeat(4, 1fr);
gap: 16px;

/* Calculator layout (2 columns, different widths) */
display: grid;
grid-template-columns: 1fr 1fr;
gap: 24px;

/* Responsive grid */
display: grid;
grid-template-columns: repeat(1, 1fr);  /* Mobile */
grid-template-columns: repeat(2, 1fr);  /* md: */
grid-template-columns: repeat(3, 1fr);  /* lg: */
```

### 8.4 Bento Grid

```css
/* Bento layout with varying sizes */
display: grid;
grid-template-columns: repeat(12, 1fr);
gap: 8px;

/* Bento cell sizes */
.bento-sm { grid-column: span 4; }    /* 1/3 width */
.bento-md { grid-column: span 6; }    /* 1/2 width */
.bento-lg { grid-column: span 8; }    /* 2/3 width */
.bento-full { grid-column: span 12; } /* Full width */
```

---

## 9. Dark Mode Implementation

### 9.1 Detection Script

Place in `<head>` before any styles load:

```html
<script>
(function() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
})();
</script>
```

### 9.2 CSS Token Mapping

```css
:root {
  --lp-accent: #FF4801;
  --lp-text: #521000;
  --lp-text-muted: rgba(82, 16, 0, 0.6);
  --lp-bg-100: #FFFBF5;
  --lp-bg-200: #FFFDFB;
  --lp-border: #EBD5C1;
}

:root.dark, html.dark {
  --lp-accent: #F14602;
  --lp-text: #F0E3DE;
  --lp-text-muted: rgba(255, 253, 251, 0.56);
  --lp-bg-100: #121212;
  --lp-bg-200: #191817;
  --lp-border: rgba(240, 227, 222, 0.13);
}
```

### 9.3 Theme Transition

```css
html.theme-transitioning,
html.theme-transitioning * {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease !important;
}
```

### 9.4 System Preference Listener

```javascript
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches);
});
```

---

## 10. Accessibility

### 10.1 Focus States

```css
/* Default focus ring */
:focus-visible {
  outline: 2px solid var(--lp-accent);
  outline-offset: 2px;
}

/* Button focus */
button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(255, 72, 1, 0.3);
}

/* Input focus */
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--lp-accent);
  box-shadow: 0 0 0 3px rgba(255, 72, 1, 0.1);
}
```

### 10.2 Disabled States

```css
:disabled,
[disabled],
.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### 10.3 Error States

```css
[aria-invalid="true"],
.input-error {
  border-color: #DC2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.error-message {
  color: #DC2626;
  font-size: 14px;
  margin-top: 4px;
}
```

### 10.4 Screen Reader Utilities

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
```

### 10.5 Selection Styling

```css
::selection {
  background-color: rgba(255, 72, 1, 0.2);
  color: var(--lp-text);
}
```

---

## 11. Decorative Elements

### 11.1 Corner Brackets

Signature decorative element for cards:

```css
/* Corner bracket container */
.corner-brackets {
  position: relative;
}

/* Individual bracket */
.corner-bracket {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid var(--lp-border);
  border-radius: 1.5px;
  background: var(--lp-bg-100);
}

/* Positions */
.corner-bracket.top-left { top: -4px; left: -4px; }
.corner-bracket.top-right { top: -4px; right: -4px; }
.corner-bracket.bottom-left { bottom: -4px; left: -4px; }
.corner-bracket.bottom-right { bottom: -4px; right: -4px; }
```

### 11.2 Dot Pattern Background

```css
.dot-pattern {
  background-image: radial-gradient(
    circle,
    var(--lp-border) 0.75px,
    transparent 0.75px
  );
  background-size: 12px 12px;
}
```

### 11.3 Dashed Line Borders

```css
/* Vertical dashed line */
.dashed-line-vertical {
  width: 1px;
  background-image: linear-gradient(
    to bottom,
    var(--lp-border) 50%,
    transparent 50%
  );
  background-size: 1px 16px;
  background-repeat: repeat-y;
}

/* Horizontal dashed line */
.dashed-line-horizontal {
  height: 1px;
  background-image: linear-gradient(
    to right,
    var(--lp-border) 50%,
    transparent 50%
  );
  background-size: 16px 1px;
  background-repeat: repeat-x;
}
```

### 11.4 Gradient Masks

```css
/* Fade edges */
.fade-left {
  mask-image: linear-gradient(to right, transparent, black 20%);
}

.fade-right {
  mask-image: linear-gradient(to left, transparent, black 20%);
}

.fade-both {
  mask-image: linear-gradient(
    to right,
    transparent,
    black 15%,
    black 85%,
    transparent
  );
}
```

---

## 12. Component Quick Reference

### Buttons

| Variant | Background | Text | Border |
|---------|------------|------|--------|
| Primary | `#FFFBF5` | `#FF4801` | `#FFFBF5` |
| Secondary | `#FF4801` | `#FFFBF5` | transparent |
| Ghost | transparent | `#FF4801` | `#EBD5C1` |
| Outline | transparent | `#521000` | `#EBD5C1` |

### Cards

| Variant | Background | Border | Shadow |
|---------|------------|--------|--------|
| Default | `#FFFDFB` | `#EBD5C1` | shadow-card |
| Elevated | `#FFFBF5` | `#EBD5C1` | shadow-lg |
| Interactive | `#FFFDFB` | `#EBD5C1` | hover: shadow-lg |

### Inputs

| State | Border | Shadow |
|-------|--------|--------|
| Default | `#EBD5C1` | none |
| Focus | `#FF4801` | `0 0 0 3px rgba(255,72,1,0.1)` |
| Error | `#DC2626` | `0 0 0 3px rgba(220,38,38,0.1)` |
| Disabled | `#EBD5C1` | none, opacity: 0.5 |

---

## 13. File Structure Recommendation

```
project/
├── styles/
│   ├── tokens.css          # CSS custom properties
│   ├── base.css            # Reset, typography, global styles
│   ├── components/
│   │   ├── buttons.css
│   │   ├── cards.css
│   │   ├── forms.css
│   │   ├── navigation.css
│   │   └── calculator.css
│   └── utilities.css       # Helper classes
├── fonts/
│   ├── Kunst Grotesk Regular.woff2
│   ├── Kunst Grotesk Medium.woff2
│   └── JetBrains Mono Regular.woff2
└── components/             # React/Vue components
    ├── Button.tsx
    ├── Card.tsx
    ├── Input.tsx
    └── Calculator/
        ├── InputPanel.tsx
        ├── OutputPanel.tsx
        └── ComparisonBar.tsx
```

---

## 14. CSS Custom Properties (Full Set)

Copy this into your project's CSS:

```css
:root {
  /* Colors - Primary */
  --lp-accent: #FF4801;
  --lp-accent-hover: #FF7038;
  --lp-accent-light: rgba(255, 72, 1, 0.1);
  
  /* Colors - Text */
  --lp-text: #521000;
  --lp-text-muted: rgba(82, 16, 0, 0.6);
  --lp-text-subtle: rgba(82, 16, 0, 0.38);
  
  /* Colors - Backgrounds */
  --lp-bg-page: #F5F1EB;
  --lp-bg-100: #FFFBF5;
  --lp-bg-200: #FFFDFB;
  --lp-bg-300: #FEF7ED;
  
  /* Colors - Borders */
  --lp-border: #EBD5C1;
  --lp-border-light: rgba(235, 213, 193, 0.5);
  
  /* Colors - Semantic */
  --lp-success: #16A34A;
  --lp-warning: #EAB308;
  --lp-error: #DC2626;
  --lp-info: #2563EB;
  
  /* Colors - Product Categories */
  --lp-compute: #0A95FF;
  --lp-storage: #EE0DDB;
  --lp-ai: #19E306;
  --lp-media: #9616FF;
  
  /* Colors - Provider Comparisons */
  --lp-aws: #FF9900;
  --lp-gcp: #4285F4;
  --lp-azure: #0078D4;
  
  /* Typography */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
  
  /* Spacing */
  --spacing-unit: 4px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-card: 0 1px 3px rgba(82, 16, 0, 0.04), 0 4px 12px rgba(82, 16, 0, 0.02);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-focus: 0 0 0 3px rgba(255, 72, 1, 0.2);
  
  /* Transitions */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-button: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  
  /* Containers */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1200px;
  --container-2xl: 1480px;
}
```

---

## 15. Forensic Visual Analysis

> **Design Language DNA & Animation Physics**
> A specification so precise that a developer could rebuild it without seeing the original.

### 15.1 Visual Hierarchy & Spatial Logic

#### Grid System

| Aspect | Value | Notes |
|--------|-------|-------|
| **Layout Type** | Asymmetrical fluid with max-width constraints | NOT a strict 12-column grid |
| **Max Container** | `1480px` (homepage / wide marketing) / `1024px` (focused content / docs) | Content centered with `mx-auto` |
| **Content Width** | `64rem` (1024px) for tools/calculators | Narrower for focused interfaces |
| **Grid Columns** | 1-col mobile → 2-col tablet → responsive desktop | Uses CSS Grid, not flexbox grids |

#### Spacing Constants (The "Airiness")

```
Section Padding (Y-axis):
├── Mobile:   32px (py-8)
├── Tablet:   48px (pt-12)
└── Desktop:  64px-80px (py-16 to py-20)

Grid Gaps (X-axis):
├── Card grids:     24px (gap-6)
├── Form elements:  24px (gap-6)
├── Tight grids:    12px (gap-3)
└── Use-case cards: 12px (gap-3)

Component Internal Padding:
├── Cards:          24px (p-6) to 32px (p-8)
├── Buttons:        12px 24px (py-3 px-6)
├── Inputs:         12px (p-3)
└── Hero sections:  48px-64px (p-12 to p-16)
```

#### Density Classification

| Context | Density | Characteristics |
|---------|---------|-----------------|
| **Landing pages** | Expressive (Marketing) | Generous whitespace, large text, breathing room |
| **Calculator tools** | Moderate | Balanced density, functional spacing |
| **Data tables** | Compact | Tighter padding (py-3 pr-4) |

### 15.2 Color Science & Elevation

#### Primary Palette (Extracted Exact Values)

```css
/* Core landing-page palette */
:root {
  --lp-accent: #ff4801;        /* Primary accent - EXACT */
  --lp-text: #521000;          /* Primary text - warm brown */
  --lp-bg-page: #fffbf5;       /* Page background - warm cream */
  --lp-border: #EBD5C1;        /* Border color */
}

/* Background Layers (Light Mode) */
--lp-bg-100: rgb(255, 251, 245);  /* #FFFBF5 - Primary */
--lp-bg-200: rgb(255, 253, 251);  /* #FFFDFB - Cards/elevated */
--lp-bg-300: rgb(254, 247, 237);  /* #FEF7ED - Hover states */

/* Text Opacity Variations */
--lp-text-muted: rgba(82, 16, 0, 0.7);   /* #521000b3 - Secondary */
--lp-text-subtle: rgba(82, 16, 0, 0.4);  /* #52100066 - Tertiary */
```

#### Semantic Colors (from components)

| Purpose | Color | Usage Example |
|---------|-------|---------------|
| Success | `#16A34A` (green-600) | Savings badges, positive indicators |
| Success Background | `#DCF7E3` (green-100) | Badge backgrounds |
| Warning | `#EAB308` | Caution states |
| Error | `#DC2626` | Error borders, messages |
| Info | `#2563EB` | Informational highlights |

#### Depth Strategy

**NO Glassmorphism** - The design uses:

1. **Solid backgrounds** with subtle layering (`bg-100` → `bg-200` → `bg-300`)
2. **Border lines** for separation (1px solid `#EBD5C1`)
3. **Minimal shadows** - shadows are subtle, not dramatic

```css
/* Card Shadow (Light/Subtle) */
--tw-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1);

/* Focus Shadow */
box-shadow: 0 0 0 3px rgba(255, 72, 1, 0.1);

/* NO backdrop-filter: blur() usage */
/* NO heavy drop shadows */
```

### 15.3 Typography & Micro-Copy Specs

#### Type Personality: **Grotesk Sans**

The typography uses **Inter** - a modern grotesk with humanist touches. Fallback chain:
```css
font-family: Inter, -apple-system, system-ui, BlinkMacSystemFont, 
             Segoe UI, sans-serif, ui-sans-serif, system-ui, sans-serif;
```

#### Monospace for Code
```css
font-family: JetBrains Mono, ui-monospace, SFMono-Regular, SF Mono, 
             Monaco, Consolas, monospace;
```

#### Hierarchy Definition

| Level | Size | Weight | Line Height | Letter Spacing | Example |
|-------|------|--------|-------------|----------------|---------|
| **h1** | 24px-30px (`text-2xl` to `text-3xl`) | 500 (medium) | 1.2-1.33 | `-0.035em` | "Pricing", "Build faster" |
| **h2** | 18px (`text-lg`) | 500 | 1.4 | normal | "Pricing Details" |
| **h3** | 16px (`text-base`) | 500 | 1.5 | normal | Form labels |
| **p** (body) | 14px-16px (`text-sm` to `text-base`) | 400 | 1.4-1.5 | normal | Descriptions |
| **p** (muted) | 14px (`text-sm`) | 400 | 1.4 | normal | Secondary info |
| **small** | 12px (`text-xs`) | 400 | 1.33 | normal | Footnotes, captions |

#### Typography Style: **Tight and Medium Weight**

- **Headings**: Tighter tracking (`letter-spacing: -0.035em`)
- **Body**: Normal tracking
- **Weight distribution**: Primarily 400 (regular) and 500 (medium)
- **NO bold (700)** used in the interfaces

### 15.4 Component Anatomy

#### The "Radius" Strategy

| Element | Radius | CSS |
|---------|--------|-----|
| **Buttons** | Hyper-rounded | `border-radius: 9999px` (rounded-full) |
| **Inputs** | Soft | `border-radius: 8px` (rounded-lg) |
| **Cards** | Sharp | `border-radius: 0` (no rounding) |
| **Progress bars** | Hyper-rounded | `border-radius: 9999px` |
| **Dropdowns** | Soft | `border-radius: 8px` |
| **Badges/Pills** | Hyper-rounded | `border-radius: 9999px` |
| **Hero sections** | Large soft | `border-radius: 16px` (md:rounded-2xl) |

#### Interactive States

**Hover Effects:**
```css
/* Buttons - Dashed border reveal */
.button:hover {
  border-style: dashed;
  opacity: 0.95;
}

/* Cards - Dashed border */
.card:hover {
  border-style: dashed;
}

/* Links - Underline */
.link:hover {
  text-decoration: underline;
}

/* Background shift */
.interactive:hover {
  background-color: var(--lp-bg-300);  /* Warmer cream */
}
```

**Active/Press States:**
```css
button:active {
  transform: translateY(1px);
  scale: 0.98;
}
```

**Focus States:**
```css
:focus-visible {
  outline: 2px solid var(--lp-accent);
  outline-offset: 2px;
}

input:focus {
  border-color: var(--lp-accent);
  box-shadow: 0 0 0 3px rgba(255, 72, 1, 0.1);
}
```

**NO "Grow" effects, "Glow" borders, or "Shimmer" overlays** - The design is subtle and professional.

#### Corner Brackets (Signature Element)

The 8px corner bracket decorations are the **signature decorative element** of this design language — they appear at the four outer corners of cards and feature blocks, suggesting precision and crafted technical detail without adding visual noise:

```html
<!-- Corner bracket structure -->
<div class="pointer-events-none absolute inset-0 z-10 select-none">
  <div class="absolute bg-cf-bg-100" 
       style="top:-4px;left:-4px;width:8px;height:8px;border:1px solid #EBD5C1;border-radius:1.5px"></div>
  <div class="absolute bg-cf-bg-100" 
       style="top:-4px;right:-4px;width:8px;height:8px;border:1px solid #EBD5C1;border-radius:1.5px"></div>
  <div class="absolute bg-cf-bg-100" 
       style="left:-4px;bottom:-4px;width:8px;height:8px;border:1px solid #EBD5C1;border-radius:1.5px"></div>
  <div class="absolute bg-cf-bg-100" 
       style="right:-4px;bottom:-4px;width:8px;height:8px;border:1px solid #EBD5C1;border-radius:1.5px"></div>
</div>
```

### 15.5 Animation Physics (The Motion Signature)

#### The Easing Curves

```css
/* Standard ease-out (most transitions) */
--ease-standard: cubic-bezier(0, 0, 0.2, 1);  /* Tailwind's ease-out */

/* Button interactions - High-end feel */
--ease-button: cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Active/press response */
--ease-active: cubic-bezier(0.55, 0.085, 0.68, 0.53);

/* Page entrance - Apple-style smooth deceleration */
--ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);
```

#### Duration Scale

| Context | Duration | Usage |
|---------|----------|-------|
| Instant feedback | `0.15s` (150ms) | Color changes, opacity |
| Standard transitions | `0.16s` (160ms) | Button presses |
| Hover effects | `0.2s` (200ms) | Background color shifts |
| Complex animations | `0.5s` (500ms) | Progress bars, entrance |
| Page transitions | `2s` (2000ms) | Background fade-in |

#### Orchestration: **Fade-Slide as Single Block**

The content does NOT stagger in one-by-one. Instead, entire sections fade and slide together:

```css
/* Page entrance animation */
.animate-in {
  animation: fadeSlideUp 0.5s ease-out forwards;
}

@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Background lines fade in slowly */
.fade-in {
  transition: opacity 2000ms ease-out;
  transition-delay: 100ms;
}
```

#### Micro-interactions

**Button Press Physics:**
```css
button {
  transition: scale 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              translate 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

button:active {
  scale: 0.98;
  transform: translateY(1px);
}
```

**Progress Bar Animation:**
```css
.progress-bar {
  transition: width 0.5s ease-out;
}
```

**Slider Thumb:**
```css
.slider-thumb {
  cursor: grab;
  transition: box-shadow 0.15s ease;
}

.slider-thumb:active {
  cursor: grabbing;
}

.slider-thumb:hover {
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
}
```

**NO "Magnetic" follow effects or "Tilt" effects** - Interactions are clean and direct.

### 15.6 Technical Deliverables

#### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'cf': {
          'orange': '#FF4801',
          'orange-hover': '#FF7038',
          'orange-light': 'rgba(255, 72, 1, 0.06)',
          'text': '#521000',
          'text-muted': 'rgba(82, 16, 0, 0.7)',
          'text-subtle': 'rgba(82, 16, 0, 0.4)',
          'bg-page': '#FFFBF5',
          'bg-100': '#FFFBF5',
          'bg-200': '#FFFDFB',
          'bg-300': '#FEF7ED',
          'border': '#EBD5C1',
          'border-light': 'rgba(235, 213, 193, 0.5)',
        },
        'aws-orange': '#FF9900',
        'gcp-blue': '#4285F4',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'sm': ['0.9rem', { lineHeight: '1.4' }],
        'base': ['1rem', { lineHeight: '1.5' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      letterSpacing: {
        'tight-heading': '-0.035em',
        'logo': '-0.46px',
      },
      borderRadius: {
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      transitionTimingFunction: {
        'button': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'active': 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
        'entrance': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '160': '160ms',
        '2000': '2000ms',
      },
      animation: {
        'float-subtle': 'float-subtle 3s ease-in-out infinite',
        'dash-draw': 'dashdraw 0.5s linear infinite',
      },
      keyframes: {
        'float-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        'dashdraw': {
          '0%': { strokeDashoffset: '10' },
        },
      },
      boxShadow: {
        'focus': '0 0 0 3px rgba(255, 72, 1, 0.1)',
        'card': '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
      },
      maxWidth: {
        '5xl': '64rem',
        '8xl': '1480px',
      },
    },
  },
  plugins: [],
}
```

#### CSS Variables Block

```css
:root {
  /* === COLORS === */
  /* Primary */
  --lp-accent: #FF4801;
  --lp-accent-hover: #FF7038;
  --lp-accent-light: rgba(255, 72, 1, 0.06);
  
  /* Text */
  --lp-text: #521000;
  --lp-text-muted: rgba(82, 16, 0, 0.7);
  --lp-text-subtle: rgba(82, 16, 0, 0.4);
  
  /* Backgrounds */
  --lp-bg-page: #FFFBF5;
  --lp-bg-100: #FFFBF5;
  --lp-bg-200: #FFFDFB;
  --lp-bg-300: #FEF7ED;
  
  /* Borders */
  --lp-border: #EBD5C1;
  --lp-border-light: rgba(235, 213, 193, 0.5);
  
  /* Semantic */
  --lp-success: #16A34A;
  --lp-success-bg: #DCF7E3;
  --lp-warning: #EAB308;
  --lp-error: #DC2626;
  
  /* Provider Colors */
  --aws-orange: #FF9900;
  --gcp-blue: #4285F4;
  
  /* === TYPOGRAPHY === */
  --font-sans: "Inter", -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace;
  
  /* === SPACING === */
  --spacing-unit: 4px;
  
  /* === BORDER RADIUS === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* === SHADOWS === */
  --shadow-focus: 0 0 0 3px rgba(255, 72, 1, 0.1);
  --shadow-card: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
  
  /* === TRANSITIONS === */
  --ease-standard: cubic-bezier(0, 0, 0.2, 1);
  --ease-button: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-active: cubic-bezier(0.55, 0.085, 0.68, 0.53);
  --ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);
  
  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 500ms;
  
  /* === CONTAINERS === */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1480px;
}

/* Dark Mode */
:root.dark {
  --lp-accent: #F14602;
  --lp-text: #F0E3DE;
  --lp-text-muted: rgba(255, 253, 251, 0.56);
  --lp-bg-page: #0D0D0D;
  --lp-bg-100: #121212;
  --lp-bg-200: #191817;
  --lp-bg-300: #2A2927;
  --lp-border: rgba(240, 227, 222, 0.13);
}

/* Base Styles */
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  background-color: var(--lp-bg-page);
  color: var(--lp-text);
  font-family: var(--font-sans);
  overflow-x: hidden;
}

/* Focus States */
:focus-visible {
  outline: 2px solid var(--lp-accent);
  outline-offset: 2px;
}

input:focus,
select:focus {
  border-color: var(--lp-accent);
  box-shadow: var(--shadow-focus);
}

/* Transitions */
button,
a,
input,
select {
  transition: all 0.2s ease-in-out;
}
```

#### Framer Motion Variants

```javascript
// framer-motion-variants.js

// Page entrance animation
export const pageEntrance = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { 
      duration: 0.5, 
      ease: [0.16, 1, 0.3, 1] 
    }
  }
};

// Section slide-up
export const sectionSlideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.4, 
      ease: [0.25, 0.46, 0.45, 0.94] 
    }
  }
};

// Stagger container (for card grids)
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
};

// Stagger child item
export const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.35, 
      ease: [0.25, 0.46, 0.45, 0.94] 
    }
  }
};

// Button hover and tap
export const buttonInteraction = {
  whileHover: { scale: 1.01 },
  whileTap: { 
    scale: 0.98, 
    y: 1,
    transition: { 
      duration: 0.16, 
      ease: [0.55, 0.085, 0.68, 0.53] 
    }
  }
};

// Card hover
export const cardHover = {
  initial: { scale: 1 },
  whileHover: { 
    scale: 1.01,
    transition: { 
      duration: 0.2, 
      ease: [0.25, 0.46, 0.45, 0.94] 
    }
  }
};

// Progress bar fill
export const progressFill = {
  initial: { width: 0 },
  animate: (width) => ({
    width: `${width}%`,
    transition: { 
      duration: 0.5, 
      ease: "easeOut" 
    }
  })
};

// Floating animation (for icons/decorations)
export const floatSubtle = {
  animate: {
    y: [0, -3, 0],
    transition: {
      duration: 3,
      ease: "easeInOut",
      repeat: Infinity
    }
  }
};

// Background fade-in (slow entrance)
export const backgroundFadeIn = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { 
      duration: 2, 
      delay: 0.1,
      ease: "easeOut" 
    }
  }
};

// Usage example with React
/*
import { motion } from 'framer-motion';
import { pageEntrance, staggerContainer, staggerItem } from './framer-motion-variants';

function Page() {
  return (
    <motion.main {...pageEntrance}>
      <motion.div 
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-3 gap-6"
      >
        {items.map((item) => (
          <motion.div key={item.id} variants={staggerItem}>
            {item.content}
          </motion.div>
        ))}
      </motion.div>
    </motion.main>
  );
}
*/
```

---

*Synthesized from analysis of warm-cream developer-marketing landing pages. The aesthetic — warm cream backgrounds, brown text, single bold accent for CTAs, corner-bracket decorations — is portable to any B2B / developer-tools / dev-adjacent product brand.*



# ===== SNIPPETS.md =====

# Landing Page Design - Component Snippets

> **Copy-paste ready components** for building warm-cream landing-page interfaces.
> Each snippet includes React + Tailwind AND Vanilla HTML versions.

---

## Table of Contents

1. [Buttons](#buttons)
2. [Cards](#cards)
3. [Forms](#forms)
4. [Calculator Tools](#calculator-tools)
5. [Navigation](#navigation)
6. [Hero Sections](#hero-sections)
7. [Data Display](#data-display)
8. [Layout](#layout)
9. [Decorative](#decorative)

---

# Buttons

## BTN-PRIMARY

Primary CTA button - cream background, orange text, fully rounded.

### React + Tailwind

```jsx
<button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium bg-[#FFFBF5] text-[#FF4801] border border-[#FFFBF5] transition-all duration-150 ease-out hover:bg-transparent hover:border-[#FF4801] active:scale-[0.98] active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-[#FF4801]/30 disabled:opacity-50 disabled:cursor-not-allowed">
  Get started
</button>
```

### Vanilla HTML

```html
<button style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  background: #FFFBF5;
  color: #FF4801;
  border: 1px solid #FFFBF5;
  cursor: pointer;
  transition: all 0.15s ease;
" onmouseover="this.style.background='transparent'; this.style.borderColor='#FF4801';" onmouseout="this.style.background='#FFFBF5'; this.style.borderColor='#FFFBF5';">
  Get started
</button>
```

---

## BTN-SECONDARY

Secondary button - orange background, white text.

### React + Tailwind

```jsx
<button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium bg-[#FF4801] text-white border border-transparent transition-all duration-150 ease-out hover:opacity-95 hover:border-dashed hover:border-white/50 active:scale-[0.98] active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-[#FF4801]/30 disabled:opacity-50 disabled:cursor-not-allowed">
  Learn more
</button>
```

### Vanilla HTML

```html
<button style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  background: #FF4801;
  color: white;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
" onmouseover="this.style.opacity='0.95';" onmouseout="this.style.opacity='1';">
  Learn more
</button>
```

---

## BTN-GHOST

Ghost button - transparent with border, for secondary actions.

### React + Tailwind

```jsx
<button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium bg-transparent text-[#FF4801] border border-[#EBD5C1] transition-all duration-150 ease-out hover:border-dashed hover:border-[#FF4801] hover:text-[#521000] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#FF4801]/20 disabled:opacity-50 disabled:cursor-not-allowed">
  View docs
</button>
```

### Vanilla HTML

```html
<button style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  background: transparent;
  color: #FF4801;
  border: 1px solid #EBD5C1;
  cursor: pointer;
  transition: all 0.15s ease;
" onmouseover="this.style.borderStyle='dashed'; this.style.borderColor='#FF4801';" onmouseout="this.style.borderStyle='solid'; this.style.borderColor='#EBD5C1';">
  View docs
</button>
```

---

## BTN-OUTLINE

Outline button - for less prominent actions.

### React + Tailwind

```jsx
<button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium bg-[#FFFDFB] text-[#521000] border border-[#EBD5C1] transition-all duration-150 ease-out hover:bg-[#FEF7ED] hover:border-dashed active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#EBD5C1]/50 disabled:opacity-50 disabled:cursor-not-allowed">
  Cancel
</button>
```

### Vanilla HTML

```html
<button style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  background: #FFFDFB;
  color: #521000;
  border: 1px solid #EBD5C1;
  cursor: pointer;
  transition: all 0.15s ease;
">
  Cancel
</button>
```

---

## BTN-ICON

Icon-only button with tooltip.

### React + Tailwind

```jsx
<button 
  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFFDFB] text-[#521000] border border-[#EBD5C1] transition-all duration-150 ease-out hover:bg-[#FEF7ED] hover:text-[#FF4801] hover:border-[#FF4801] active:scale-[0.95] focus:outline-none focus:ring-2 focus:ring-[#FF4801]/20"
  aria-label="Settings"
  title="Settings"
>
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
</button>
```

### Vanilla HTML

```html
<button style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  background: #FFFDFB;
  color: #521000;
  border: 1px solid #EBD5C1;
  cursor: pointer;
  transition: all 0.15s ease;
" aria-label="Settings" title="Settings">
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
</button>
```

---

## BTN-LINK

Link styled as text with arrow.

### React + Tailwind

```jsx
<a href="#" className="inline-flex items-center gap-1 font-medium text-[#FF4801] hover:underline hover:underline-offset-4 transition-all duration-150">
  View documentation
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
</a>
```

### Vanilla HTML

```html
<a href="#" style="
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  color: #FF4801;
  text-decoration: none;
  transition: all 0.15s ease;
">
  View documentation
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
</a>
```

---

## BTN-LOADING

Button with loading spinner state.

### React + Tailwind

```jsx
<button 
  disabled
  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium bg-[#FF4801] text-white border border-transparent transition-all duration-150 disabled:opacity-70 disabled:cursor-not-allowed"
>
  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
  Processing...
</button>
```

### Vanilla HTML

```html
<button disabled style="
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 16px;
  background: #FF4801;
  color: white;
  border: none;
  opacity: 0.7;
  cursor: not-allowed;
">
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
  Processing...
</button>
<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

---

# Cards

## CARD-DEFAULT

Standard card with corner bracket decorations.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 shadow-[0_1px_3px_rgba(82,16,0,0.04),0_4px_12px_rgba(82,16,0,0.02)]">
  {/* Corner brackets */}
  <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  
  <h3 className="text-lg font-medium text-[#521000] mb-2">Card Title</h3>
  <p className="text-sm text-[#521000]/60 leading-relaxed">
    Card description goes here. This is a standard card with the signature corner bracket decorations.
  </p>
</div>
```

### Vanilla HTML

```html
<div style="
  position: relative;
  background: #FFFDFB;
  border: 1px solid #EBD5C1;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(82,16,0,0.04), 0 4px 12px rgba(82,16,0,0.02);
">
  <!-- Corner brackets -->
  <div style="position: absolute; top: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  
  <h3 style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 500; color: #521000; margin: 0 0 8px 0;">Card Title</h3>
  <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); line-height: 1.6; margin: 0;">
    Card description goes here. This is a standard card with the signature corner bracket decorations.
  </p>
</div>
```

---

## CARD-FEATURE

Feature card with icon, title, and description.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 transition-all duration-200 hover:bg-[#FEF7ED] hover:shadow-lg">
  {/* Corner brackets */}
  <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  
  {/* Icon */}
  <div className="w-10 h-10 rounded-lg bg-[#FF4801]/10 flex items-center justify-center mb-4">
    <svg className="w-5 h-5 text-[#FF4801]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  </div>
  
  <h3 className="text-base font-medium text-[#521000] mb-2">Lightning Fast</h3>
  <p className="text-sm text-[#521000]/60 leading-relaxed">
    Deploy to 300+ locations worldwide. Your code runs milliseconds from your users.
  </p>
</div>
```

### Vanilla HTML

```html
<div style="
  position: relative;
  background: #FFFDFB;
  border: 1px solid #EBD5C1;
  padding: 24px;
  transition: all 0.2s ease;
">
  <!-- Corner brackets -->
  <div style="position: absolute; top: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  
  <!-- Icon -->
  <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(255,72,1,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  </div>
  
  <h3 style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 500; color: #521000; margin: 0 0 8px 0;">Lightning Fast</h3>
  <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); line-height: 1.6; margin: 0;">
    Deploy to 300+ locations worldwide. Your code runs milliseconds from your users.
  </p>
</div>
```

---

## CARD-STAT

Statistics card with large number and label.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 text-center">
  {/* Corner brackets */}
  <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  
  <div className="text-3xl font-medium text-[#FF4801] tracking-tight">$0.015</div>
  <div className="text-xs font-mono text-[#521000]/60 uppercase tracking-wider mt-2">per GB / month</div>
</div>
```

### Vanilla HTML

```html
<div style="
  position: relative;
  background: #FFFDFB;
  border: 1px solid #EBD5C1;
  padding: 24px;
  text-align: center;
">
  <!-- Corner brackets -->
  <div style="position: absolute; top: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  <div style="position: absolute; bottom: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5;"></div>
  
  <div style="font-family: 'Inter', sans-serif; font-size: 30px; font-weight: 500; color: #FF4801; letter-spacing: -0.02em;">$0.015</div>
  <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: rgba(82,16,0,0.6); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">per GB / month</div>
</div>
```

---

## CARD-PRICING

Pricing tier card with features list.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] overflow-hidden">
  {/* Corner brackets */}
  <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5] z-10" />
  <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5] z-10" />
  <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5] z-10" />
  <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5] z-10" />
  
  {/* Header */}
  <div className="p-6 border-b border-[#EBD5C1]/50">
    <h3 className="text-lg font-medium text-[#521000]">Pro</h3>
    <div className="mt-2">
      <span className="text-3xl font-medium text-[#521000]">$20</span>
      <span className="text-sm text-[#521000]/60">/month</span>
    </div>
    <p className="text-sm text-[#521000]/60 mt-2">For growing teams and projects</p>
  </div>
  
  {/* Features */}
  <div className="p-6">
    <ul className="space-y-3">
      <li className="flex items-start gap-3 text-sm text-[#521000]">
        <svg className="w-5 h-5 text-[#FF4801] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        100 GB storage included
      </li>
      <li className="flex items-start gap-3 text-sm text-[#521000]">
        <svg className="w-5 h-5 text-[#FF4801] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        10 million requests/month
      </li>
      <li className="flex items-start gap-3 text-sm text-[#521000]">
        <svg className="w-5 h-5 text-[#FF4801] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Zero egress fees
      </li>
    </ul>
    
    <button className="w-full mt-6 px-4 py-3 rounded-full font-medium bg-[#FF4801] text-white transition-all duration-150 hover:opacity-95">
      Get started
    </button>
  </div>
</div>
```

### Vanilla HTML

```html
<div style="
  position: relative;
  background: #FFFDFB;
  border: 1px solid #EBD5C1;
  overflow: hidden;
">
  <!-- Corner brackets -->
  <div style="position: absolute; top: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5; z-index: 10;"></div>
  <div style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5; z-index: 10;"></div>
  <div style="position: absolute; bottom: -4px; left: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5; z-index: 10;"></div>
  <div style="position: absolute; bottom: -4px; right: -4px; width: 8px; height: 8px; border: 1px solid #EBD5C1; border-radius: 1.5px; background: #FFFBF5; z-index: 10;"></div>
  
  <!-- Header -->
  <div style="padding: 24px; border-bottom: 1px solid rgba(235,213,193,0.5);">
    <h3 style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 500; color: #521000; margin: 0;">Pro</h3>
    <div style="margin-top: 8px;">
      <span style="font-family: 'Inter', sans-serif; font-size: 30px; font-weight: 500; color: #521000;">$20</span>
      <span style="font-family: 'Inter', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6);">/month</span>
    </div>
    <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); margin: 8px 0 0 0;">For growing teams and projects</p>
  </div>
  
  <!-- Features -->
  <div style="padding: 24px;">
    <ul style="list-style: none; margin: 0; padding: 0;">
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'Inter', sans-serif; font-size: 14px; color: #521000; margin-bottom: 12px;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        100 GB storage included
      </li>
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'Inter', sans-serif; font-size: 14px; color: #521000; margin-bottom: 12px;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        10 million requests/month
      </li>
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'Inter', sans-serif; font-size: 14px; color: #521000;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Zero egress fees
      </li>
    </ul>
    
    <button style="
      width: 100%;
      margin-top: 24px;
      padding: 12px 16px;
      border-radius: 9999px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 16px;
      background: #FF4801;
      color: white;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s ease;
    ">Get started</button>
  </div>
</div>
```

---

## CARD-COMPARISON-ROW

Side-by-side comparison row with progress bar — useful for "us vs. them" feature/pricing comparisons.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-4">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 rounded bg-[#FF4801]/10 grid place-items-center text-[#FF4801] text-xs font-semibold">
        Y
      </div>
      <span className="font-medium text-[#521000]">Your product</span>
    </div>
    <div className="text-right">
      <span className="text-lg font-medium text-[#521000]">$150.00</span>
      <span className="text-sm text-[#521000]/60">/mo</span>
    </div>
  </div>

  {/* Progress bar — proportional value shown */}
  <div className="h-3 bg-[#EBD5C1]/30 rounded-full overflow-hidden">
    <div
      className="h-full bg-[#FF4801] rounded-full transition-all duration-500 ease-out"
      style={{ width: '15%' }}
    />
  </div>
</div>
```

### Vanilla HTML

```html
<div style="
  position: relative;
  background: #FFFDFB;
  border: 1px solid #EBD5C1;
  padding: 16px;
">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="height: 24px; width: 24px; border-radius: 4px; background: rgba(255,72,1,0.1); display: grid; place-items: center; color: #FF4801; font-size: 12px; font-weight: 600;">Y</div>
      <span style="font-family: 'Inter', sans-serif; font-weight: 500; color: #521000;">Your product</span>
    </div>
    <div style="text-align: right;">
      <span style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 500; color: #521000;">$150.00</span>
      <span style="font-family: 'Inter', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6);">/mo</span>
    </div>
  </div>

  <!-- Progress bar -->
  <div style="height: 12px; background: rgba(235,213,193,0.3); border-radius: 9999px; overflow: hidden;">
    <div style="height: 100%; width: 15%; background: #FF4801; border-radius: 9999px; transition: width 0.5s ease-out;"></div>
  </div>
</div>
```

---

## CARD-USE-CASE

Use case preset card for calculators.

### React + Tailwind

```jsx
<button 
  type="button"
  className="flex flex-col items-center p-4 border border-[#EBD5C1] bg-[#FFFDFB] transition-all text-center hover:border-dashed hover:border-[#FF4801] focus:outline-none focus:ring-2 focus:ring-[#FF4801]/20"
>
  <div className="mb-2 text-[#521000]/60">
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  </div>
  <span className="text-sm font-medium text-[#521000]">AI/ML Training</span>
  <span className="text-xs text-[#521000]/60 mt-0.5">100TB</span>
</button>
```

### Vanilla HTML

```html
<button type="button" style="
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border: 1px solid #EBD5C1;
  background: #FFFDFB;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
" onmouseover="this.style.borderStyle='dashed'; this.style.borderColor='#FF4801';" onmouseout="this.style.borderStyle='solid'; this.style.borderColor='#EBD5C1';">
  <div style="margin-bottom: 8px; color: rgba(82,16,0,0.6);">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  </div>
  <span style="font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; color: #521000;">AI/ML Training</span>
  <span style="font-family: 'Inter', sans-serif; font-size: 12px; color: rgba(82,16,0,0.6); margin-top: 2px;">100TB</span>
</button>
```

---

## CARD-TESTIMONIAL

Testimonial card with quote, avatar, and attribution.

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6">
  {/* Corner brackets */}
  <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
  
  {/* Quote icon */}
  <svg className="w-8 h-8 text-[#FF4801]/20 mb-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
  </svg>
  
  <blockquote className="text-base text-[#521000] leading-relaxed mb-4">
    "We cut our infrastructure costs by 60% and eliminated an entire category of vendor lock-in. The migration was seamless."
  </blockquote>
  
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-full bg-[#FF4801]/10 flex items-center justify-center">
      <span className="text-sm font-medium text-[#FF4801]">JD</span>
    </div>
    <div>
      <div className="text-sm font-medium text-[#521000]">Jane Doe</div>
      <div className="text-xs text-[#521000]/60">CTO, TechCorp</div>
    </div>
  </div>
</div>
```

---

# Forms

## FORM-INPUT

Text input with label and optional error state.

### React + Tailwind

```jsx
<div className="flex flex-col">
  <label htmlFor="storage" className="block mb-2 text-base font-medium text-[#521000] leading-tight">
    How much data will you store?
  </label>
  <input
    type="text"
    id="storage"
    className="border border-[#EBD5C1] bg-[#FFFDFB] text-[#521000] text-sm rounded-lg p-3 text-right focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none transition-all duration-150"
    placeholder="10"
    defaultValue="10"
  />
</div>
```

### Vanilla HTML

```html
<div style="display: flex; flex-direction: column;">
  <label for="storage" style="
    display: block;
    margin-bottom: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: #521000;
    line-height: 1.4;
  ">
    How much data will you store?
  </label>
  <input
    type="text"
    id="storage"
    placeholder="10"
    value="10"
    style="
      border: 1px solid #EBD5C1;
      background: #FFFDFB;
      color: #521000;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      border-radius: 8px;
      padding: 12px;
      text-align: right;
      outline: none;
      transition: all 0.15s ease;
    "
    onfocus="this.style.borderColor='#FF4801'; this.style.boxShadow='0 0 0 1px #FF4801';"
    onblur="this.style.borderColor='#EBD5C1'; this.style.boxShadow='none';"
  />
</div>
```

---

## FORM-INPUT-WITH-UNIT

Input with unit selector dropdown (e.g., for pricing calculators or quantity inputs).

### React + Tailwind

```jsx
<div className="flex flex-col">
  <label htmlFor="data_stored" className="block mb-2 text-base font-medium text-[#521000] leading-tight">
    How much data will you store?
  </label>
  <div className="flex">
    <input
      id="data_stored"
      type="text"
      className="flex-1 border border-[#EBD5C1] bg-[#FFFDFB] text-[#521000] text-sm rounded-lg p-3 text-right focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
      defaultValue="10"
    />
    <div className="relative ml-2">
      <select
        aria-label="Storage unit"
        className="appearance-none pl-3 pr-8 py-3 text-sm text-[#521000] bg-[#FEF7ED] border border-[#EBD5C1] rounded-lg cursor-pointer focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
        defaultValue="TB"
      >
        <option value="GB">GB</option>
        <option value="TB">TB</option>
        <option value="PB">PB</option>
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#521000]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
</div>
```

### Vanilla HTML

```html
<div style="display: flex; flex-direction: column;">
  <label for="data_stored" style="
    display: block;
    margin-bottom: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: #521000;
    line-height: 1.4;
  ">
    How much data will you store?
  </label>
  <div style="display: flex;">
    <input
      id="data_stored"
      type="text"
      value="10"
      style="
        flex: 1;
        border: 1px solid #EBD5C1;
        background: #FFFDFB;
        color: #521000;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        border-radius: 8px;
        padding: 12px;
        text-align: right;
        outline: none;
      "
    />
    <div style="position: relative; margin-left: 8px;">
      <select aria-label="Storage unit" style="
        appearance: none;
        padding: 12px 32px 12px 12px;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        color: #521000;
        background: #FEF7ED;
        border: 1px solid #EBD5C1;
        border-radius: 8px;
        cursor: pointer;
        outline: none;
      ">
        <option value="GB">GB</option>
        <option value="TB" selected>TB</option>
        <option value="PB">PB</option>
      </select>
      <svg style="pointer-events: none; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: rgba(82,16,0,0.6);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
</div>
```

---

## FORM-RANGE-SLIDER

Range slider with floating value badge (useful for usage/pricing inputs).

### React + Tailwind

```jsx
function RangeSlider() {
  const [value, setValue] = useState(75);
  
  return (
    <div className="flex flex-col">
      <label htmlFor="egress" className="block mb-2 text-base font-medium text-[#521000] leading-tight">
        What % of stored data will be downloaded (egress) monthly?
      </label>
      <div className="pt-8 relative">
        <input
          type="range"
          id="egress"
          min="0"
          max="500"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full h-2 bg-[#EBD5C1] rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-[#FF4801]
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:active:cursor-grabbing"
          style={{
            background: `linear-gradient(to right, #FF4801 0%, #FF4801 ${(value / 500) * 100}%, #EBD5C1 ${(value / 500) * 100}%, #EBD5C1 100%)`
          }}
        />
        {/* Floating badge */}
        <div 
          className="absolute -top-1 text-xs font-medium text-[#FF4801] bg-[#FF4801]/10 px-2 py-1 rounded-full whitespace-nowrap"
          style={{ left: `calc(${(value / 500) * 100}% - 20px)` }}
        >
          {value}%
        </div>
        <div className="flex justify-between pt-2 text-xs text-[#521000]/60">
          <span>0%</span>
          <span>500%</span>
        </div>
      </div>
    </div>
  );
}
```

### Vanilla HTML + JavaScript

```html
<div style="display: flex; flex-direction: column;">
  <label for="egress" style="
    display: block;
    margin-bottom: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: #521000;
    line-height: 1.4;
  ">
    What % of stored data will be downloaded (egress) monthly?
  </label>
  <div style="padding-top: 32px; position: relative;">
    <input
      type="range"
      id="egress"
      min="0"
      max="500"
      value="75"
      style="
        width: 100%;
        height: 8px;
        border-radius: 9999px;
        appearance: none;
        cursor: pointer;
        background: linear-gradient(to right, #FF4801 15%, #EBD5C1 15%);
      "
      oninput="updateSlider(this)"
    />
    <div id="slider-badge" style="
      position: absolute;
      top: 0;
      left: calc(15% - 20px);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #FF4801;
      background: rgba(255,72,1,0.1);
      padding: 4px 8px;
      border-radius: 9999px;
      white-space: nowrap;
    ">75%</div>
    <div style="display: flex; justify-content: space-between; padding-top: 8px; font-family: 'Inter', sans-serif; font-size: 12px; color: rgba(82,16,0,0.6);">
      <span>0%</span>
      <span>500%</span>
    </div>
  </div>
</div>

<script>
function updateSlider(input) {
  const value = input.value;
  const percent = (value / 500) * 100;
  input.style.background = `linear-gradient(to right, #FF4801 ${percent}%, #EBD5C1 ${percent}%)`;
  const badge = document.getElementById('slider-badge');
  badge.textContent = value + '%';
  badge.style.left = `calc(${percent}% - 20px)`;
}
</script>

<style>
input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: white;
  border: 2px solid #FF4801;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: grab;
}
input[type="range"]::-webkit-slider-thumb:active {
  cursor: grabbing;
}
</style>
```

---

## FORM-TOGGLE

Toggle switch for on/off states.

### React + Tailwind

```jsx
function Toggle({ enabled, onChange, label }) {
  return (
    <label className="inline-flex items-center cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-[#EBD5C1] peer-focus:ring-2 peer-focus:ring-[#FF4801]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#EBD5C1] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF4801]"></div>
      </div>
      {label && <span className="ml-3 text-sm font-medium text-[#521000]">{label}</span>}
    </label>
  );
}
```

### Vanilla HTML

```html
<label style="display: inline-flex; align-items: center; cursor: pointer;">
  <div style="position: relative;">
    <input type="checkbox" id="toggle" style="position: absolute; width: 1px; height: 1px; opacity: 0;" onchange="updateToggle(this)">
    <div id="toggle-track" style="
      width: 44px;
      height: 24px;
      background: #EBD5C1;
      border-radius: 9999px;
      position: relative;
      transition: background 0.2s ease;
    ">
      <div id="toggle-thumb" style="
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: transform 0.2s ease;
      "></div>
    </div>
  </div>
  <span style="margin-left: 12px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; color: #521000;">Enable feature</span>
</label>

<script>
function updateToggle(input) {
  const track = document.getElementById('toggle-track');
  const thumb = document.getElementById('toggle-thumb');
  if (input.checked) {
    track.style.background = '#FF4801';
    thumb.style.transform = 'translateX(20px)';
  } else {
    track.style.background = '#EBD5C1';
    thumb.style.transform = 'translateX(0)';
  }
}
</script>
```

---

## FORM-TOGGLE-GROUP

Toggle button group for binary or small-set selection (e.g., month/year billing).

### React + Tailwind

```jsx
function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-[#EBD5C1] overflow-hidden">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 text-sm font-medium transition-all ${
            value === option.value
              ? 'bg-[#FF4801] text-white hover:opacity-95'
              : 'bg-[#FFFDFB] text-[#521000] hover:bg-[#FEF7ED]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Usage
<ToggleGroup
  options={[
    { value: 'month', label: 'month' },
    { value: 'year', label: 'year' }
  ]}
  value="month"
  onChange={(v) => setPeriod(v)}
/>
```

### Vanilla HTML

```html
<div style="display: inline-flex; border-radius: 9999px; border: 1px solid #EBD5C1; overflow: hidden;">
  <button type="button" id="btn-month" onclick="selectPeriod('month')" style="
    padding: 8px 16px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 500;
    background: #FF4801;
    color: white;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  ">month</button>
  <button type="button" id="btn-year" onclick="selectPeriod('year')" style="
    padding: 8px 16px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 500;
    background: #FFFDFB;
    color: #521000;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  ">year</button>
</div>

<script>
function selectPeriod(period) {
  const monthBtn = document.getElementById('btn-month');
  const yearBtn = document.getElementById('btn-year');
  
  if (period === 'month') {
    monthBtn.style.background = '#FF4801';
    monthBtn.style.color = 'white';
    yearBtn.style.background = '#FFFDFB';
    yearBtn.style.color = '#521000';
  } else {
    yearBtn.style.background = '#FF4801';
    yearBtn.style.color = 'white';
    monthBtn.style.background = '#FFFDFB';
    monthBtn.style.color = '#521000';
  }
}
</script>
```

---

## FORM-NUMBER-INPUT

Number input with increment/decrement buttons.

### React + Tailwind

```jsx
function NumberInput({ value, onChange, min = 0, max = Infinity, step = 1 }) {
  return (
    <div className="flex items-center border border-[#EBD5C1] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="px-3 py-2 bg-[#FEF7ED] text-[#521000] hover:bg-[#EBD5C1] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
      <input
        type="text"
        value={value.toLocaleString()}
        onChange={(e) => onChange(Number(e.target.value.replace(/,/g, '')))}
        className="w-24 px-3 py-2 text-center text-sm text-[#521000] bg-[#FFFDFB] border-none outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="px-3 py-2 bg-[#FEF7ED] text-[#521000] hover:bg-[#EBD5C1] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
```

---

## FORM-SELECT

Custom styled select dropdown.

### React + Tailwind

```jsx
<div className="relative">
  <select
    className="appearance-none w-full pl-4 pr-10 py-3 text-sm text-[#521000] bg-[#FFFDFB] border border-[#EBD5C1] rounded-lg cursor-pointer focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
    defaultValue="us-east"
  >
    <option value="us-east">US East (N. Virginia)</option>
    <option value="us-west">US West (Oregon)</option>
    <option value="eu-west">EU West (Ireland)</option>
    <option value="ap-south">Asia Pacific (Singapore)</option>
  </select>
  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#521000]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
</div>
```

---

# Calculator Tools

## CALC-LAYOUT

Full calculator layout with input panel and results panel.

### React + Tailwind

```jsx
<main className="max-w-5xl mx-auto">
  <div className="relative overflow-visible bg-[#FFFDFB] border border-[#EBD5C1] p-6 sm:p-8 mt-6 sm:mt-10">
    {/* Corner brackets */}
    <div className="pointer-events-none absolute inset-0 z-10 select-none" aria-hidden="true">
      <div className="absolute bg-[#FFFBF5]" style={{ top: '-4px', left: '-4px', width: '8px', height: '8px', border: '1px solid #EBD5C1', borderRadius: '1.5px' }} />
      <div className="absolute bg-[#FFFBF5]" style={{ top: '-4px', right: '-4px', width: '8px', height: '8px', border: '1px solid #EBD5C1', borderRadius: '1.5px' }} />
      <div className="absolute bg-[#FFFBF5]" style={{ left: '-4px', bottom: '-4px', width: '8px', height: '8px', border: '1px solid #EBD5C1', borderRadius: '1.5px' }} />
      <div className="absolute bg-[#FFFBF5]" style={{ right: '-4px', bottom: '-4px', width: '8px', height: '8px', border: '1px solid #EBD5C1', borderRadius: '1.5px' }} />
    </div>
    
    {/* Form inputs */}
    <form>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Input fields go here */}
      </div>
    </form>
    
    {/* Period toggle */}
    <div className="flex justify-end mt-6 mb-4">
      {/* Toggle group */}
    </div>
    
    {/* Results */}
    <div className="space-y-3">
      {/* Provider comparison cards */}
    </div>
    
    {/* Use case presets */}
    <div className="mt-6 pt-6 border-t border-[#EBD5C1]/50">
      <p className="text-sm text-[#521000]/60 mb-3">Try a use case</p>
      <div className="grid grid-cols-3 gap-3">
        {/* Use case buttons */}
      </div>
    </div>
  </div>
</main>
```

---

## CALC-PRICING-TABLE

Pricing details table for showing tiered or itemized costs.

### React + Tailwind

```jsx
<div className="bg-[#FFFDFB] border border-[#EBD5C1] p-6">
  <div className="mb-6">
    <h2 className="font-medium text-lg text-[#521000] mb-2">Pricing Details</h2>
    <p className="text-sm text-[#521000]/60">
      Pricing is based on actual usage. Pay only for what you consume — no commitments, no per-seat fees.
      <a className="underline text-[#FF4801] hover:text-[#FF4801]/80 transition-colors ml-1" href="#">
        View pricing documentation
      </a>
    </p>
  </div>
  
  <div className="overflow-x-auto -mx-6 px-6">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#EBD5C1]">
          <th className="text-left py-3 pr-4 font-medium text-[#521000]"></th>
          <th className="text-left py-3 px-4 font-medium text-[#521000]">Forever Free</th>
          <th className="text-left py-3 pl-4 font-medium text-[#521000]">Monthly Rates</th>
        </tr>
      </thead>
      <tbody className="text-[#521000]/60">
        <tr className="border-b border-[#EBD5C1]/50">
          <td className="py-3 pr-4 font-medium text-[#521000]">Storage</td>
          <td className="py-3 px-4">10 GB / month</td>
          <td className="py-3 pl-4">$0.015 / GB storage</td>
        </tr>
        <tr className="border-b border-[#EBD5C1]/50">
          <td className="py-3 pr-4 font-medium text-[#521000]">Class A operations: write or list</td>
          <td className="py-3 px-4">1,000,000 / month</td>
          <td className="py-3 pl-4">$4.50 / million</td>
        </tr>
        <tr className="border-b border-[#EBD5C1]/50">
          <td className="py-3 pr-4 font-medium text-[#521000]">Class B operations: read</td>
          <td className="py-3 px-4">10,000,000 / month</td>
          <td className="py-3 pl-4">$0.36 / million</td>
        </tr>
        <tr>
          <td className="py-3 pr-4 font-medium text-[#521000]">Egress (data transfer to Internet)</td>
          <td className="py-3 px-4">Free</td>
          <td className="py-3 pl-4">Free</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

---

# Navigation

## NAV-HEADER

Main site header with logo, navigation links, and CTAs.

### React + Tailwind

```jsx
<header className="border-b border-[#EBD5C1] bg-[#FFFBF5] relative z-20">
  <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center gap-4">
    {/* Logo */}
    <a href="/" className="shrink-0 flex items-center gap-2">
      <img className="h-[30px]" src="/logo.svg" alt="Your brand" />
      <div className="hidden lg:flex flex-col items-start -mb-1">
        <span className="text-[9px] leading-none font-medium text-[#521000] uppercase">Your brand</span>
        <span className="text-[23px] leading-none font-medium text-[#521000] whitespace-nowrap" style={{ letterSpacing: '-0.46px' }}>
          Product Name
        </span>
      </div>
    </a>
    
    {/* Actions */}
    <div className="flex items-center gap-2 sm:gap-3">
      <a
        href="/docs"
        className="hidden sm:block border border-[#EBD5C1] bg-[#FFFBF5] text-[#FF4801] hover:text-[#521000] hover:border-dashed font-medium px-4 sm:px-6 py-2 sm:py-3 rounded-full transition-all text-center text-sm"
      >
        View docs
      </a>
      <a
        href="/signup"
        className="bg-[#FF4801] border border-transparent hover:border-dashed hover:border-white/50 hover:opacity-95 text-white font-medium px-4 sm:px-6 py-2 sm:py-3 rounded-full transition-all text-center text-sm"
      >
        Get started
      </a>
    </div>
  </div>
</header>
```

### Vanilla HTML

```html
<header style="
  border-bottom: 1px solid #EBD5C1;
  background: #FFFBF5;
  position: relative;
  z-index: 20;
">
  <div style="
    max-width: 1024px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  ">
    <!-- Logo -->
    <a href="/" style="flex-shrink: 0; display: flex; align-items: center; gap: 8px; text-decoration: none;">
      <img src="/logo.svg" alt="Your brand" style="height: 30px;" />
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        <span style="font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 500; color: #521000; text-transform: uppercase;">Your brand</span>
        <span style="font-family: 'Inter', sans-serif; font-size: 23px; font-weight: 500; color: #521000; white-space: nowrap; letter-spacing: -0.46px;">Product Name</span>
      </div>
    </a>
    
    <!-- Actions -->
    <div style="display: flex; align-items: center; gap: 12px;">
      <a href="/docs" style="
        display: inline-block;
        border: 1px solid #EBD5C1;
        background: #FFFBF5;
        color: #FF4801;
        font-family: 'Inter', sans-serif;
        font-weight: 500;
        font-size: 14px;
        padding: 12px 24px;
        border-radius: 9999px;
        text-decoration: none;
        text-align: center;
        transition: all 0.15s ease;
      ">View docs</a>
      <a href="/signup" style="
        display: inline-block;
        background: #FF4801;
        color: white;
        font-family: 'Inter', sans-serif;
        font-weight: 500;
        font-size: 14px;
        padding: 12px 24px;
        border-radius: 9999px;
        text-decoration: none;
        text-align: center;
        transition: all 0.15s ease;
      ">Get started</a>
    </div>
  </div>
</header>
```

---

## NAV-FOOTER

Site footer with links and legal text.

### React + Tailwind

```jsx
<footer className="mt-8 py-6 bg-[#FFFBF5] border-t border-[#EBD5C1]">
  <ul className="flex flex-col sm:flex-row flex-1 flex-wrap sm:items-center gap-2 max-w-5xl mx-auto px-6 sm:px-8 text-xs text-[#521000]/60">
    <li>© 2024 Your Company, Inc.</li>
    <li>
      <a href="/privacy" className="hover:text-[#521000] transition-colors">Privacy Policy</a>
    </li>
    <li>
      <a href="/terms" className="hover:text-[#521000] transition-colors">Terms of Use</a>
    </li>
    <li>
      <a href="/security" className="hover:text-[#521000] transition-colors">Report Security Issues</a>
    </li>
    <li>
      <a href="/trademark" className="hover:text-[#521000] transition-colors">Trademark</a>
    </li>
  </ul>
</footer>
```

---

# Hero Sections

## HERO-CENTERED

Centered hero section with headline, description, and CTAs.

### React + Tailwind

```jsx
<section className="pt-8 sm:pt-12 max-w-5xl mx-auto">
  <div className="text-center sm:text-left px-6 sm:px-8">
    <h1 className="font-medium text-2xl sm:text-3xl text-[#521000] mb-3" style={{ letterSpacing: '-0.035em' }}>
      Build faster. Ship more.
    </h1>
    <p className="text-sm sm:text-base text-[#521000]/60 leading-tight">
      Replace your fragmented toolchain with a single platform that scales with your team. From zero to production in minutes, not days.
    </p>
    <p className="text-sm sm:text-base text-[#521000] font-medium mt-3">
      Free to start. No credit card required.
    </p>
  </div>
</section>
```

---

## HERO-PRODUCT

Hero section with accent background for product pages.

### React + Tailwind

```jsx
<section className="bg-[#FF4801] relative overflow-hidden min-h-[400px] flex items-center">
  <div className="max-w-5xl mx-auto px-6 sm:px-8 py-16 relative z-10">
    <h1 className="font-medium text-3xl sm:text-4xl lg:text-5xl text-white mb-4" style={{ letterSpacing: '-0.02em' }}>
      Build full-stack applications
      <br />
      at the edge
    </h1>
    <p className="text-lg text-white/75 max-w-xl mb-8">
      Deploy globally distributed code instantly. Exceptional performance, reliability, and scale — without the ops overhead.
    </p>
    <div className="flex flex-wrap gap-3">
      <a href="/signup" className="inline-flex items-center justify-center px-6 py-3 rounded-full font-medium bg-white text-[#FF4801] transition-all hover:opacity-95">
        Start building
      </a>
      <a href="/docs" className="inline-flex items-center justify-center px-6 py-3 rounded-full font-medium bg-transparent text-white border border-white/50 transition-all hover:bg-white/10">
        View documentation
      </a>
    </div>
  </div>
</section>
```

---

# Data Display

## DATA-PROGRESS-BAR

Progress bar with label and percentage.

### React + Tailwind

```jsx
<div className="space-y-2">
  <div className="flex justify-between text-sm">
    <span className="font-medium text-[#521000]">Storage used</span>
    <span className="text-[#521000]/60">75%</span>
  </div>
  <div className="h-3 bg-[#EBD5C1]/30 rounded-full overflow-hidden">
    <div 
      className="h-full bg-[#FF4801] rounded-full transition-all duration-500 ease-out"
      style={{ width: '75%' }}
    />
  </div>
</div>
```

---

## DATA-METRIC-BADGE

Inline metric badge for highlighting values.

### React + Tailwind

```jsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[#FF4801]/10 text-[#FF4801]">
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
  +24%
</span>
```

---

# Layout

## LAYOUT-CONTAINER

Max-width centered container.

### React + Tailwind

```jsx
<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
  {/* Content */}
</div>
```

### Vanilla HTML

```html
<div style="
  max-width: 1024px;
  margin: 0 auto;
  padding: 0 16px;
">
  <!-- Content -->
</div>
```

---

## LAYOUT-SECTION

Full-width section with vertical padding.

### React + Tailwind

```jsx
<section className="py-12 sm:py-16 lg:py-20 bg-[#FFFBF5]">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    {/* Section content */}
  </div>
</section>
```

---

## LAYOUT-GRID-2

Two-column responsive grid.

### React + Tailwind

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
  {/* Grid items */}
</div>
```

---

## LAYOUT-GRID-3

Three-column responsive grid.

### React + Tailwind

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
  {/* Grid items */}
</div>
```

---

# Decorative

## DECOR-DOT-PATTERN

SVG dot pattern background.

### React + Tailwind

```jsx
<div className="relative">
  {/* Dot pattern */}
  <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <pattern id="dot-pattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="6" cy="6" r="0.75" fill="#EBD5C1" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#dot-pattern)" />
    </svg>
  </div>
  
  {/* Content */}
  <div className="relative z-10">
    {/* Your content here */}
  </div>
</div>
```

---

## DECOR-CORNER-BRACKETS

Corner bracket decorations for cards.

### React + Tailwind

```jsx
{/* Add these as children of a relative-positioned container */}
<div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
<div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
<div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
<div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
```

### CSS Component

```css
.corner-brackets {
  position: relative;
}

.corner-brackets::before,
.corner-brackets::after,
.corner-brackets > .corner-tl,
.corner-brackets > .corner-tr,
.corner-brackets > .corner-bl,
.corner-brackets > .corner-br {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid #EBD5C1;
  border-radius: 1.5px;
  background: #FFFBF5;
  pointer-events: none;
}

.corner-brackets > .corner-tl { top: -4px; left: -4px; }
.corner-brackets > .corner-tr { top: -4px; right: -4px; }
.corner-brackets > .corner-bl { bottom: -4px; left: -4px; }
.corner-brackets > .corner-br { bottom: -4px; right: -4px; }
```

---

## DECOR-DASHED-BORDER

Dashed border container for grouping.

### React + Tailwind

```jsx
<div className="border border-dashed border-[#EBD5C1] p-6">
  {/* Content */}
</div>
```

---

## DECOR-GRADIENT-MASK

Gradient fade overlay for scrollable content.

### React + Tailwind

```jsx
<div className="relative overflow-hidden">
  {/* Scrollable content */}
  <div className="overflow-x-auto">
    {/* Content */}
  </div>
  
  {/* Left fade */}
  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#FFFBF5] to-transparent pointer-events-none" />
  
  {/* Right fade */}
  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#FFFBF5] to-transparent pointer-events-none" />
</div>
```

---
