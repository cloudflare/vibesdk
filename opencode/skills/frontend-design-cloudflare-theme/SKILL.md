# ===== CF-WORKERS-DESIGN.md =====

# CF Workers Design System

> **AI-Optimized Design Reference** for building Cloudflare-style landing pages, calculators, interactive tools, and marketing assets.
>
> Based on: `workers.cloudflare.com`, `workershops.cloudflare.com`, `r2-calculator.cloudflare.com`

---

## Quick Reference (TL;DR)

```
Brand Orange:     #FF4801 (primary), #FF7038 (hover)
Background:       #FFFBF5 (cream) / #121212 (dark mode)
Text:             #521000 (brown) / #F0E3DE (dark mode)
Border:           #EBD5C1
Font Sans:        "FT Kunst Grotesk", sans-serif
Font Mono:        "Apercu Mono Pro", monospace
Base Spacing:     4px (use multiples: 8, 12, 16, 24, 32, 48, 64)
Border Radius:    Buttons = full (9999px), Cards = 12-16px, Inputs = 8px
```

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
| `--cf-orange` | `#FF4801` | `rgb(255, 72, 1)` | Primary accent, CTAs, links |
| `--cf-orange-hover` | `#FF7038` | `rgb(255, 112, 56)` | Hover states |
| `--cf-orange-light` | `rgba(255, 72, 1, 0.1)` | — | Badges, light backgrounds |
| `--cf-text` | `#521000` | `rgb(82, 16, 0)` | Primary text |
| `--cf-text-muted` | `rgba(82, 16, 0, 0.6)` | — | Secondary text |
| `--cf-text-subtle` | `rgba(82, 16, 0, 0.38)` | — | Tertiary text, placeholders |
| `--cf-bg-page` | `#F5F1EB` | `rgb(245, 241, 235)` | Page background (outer) |
| `--cf-bg-100` | `#FFFBF5` | `rgb(255, 251, 245)` | Primary background |
| `--cf-bg-200` | `#FFFDFB` | `rgb(255, 253, 251)` | Card backgrounds |
| `--cf-bg-300` | `#FEF7ED` | `rgb(254, 247, 237)` | Hover backgrounds |
| `--cf-border` | `#EBD5C1` | `rgb(235, 213, 193)` | Borders, dividers |
| `--cf-border-light` | `rgba(235, 213, 193, 0.5)` | — | Subtle borders |

### 2.2 Primary Palette (Dark Mode)

| Token | Hex | Usage |
|-------|-----|-------|
| `--cf-orange` | `#F14602` | Primary accent |
| `--cf-orange-hover` | `#FF6D33` | Hover states |
| `--cf-text` | `#F0E3DE` | Primary text |
| `--cf-text-muted` | `rgba(255, 253, 251, 0.56)` | Secondary text |
| `--cf-bg-100` | `#121212` | Primary background |
| `--cf-bg-200` | `#191817` | Card backgrounds |
| `--cf-bg-300` | `#2A2927` | Hover backgrounds |
| `--cf-border` | `rgba(240, 227, 222, 0.13)` | Borders |

### 2.3 Product Category Colors

| Category | Primary | Background | Usage |
|----------|---------|------------|-------|
| Compute | `#0A95FF` | `rgba(10, 149, 255, 0.1)` | Workers, compute products |
| Storage | `#EE0DDB` | `rgba(238, 13, 219, 0.1)` | R2, D1, KV |
| AI | `#19E306` | `#F2F5E1` | Workers AI, inference |
| Media | `#9616FF` | `#F8EBEE` | Stream, Images |

### 2.4 Semantic Colors

| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Success | `#16A34A` | `#4ADE80` |
| Warning | `#EAB308` | `#FACC15` |
| Error | `#DC2626` | `#F87171` |
| Info | `#2563EB` | `#60A5FA` |

### 2.5 Comparison Provider Colors (for calculators)

| Provider | Color | Usage |
|----------|-------|-------|
| Cloudflare | `#FF4801` | R2, Workers pricing |
| AWS | `#FF9900` | S3 comparison |
| Google Cloud | `#4285F4` | GCS comparison |
| Azure | `#0078D4` | Azure comparison |

---

## 3. Typography

### 3.1 Font Families

```css
--font-sans: "FT Kunst Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "Apercu Mono Pro", "SF Mono", "Fira Code", "Consolas", monospace;
```

**Font Files:**
- `Kunst Grotesk Regular.woff2` (400)
- `Kunst Grotesk Medium.woff2` (500)
- `Apercu Mono Pro Regular.woff2` (400)

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
  --cf-orange: #FF4801;
  --cf-text: #521000;
  --cf-text-muted: rgba(82, 16, 0, 0.6);
  --cf-bg-100: #FFFBF5;
  --cf-bg-200: #FFFDFB;
  --cf-border: #EBD5C1;
}

:root.dark, html.dark {
  --cf-orange: #F14602;
  --cf-text: #F0E3DE;
  --cf-text-muted: rgba(255, 253, 251, 0.56);
  --cf-bg-100: #121212;
  --cf-bg-200: #191817;
  --cf-border: rgba(240, 227, 222, 0.13);
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
  outline: 2px solid var(--cf-orange);
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
  border-color: var(--cf-orange);
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
  color: var(--cf-text);
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
  border: 1px solid var(--cf-border);
  border-radius: 1.5px;
  background: var(--cf-bg-100);
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
    var(--cf-border) 0.75px,
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
    var(--cf-border) 50%,
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
    var(--cf-border) 50%,
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
│   └── Apercu Mono Pro Regular.woff2
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
  --cf-orange: #FF4801;
  --cf-orange-hover: #FF7038;
  --cf-orange-light: rgba(255, 72, 1, 0.1);
  
  /* Colors - Text */
  --cf-text: #521000;
  --cf-text-muted: rgba(82, 16, 0, 0.6);
  --cf-text-subtle: rgba(82, 16, 0, 0.38);
  
  /* Colors - Backgrounds */
  --cf-bg-page: #F5F1EB;
  --cf-bg-100: #FFFBF5;
  --cf-bg-200: #FFFDFB;
  --cf-bg-300: #FEF7ED;
  
  /* Colors - Borders */
  --cf-border: #EBD5C1;
  --cf-border-light: rgba(235, 213, 193, 0.5);
  
  /* Colors - Semantic */
  --cf-success: #16A34A;
  --cf-warning: #EAB308;
  --cf-error: #DC2626;
  --cf-info: #2563EB;
  
  /* Colors - Product Categories */
  --cf-compute: #0A95FF;
  --cf-storage: #EE0DDB;
  --cf-ai: #19E306;
  --cf-media: #9616FF;
  
  /* Colors - Provider Comparisons */
  --cf-aws: #FF9900;
  --cf-gcp: #4285F4;
  --cf-azure: #0078D4;
  
  /* Typography */
  --font-sans: "FT Kunst Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "Apercu Mono Pro", "SF Mono", "Fira Code", monospace;
  
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
| **Max Container** | `1480px` (workers.cloudflare.com) / `1024px` (r2-calculator) | Content centered with `mx-auto` |
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
/* From r2-calculator.cloudflare.com CSS */
:root {
  --cf-orange: #ff4801;        /* Primary accent - EXACT */
  --cf-text: #521000;          /* Primary text - warm brown */
  --cf-bg-page: #fffbf5;       /* Page background - warm cream */
  --cf-border: #EBD5C1;        /* Border color */
}

/* Background Layers (Light Mode) */
--cf-bg-100: rgb(255, 251, 245);  /* #FFFBF5 - Primary */
--cf-bg-200: rgb(255, 253, 251);  /* #FFFDFB - Cards/elevated */
--cf-bg-300: rgb(254, 247, 237);  /* #FEF7ED - Hover states */

/* Text Opacity Variations */
--cf-text-muted: rgba(82, 16, 0, 0.7);   /* #521000b3 - Secondary */
--cf-text-subtle: rgba(82, 16, 0, 0.4);  /* #52100066 - Tertiary */
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

#### Provider Comparison Colors

```css
/* For pricing calculators */
--aws-orange: rgb(255, 153, 0);   /* #FF9900 */
--gcp-blue: rgb(66, 133, 244);    /* #4285F4 */
--cloudflare: rgb(255, 72, 1);    /* #FF4801 */
```

### 15.3 Typography & Micro-Copy Specs

#### Type Personality: **Grotesk Sans**

The typography uses **FT Kunst Grotesk** - a modern grotesk with humanist touches. Fallback chain:
```css
font-family: FT Kunst Grotesk, -apple-system, system-ui, BlinkMacSystemFont, 
             Segoe UI, sans-serif, ui-sans-serif, system-ui, sans-serif;
```

#### Monospace for Code
```css
font-family: Apercu Mono Pro, ui-monospace, SFMono-Regular, SF Mono, 
             Monaco, Consolas, monospace;
```

#### Hierarchy Definition

| Level | Size | Weight | Line Height | Letter Spacing | Example |
|-------|------|--------|-------------|----------------|---------|
| **h1** | 24px-30px (`text-2xl` to `text-3xl`) | 500 (medium) | 1.2-1.33 | `-0.035em` | "R2 Pricing Calculator" |
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
  background-color: var(--cf-bg-300);  /* Warmer cream */
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
  outline: 2px solid var(--cf-orange);
  outline-offset: 2px;
}

input:focus {
  border-color: var(--cf-orange);
  box-shadow: 0 0 0 3px rgba(255, 72, 1, 0.1);
}
```

**NO "Grow" effects, "Glow" borders, or "Shimmer" overlays** - The design is subtle and professional.

#### Corner Brackets (Signature Element)

The 8px corner bracket decorations are a signature Cloudflare Workers element:

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
        sans: ['FT Kunst Grotesk', '-apple-system', 'system-ui', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Apercu Mono Pro', 'ui-monospace', 'SFMono-Regular', 'SF Mono', 'Monaco', 'Consolas', 'monospace'],
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
  --cf-orange: #FF4801;
  --cf-orange-hover: #FF7038;
  --cf-orange-light: rgba(255, 72, 1, 0.06);
  
  /* Text */
  --cf-text: #521000;
  --cf-text-muted: rgba(82, 16, 0, 0.7);
  --cf-text-subtle: rgba(82, 16, 0, 0.4);
  
  /* Backgrounds */
  --cf-bg-page: #FFFBF5;
  --cf-bg-100: #FFFBF5;
  --cf-bg-200: #FFFDFB;
  --cf-bg-300: #FEF7ED;
  
  /* Borders */
  --cf-border: #EBD5C1;
  --cf-border-light: rgba(235, 213, 193, 0.5);
  
  /* Semantic */
  --cf-success: #16A34A;
  --cf-success-bg: #DCF7E3;
  --cf-warning: #EAB308;
  --cf-error: #DC2626;
  
  /* Provider Colors */
  --aws-orange: #FF9900;
  --gcp-blue: #4285F4;
  
  /* === TYPOGRAPHY === */
  --font-sans: "FT Kunst Grotesk", -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "Apercu Mono Pro", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace;
  
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
  --cf-orange: #F14602;
  --cf-text: #F0E3DE;
  --cf-text-muted: rgba(255, 253, 251, 0.56);
  --cf-bg-page: #0D0D0D;
  --cf-bg-100: #121212;
  --cf-bg-200: #191817;
  --cf-bg-300: #2A2927;
  --cf-border: rgba(240, 227, 222, 0.13);
}

/* Base Styles */
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  background-color: var(--cf-bg-page);
  color: var(--cf-text);
  font-family: var(--font-sans);
  overflow-x: hidden;
}

/* Focus States */
:focus-visible {
  outline: 2px solid var(--cf-orange);
  outline-offset: 2px;
}

input:focus,
select:focus {
  border-color: var(--cf-orange);
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

*Last updated: March 2026 — Based on forensic analysis of workers.cloudflare.com and r2-calculator.cloudflare.com*



# ===== SNIPPETS.md =====

# CF Workers Design - Component Snippets

> **Copy-paste ready components** for building Cloudflare-style interfaces.
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  font-family: 'FT Kunst Grotesk', sans-serif;
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
  
  <h3 style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 18px; font-weight: 500; color: #521000; margin: 0 0 8px 0;">Card Title</h3>
  <p style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); line-height: 1.6; margin: 0;">
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
  
  <h3 style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 16px; font-weight: 500; color: #521000; margin: 0 0 8px 0;">Lightning Fast</h3>
  <p style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); line-height: 1.6; margin: 0;">
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
  
  <div style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 30px; font-weight: 500; color: #FF4801; letter-spacing: -0.02em;">$0.015</div>
  <div style="font-family: 'Apercu Mono Pro', monospace; font-size: 12px; color: rgba(82,16,0,0.6); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">per GB / month</div>
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
    <h3 style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 18px; font-weight: 500; color: #521000; margin: 0;">Pro</h3>
    <div style="margin-top: 8px;">
      <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 30px; font-weight: 500; color: #521000;">$20</span>
      <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6);">/month</span>
    </div>
    <p style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6); margin: 8px 0 0 0;">For growing teams and projects</p>
  </div>
  
  <!-- Features -->
  <div style="padding: 24px;">
    <ul style="list-style: none; margin: 0; padding: 0;">
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: #521000; margin-bottom: 12px;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        100 GB storage included
      </li>
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: #521000; margin-bottom: 12px;">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#FF4801" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        10 million requests/month
      </li>
      <li style="display: flex; align-items: flex-start; gap: 12px; font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: #521000;">
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
      font-family: 'FT Kunst Grotesk', sans-serif;
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

## CARD-PROVIDER-COMPARISON

Provider comparison card for calculators (like R2 calculator).

### React + Tailwind

```jsx
<div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-4">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-3">
      <img src="/cloudflare-logo.svg" alt="Cloudflare R2" className="h-6 w-auto" />
      <span className="font-medium text-[#521000]">Cloudflare R2</span>
    </div>
    <div className="text-right">
      <span className="text-lg font-medium text-[#521000]">$150.00</span>
      <span className="text-sm text-[#521000]/60">/mo</span>
    </div>
  </div>
  
  {/* Progress bar */}
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
      <img src="/cloudflare-logo.svg" alt="Cloudflare R2" style="height: 24px; width: auto;" />
      <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-weight: 500; color: #521000;">Cloudflare R2</span>
    </div>
    <div style="text-align: right;">
      <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 18px; font-weight: 500; color: #521000;">$150.00</span>
      <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; color: rgba(82,16,0,0.6);">/mo</span>
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
  <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; font-weight: 500; color: #521000;">AI/ML Training</span>
  <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 12px; color: rgba(82,16,0,0.6); margin-top: 2px;">100TB</span>
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
    "Switching to Cloudflare R2 cut our storage costs by 60% and eliminated egress fees entirely. The migration was seamless."
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
    font-family: 'FT Kunst Grotesk', sans-serif;
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
      font-family: 'FT Kunst Grotesk', sans-serif;
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

Input with unit selector dropdown (like R2 calculator).

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
    font-family: 'FT Kunst Grotesk', sans-serif;
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
        font-family: 'FT Kunst Grotesk', sans-serif;
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
        font-family: 'FT Kunst Grotesk', sans-serif;
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

Range slider with floating value badge (like R2 calculator egress slider).

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
    font-family: 'FT Kunst Grotesk', sans-serif;
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
      font-family: 'FT Kunst Grotesk', sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #FF4801;
      background: rgba(255,72,1,0.1);
      padding: 4px 8px;
      border-radius: 9999px;
      white-space: nowrap;
    ">75%</div>
    <div style="display: flex; justify-content: space-between; padding-top: 8px; font-family: 'FT Kunst Grotesk', sans-serif; font-size: 12px; color: rgba(82,16,0,0.6);">
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
  <span style="margin-left: 12px; font-family: 'FT Kunst Grotesk', sans-serif; font-size: 14px; font-weight: 500; color: #521000;">Enable feature</span>
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

Toggle button group for month/year selection (like R2 calculator).

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
    font-family: 'FT Kunst Grotesk', sans-serif;
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
    font-family: 'FT Kunst Grotesk', sans-serif;
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

Pricing details table (like R2 calculator).

### React + Tailwind

```jsx
<div className="bg-[#FFFDFB] border border-[#EBD5C1] p-6">
  <div className="mb-6">
    <h2 className="font-medium text-lg text-[#521000] mb-2">Pricing Details</h2>
    <p className="text-sm text-[#521000]/60">
      R2 charges based on the total volume of data stored and two classes of operations on that data. You pay zero egress fees.
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
      <img className="h-[30px]" src="/cf-logo.svg" alt="Cloudflare" />
      <div className="hidden lg:flex flex-col items-start -mb-1">
        <span className="text-[9px] leading-none font-medium text-[#521000] uppercase">Cloudflare</span>
        <span className="text-[23px] leading-none font-medium text-[#521000] whitespace-nowrap" style={{ letterSpacing: '-0.46px' }}>
          Workers Platform
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
      <img src="/cf-logo.svg" alt="Cloudflare" style="height: 30px;" />
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 9px; font-weight: 500; color: #521000; text-transform: uppercase;">Cloudflare</span>
        <span style="font-family: 'FT Kunst Grotesk', sans-serif; font-size: 23px; font-weight: 500; color: #521000; white-space: nowrap; letter-spacing: -0.46px;">Workers Platform</span>
      </div>
    </a>
    
    <!-- Actions -->
    <div style="display: flex; align-items: center; gap: 12px;">
      <a href="/docs" style="
        display: inline-block;
        border: 1px solid #EBD5C1;
        background: #FFFBF5;
        color: #FF4801;
        font-family: 'FT Kunst Grotesk', sans-serif;
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
        font-family: 'FT Kunst Grotesk', sans-serif;
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
    <li>© 2024 Cloudflare, Inc.</li>
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
      R2 Pricing Calculator
    </h1>
    <p className="text-sm sm:text-base text-[#521000]/60 leading-tight">
      Cloudflare R2 Object Storage is S3-compatible and allows developers to store large amounts of unstructured data without the costly egress bandwidth fees associated with typical cloud storage services.
    </p>
    <p className="text-sm sm:text-base text-[#521000] font-medium mt-3">
      Enter your expected usage to estimate your monthly cost.
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
      on Cloudflare
    </h1>
    <p className="text-lg text-white/75 max-w-xl mb-8">
      Deploy serverless code instantly across the globe for exceptional performance, reliability, and scale.
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

*Last updated: Based on workers.cloudflare.com, workershops.cloudflare.com, r2-calculator.cloudflare.com*



# ===== PROMPTING-GUIDE.md =====

# CF Workers Design - AI Prompting Guide

> **How to instruct Claude (or any AI agent) to use this design system effectively.**

---

## 1. Setup Instructions

### 1.1 Loading the Design System

When starting a new conversation or project, include this context:

```
You are building a [landing page/calculator/tool/etc] using the Cloudflare Workers design system.

Reference these files for guidance:
- CF-WORKERS-DESIGN.md for color tokens, typography, spacing, and design principles
- SNIPPETS.md for copy-paste ready component code

Key brand rules:
- Primary color: #FF4801 (orange)
- Background: #FFFBF5 (warm cream, NEVER pure white)
- Text: #521000 (warm brown, NEVER pure black)
- Borders: #EBD5C1
- Font: FT Kunst Grotesk (sans), Apercu Mono Pro (mono)
- Buttons are always fully rounded (border-radius: 9999px)
- Cards have corner bracket decorations (8px × 8px squares)
```

### 1.2 Which Files to Reference

| Task | Primary Reference | Secondary Reference |
|------|-------------------|---------------------|
| Quick token lookup | CF-WORKERS-DESIGN.md | — |
| Building components | SNIPPETS.md | CF-WORKERS-DESIGN.md |
| Full page layouts | EXAMPLES.md | SNIPPETS.md |
| Understanding design rationale | CF-WORKERS-DESIGN.md | — |

### 1.3 Context Window Considerations

If context is limited, prioritize loading:

1. **Quick Reference section** from CF-WORKERS-DESIGN.md (first 50 lines)
2. **Specific component snippets** you need from SNIPPETS.md
3. **CSS Custom Properties** section for token values

---

## 2. System Prompts

Copy these prompts at the start of your conversation for specific tasks.

### 2.1 Landing Page System Prompt

```
You are a front-end developer building a marketing landing page using the Cloudflare Workers design system.

Design System Rules:
- Use warm cream backgrounds (#FFFBF5), never pure white
- Use warm brown text (#521000), never pure black
- Primary accent is orange (#FF4801)
- Borders are #EBD5C1
- Buttons are always fully rounded (rounded-full / border-radius: 9999px)
- Cards have corner bracket decorations (8px squares at each corner)
- Font family: "FT Kunst Grotesk" for body, "Apercu Mono Pro" for code
- Spacing uses 4px base unit (8, 12, 16, 24, 32, 48, 64)
- Border radius: 12px for cards, 8px for inputs, 9999px for buttons

Structure:
- Header with logo, nav links, and CTA buttons
- Hero section with headline, subtext, and action buttons
- Feature grid (3 columns on desktop, 1 on mobile)
- Stats or social proof section
- CTA section
- Footer with legal links

Use Tailwind CSS classes. Output clean, semantic HTML.
```

### 2.2 Pricing Calculator System Prompt

```
You are building an interactive pricing calculator similar to r2-calculator.cloudflare.com using the Cloudflare design system.

Design System Rules:
- Background: #FFFBF5 (warm cream)
- Text: #521000 (primary), rgba(82,16,0,0.6) (secondary)
- Accent: #FF4801 (orange)
- Borders: #EBD5C1
- Cards have 8px corner bracket decorations

Calculator UI Patterns:
- Two-column grid for input fields
- Input fields with labels above, right-aligned values
- Unit selector dropdowns next to number inputs
- Range sliders with floating percentage badges
- Month/year toggle button group
- Provider comparison cards with progress bars
- Use case preset buttons (grid of 3)
- Pricing details table with "Forever Free" and "Monthly Rates" columns

Technical Requirements:
- React with useState for form state
- Format numbers with commas (toLocaleString)
- Calculate costs in real-time as inputs change
- Animate progress bars with CSS transitions
- Support both React+Tailwind and Vanilla HTML versions

Output should be a complete, functional calculator component.
```

### 2.3 Interactive Tool System Prompt

```
You are building an interactive tool/configurator using the Cloudflare Workers design system.

Design System Rules:
- Warm cream background (#FFFBF5)
- Brown text (#521000) with 60% opacity for secondary
- Orange accent (#FF4801) for interactive elements
- Cream borders (#EBD5C1)

Tool UI Patterns:
- Split layout: controls on left, preview/results on right
- Form inputs with clear labels
- Toggle switches for boolean options
- Dropdown selects for enumerated choices
- Range sliders with value displays
- Real-time preview updates
- Corner bracket decorations on panels
- Monospace font (Apercu Mono Pro) for code/values

Include:
- State management (React useState or vanilla JS)
- Input validation
- Responsive layout (stack on mobile)
- Loading states where appropriate
```

### 2.4 Dashboard System Prompt

```
You are building a dashboard/metrics view using the Cloudflare Workers design system.

Design System Rules:
- Background: #FFFBF5 (page), #FFFDFB (cards)
- Text: #521000 (primary), rgba(82,16,0,0.6) (secondary)
- Accent: #FF4801 for positive metrics, product colors for categories
- Borders: #EBD5C1

Product Category Colors:
- Compute (blue): #0A95FF
- Storage (magenta): #EE0DDB
- AI (green): #19E306
- Media (purple): #9616FF

Dashboard Patterns:
- Stat cards with large numbers and labels
- Progress bars with percentages
- Metric badges (inline indicators)
- Data tables with alternating row backgrounds
- Grid layouts (2, 3, or 4 columns)
- Card shadows for elevation hierarchy
- Corner bracket decorations on key cards

Use semantic HTML, accessible markup, and responsive grid layouts.
```

---

## 3. Task Templates

Fill in the bracketed sections for specific tasks.

### 3.1 Build a Landing Page

```
Create a landing page for [PRODUCT NAME] with:

Hero section:
- Headline: "[MAIN HEADLINE]"
- Subtext: "[SUPPORTING TEXT]"
- Primary CTA: "[BUTTON TEXT]" linking to [URL]
- Secondary CTA: "[BUTTON TEXT]" linking to [URL]

Features (3 cards):
1. [FEATURE 1 TITLE]: [DESCRIPTION]
2. [FEATURE 2 TITLE]: [DESCRIPTION]
3. [FEATURE 3 TITLE]: [DESCRIPTION]

Stats section:
- [STAT 1]: [VALUE]
- [STAT 2]: [VALUE]
- [STAT 3]: [VALUE]

Use the Cloudflare Workers design system with warm cream backgrounds, orange accents, and corner bracket decorations on cards.
```

### 3.2 Build a Pricing Calculator

```
Create a pricing calculator for [PRODUCT] that calculates [WHAT IT CALCULATES].

Input fields:
1. [FIELD 1]: [TYPE] (e.g., number with unit selector GB/TB/PB)
2. [FIELD 2]: [TYPE] (e.g., number input)
3. [FIELD 3]: [TYPE] (e.g., range slider 0-100%)

Calculations:
- [FORMULA 1]
- [FORMULA 2]

Output display:
- Show [PRODUCT] cost
- Compare with [COMPETITOR 1] and [COMPETITOR 2]
- Use progress bars to visualize relative costs

Use case presets:
1. [USE CASE 1]: [DEFAULT VALUES]
2. [USE CASE 2]: [DEFAULT VALUES]
3. [USE CASE 3]: [DEFAULT VALUES]

Include a pricing details table showing free tier and paid rates.

Use the Cloudflare design system with the R2 calculator patterns.
```

### 3.3 Build a Configuration Tool

```
Create a configuration tool for [WHAT IT CONFIGURES].

Configuration options:
1. [OPTION 1]: [TYPE - toggle/select/input]
2. [OPTION 2]: [TYPE]
3. [OPTION 3]: [TYPE]

Preview/output should show:
- [WHAT THE OUTPUT DISPLAYS]
- [FORMAT - code block/visual/etc]

Real-time updates as options change.

Use the Cloudflare design system with split-panel layout (controls left, preview right).
```

### 3.4 Build a Comparison Table

```
Create a comparison table/tool for [WHAT IS BEING COMPARED].

Items to compare:
1. [ITEM 1]
2. [ITEM 2]
3. [ITEM 3]

Comparison criteria:
- [CRITERION 1]
- [CRITERION 2]
- [CRITERION 3]
- [CRITERION 4]

Highlight [ITEM TO EMPHASIZE] as the recommended option.

Use the Cloudflare design system with provider comparison card patterns.
```

---

## 4. Composition Rules

### 4.1 How Components Combine

**Page Structure:**
```
Header (NAV-HEADER)
├── Hero Section (HERO-CENTERED or HERO-PRODUCT)
├── Feature Section (LAYOUT-GRID-3 + CARD-FEATURE)
├── Calculator/Tool Section (CALC-LAYOUT)
├── Stats Section (LAYOUT-GRID-3 + CARD-STAT)
├── CTA Section (centered text + BTN-PRIMARY)
└── Footer (NAV-FOOTER)
```

**Calculator Structure:**
```
CALC-LAYOUT
├── Input Grid (LAYOUT-GRID-2)
│   ├── FORM-INPUT-WITH-UNIT
│   ├── FORM-INPUT
│   ├── FORM-RANGE-SLIDER
│   └── FORM-INPUT
├── FORM-TOGGLE-GROUP (month/year)
├── Results (space-y-3)
│   ├── CARD-PROVIDER-COMPARISON (Cloudflare)
│   ├── CARD-PROVIDER-COMPARISON (AWS)
│   └── CARD-PROVIDER-COMPARISON (GCP)
├── Use Cases (LAYOUT-GRID-3 + CARD-USE-CASE)
└── CALC-PRICING-TABLE
```

### 4.2 Spacing Between Sections

| Context | Spacing | Tailwind |
|---------|---------|----------|
| Between major sections | 48-80px | `py-12` to `py-20` |
| Between cards in grid | 16-24px | `gap-4` to `gap-6` |
| Inside cards | 24px | `p-6` |
| Between form fields | 24px | `gap-6` |
| Between label and input | 8px | `mb-2` |
| Between heading and paragraph | 8-12px | `mb-2` to `mb-3` |

### 4.3 Visual Hierarchy Rules

1. **One primary CTA per section** — use `BTN-PRIMARY` (orange background or cream on orange)
2. **Secondary actions** use `BTN-GHOST` or `BTN-OUTLINE`
3. **Links** use orange text (`text-[#FF4801]`) with hover underline
4. **Headings** use `font-medium` (500 weight), never bold
5. **Body text** uses 60% opacity for secondary content
6. **Monospace** for numbers, code, and technical values

### 4.4 Color Usage Guidelines

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Page background | `#FFFBF5` | `#121212` |
| Card background | `#FFFDFB` | `#191817` |
| Hover background | `#FEF7ED` | `#2A2927` |
| Primary text | `#521000` | `#F0E3DE` |
| Secondary text | `rgba(82,16,0,0.6)` | `rgba(255,253,251,0.56)` |
| Accent (interactive) | `#FF4801` | `#F14602` |
| Borders | `#EBD5C1` | `rgba(240,227,222,0.13)` |

**Never use:**
- Pure white (`#FFFFFF`) for backgrounds
- Pure black (`#000000`) for text
- Blue for links (use orange `#FF4801`)
- Gray for backgrounds (use warm cream tones)

---

## 5. Common Mistakes & Corrections

### 5.1 Color Errors

| Mistake | Correction |
|---------|------------|
| Using `#FF6600` for accent | Use `#FF4801` |
| Using `#FFFFFF` for background | Use `#FFFBF5` (warm cream) |
| Using `#000000` for text | Use `#521000` (warm brown) |
| Using gray borders | Use `#EBD5C1` (warm tan) |
| Using blue for links | Use `#FF4801` (orange) |

### 5.2 Typography Errors

| Mistake | Correction |
|---------|------------|
| Using `font-bold` (700) | Use `font-medium` (500) for headings |
| Using system fonts | Use `FT Kunst Grotesk` for body |
| Using serif fonts | Always use sans-serif |
| Using blue underlines | Use orange `#FF4801` or no underline |

### 5.3 Spacing Errors

| Mistake | Correction |
|---------|------------|
| Inconsistent padding | Use 4px base unit (8, 12, 16, 24, 32, 48) |
| Too tight card padding | Use minimum 24px (`p-6`) |
| Too small touch targets | Buttons minimum 44px height |

### 5.4 Component Errors

| Mistake | Correction |
|---------|------------|
| Square buttons | Always use `rounded-full` for buttons |
| Missing corner brackets | Add 8px corner decorations to cards |
| Solid borders on hover | Use `border-dashed` for hover states |
| Missing focus states | Add `focus:ring-2 focus:ring-[#FF4801]/20` |

---

## 6. Quality Checklist

Before finalizing any output, verify:

### 6.1 Brand Compliance

- [ ] Background is warm cream (`#FFFBF5`), not pure white
- [ ] Text is warm brown (`#521000`), not pure black
- [ ] Accent color is correct orange (`#FF4801`)
- [ ] Borders use warm tan (`#EBD5C1`)
- [ ] Font family is FT Kunst Grotesk (or fallback sans-serif)
- [ ] Headings use `font-medium` (500), not bold

### 6.2 Component Compliance

- [ ] Buttons are fully rounded (`rounded-full`)
- [ ] Cards have corner bracket decorations
- [ ] Inputs have proper focus states (orange ring)
- [ ] Links are orange with hover underline
- [ ] Icons are 20px or 24px size

### 6.3 Accessibility Check

- [ ] All images have `alt` attributes
- [ ] Form inputs have associated `<label>` elements
- [ ] Buttons have descriptive text or `aria-label`
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Focus states are visible
- [ ] Interactive elements are keyboard accessible

### 6.4 Responsive Check

- [ ] Layout stacks properly on mobile
- [ ] Text is readable at all sizes
- [ ] Touch targets are minimum 44px
- [ ] Horizontal scroll is avoided
- [ ] Images scale appropriately

### 6.5 Dark Mode Check (if applicable)

- [ ] All color tokens switch correctly
- [ ] Contrast is maintained
- [ ] Shadows adjust for dark backgrounds
- [ ] No hard-coded light mode colors

---

## 7. Example Conversations

### Example 1: Building a Calculator

**User:** Build me a bandwidth calculator that estimates costs based on data transfer.

**Assistant:** I'll create a bandwidth calculator using the Cloudflare design system. Based on the R2 calculator patterns, I'll include:

1. Input fields for:
   - Monthly data transfer (with GB/TB selector)
   - Average file size
   - Requests per month

2. Output showing:
   - Cost comparison between Cloudflare, AWS, and GCP
   - Progress bars visualizing relative costs
   - Monthly/yearly toggle

3. Use case presets for common scenarios

Let me build this using the CALC-LAYOUT and FORM-INPUT-WITH-UNIT components from SNIPPETS.md...

[Proceeds to build calculator with correct design system tokens]

### Example 2: Creating Feature Cards

**User:** Create 3 feature cards for a serverless platform.

**Assistant:** I'll create 3 feature cards using the CARD-FEATURE pattern from the Cloudflare design system:

```jsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* Card 1 - using CARD-FEATURE pattern */}
  <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] rounded-xl p-6 transition-all duration-200 hover:bg-[#FEF7ED]">
    {/* Corner brackets */}
    <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
    {/* ... other corners ... */}
    
    <div className="w-10 h-10 rounded-lg bg-[#FF4801]/10 flex items-center justify-center mb-4">
      <svg className="w-5 h-5 text-[#FF4801]">...</svg>
    </div>
    <h3 className="text-base font-medium text-[#521000] mb-2">Zero Cold Starts</h3>
    <p className="text-sm text-[#521000]/60">Your code is always warm and ready to execute in milliseconds.</p>
  </div>
  
  {/* Cards 2 and 3 follow same pattern */}
</div>
```

[Continues with remaining cards using correct colors, spacing, and decorations]

---

## 8. Quick Reference Card

Print this or keep it handy:

```
╔══════════════════════════════════════════════════════╗
║           CLOUDFLARE DESIGN QUICK REFERENCE          ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  COLORS                                              ║
║  ───────                                             ║
║  Orange:      #FF4801                                ║
║  Background:  #FFFBF5 (cream)                        ║
║  Text:        #521000 (brown)                        ║
║  Border:      #EBD5C1 (tan)                          ║
║  Muted text:  rgba(82,16,0,0.6)                      ║
║                                                      ║
║  TYPOGRAPHY                                          ║
║  ──────────                                          ║
║  Sans:  "FT Kunst Grotesk", sans-serif              ║
║  Mono:  "Apercu Mono Pro", monospace                ║
║  Headings: font-medium (500)                         ║
║                                                      ║
║  SPACING (4px base)                                  ║
║  ─────────────────                                   ║
║  8px  12px  16px  24px  32px  48px  64px            ║
║                                                      ║
║  BORDER RADIUS                                       ║
║  ─────────────                                       ║
║  Buttons: 9999px (full)                              ║
║  Cards:   12px                                       ║
║  Inputs:  8px                                        ║
║                                                      ║
║  KEY PATTERNS                                        ║
║  ────────────                                        ║
║  • Corner brackets: 8px squares on card corners     ║
║  • Hover borders: dashed style                       ║
║  • Focus rings: 0 0 0 3px rgba(255,72,1,0.2)        ║
║  • Buttons: always rounded-full                      ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

---

*This guide is designed to help AI agents produce consistent, on-brand Cloudflare-style interfaces. For complete token values, see CF-WORKERS-DESIGN.md. For component code, see SNIPPETS.md.*



# ===== EXAMPLES.md =====

# CF Workers Design - Full Examples

> **Complete, working templates** demonstrating the design system in action.
> Copy these as starting points for your projects.

---

## Table of Contents

1. [Pricing Calculator (R2-style)](#1-pricing-calculator)
2. [Landing Page](#2-landing-page)
3. [Interactive Tool](#3-interactive-tool)

---

# 1. Pricing Calculator

A complete pricing calculator based on r2-calculator.cloudflare.com patterns.

## React + Tailwind Version

```jsx
import { useState, useEffect } from 'react';

// Pricing constants
const PRICING = {
  cloudflare: {
    storage: 0.015,      // per GB/month
    classA: 4.50,        // per million
    classB: 0.36,        // per million
    egress: 0,           // FREE
    freeStorage: 10,     // GB
    freeClassA: 1,       // million
    freeClassB: 10,      // million
  },
  aws: {
    storage: 0.023,
    classA: 5.00,
    classB: 0.40,
    egress: 0.09,        // per GB
  },
  gcp: {
    storage: 0.020,
    classA: 5.00,
    classB: 0.40,
    egress: 0.12,        // per GB
  }
};

// Use case presets
const USE_CASES = [
  { name: 'AI/ML Training', icon: '🧪', storage: 100, unit: 'TB', writes: 10000000, egressPercent: 25, reads: 50000000 },
  { name: 'Data Analytics', icon: '📊', storage: 50, unit: 'TB', writes: 5000000, egressPercent: 50, reads: 100000000 },
  { name: 'Media Delivery', icon: '🎬', storage: 10, unit: 'TB', writes: 1000000, egressPercent: 200, reads: 500000000 },
];

function formatNumber(num) {
  return num.toLocaleString('en-US');
}

function formatCurrency(num) {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNumber(str) {
  return Number(str.replace(/,/g, '')) || 0;
}

function convertToGB(value, unit) {
  switch (unit) {
    case 'TB': return value * 1000;
    case 'PB': return value * 1000000;
    default: return value;
  }
}

export default function PricingCalculator() {
  const [storage, setStorage] = useState('10');
  const [storageUnit, setStorageUnit] = useState('TB');
  const [writes, setWrites] = useState('5,000,000');
  const [egressPercent, setEgressPercent] = useState(75);
  const [reads, setReads] = useState('25,000,000');
  const [period, setPeriod] = useState('month');
  const [costs, setCosts] = useState({ cloudflare: 0, aws: 0, gcp: 0 });

  // Calculate costs whenever inputs change
  useEffect(() => {
    const storageGB = convertToGB(parseNumber(storage), storageUnit);
    const writesNum = parseNumber(writes);
    const readsNum = parseNumber(reads);
    const egressGB = storageGB * (egressPercent / 100);

    // Cloudflare R2 (with free tier)
    const cfStorage = Math.max(0, storageGB - PRICING.cloudflare.freeStorage) * PRICING.cloudflare.storage;
    const cfClassA = Math.max(0, writesNum / 1000000 - PRICING.cloudflare.freeClassA) * PRICING.cloudflare.classA;
    const cfClassB = Math.max(0, readsNum / 1000000 - PRICING.cloudflare.freeClassB) * PRICING.cloudflare.classB;
    const cfEgress = 0; // Always free
    const cfTotal = cfStorage + cfClassA + cfClassB + cfEgress;

    // AWS S3
    const awsStorage = storageGB * PRICING.aws.storage;
    const awsClassA = (writesNum / 1000000) * PRICING.aws.classA;
    const awsClassB = (readsNum / 1000000) * PRICING.aws.classB;
    const awsEgress = egressGB * PRICING.aws.egress;
    const awsTotal = awsStorage + awsClassA + awsClassB + awsEgress;

    // Google Cloud Storage
    const gcpStorage = storageGB * PRICING.gcp.storage;
    const gcpClassA = (writesNum / 1000000) * PRICING.gcp.classA;
    const gcpClassB = (readsNum / 1000000) * PRICING.gcp.classB;
    const gcpEgress = egressGB * PRICING.gcp.egress;
    const gcpTotal = gcpStorage + gcpClassA + gcpClassB + gcpEgress;

    const multiplier = period === 'year' ? 12 : 1;

    setCosts({
      cloudflare: cfTotal * multiplier,
      aws: awsTotal * multiplier,
      gcp: gcpTotal * multiplier,
    });
  }, [storage, storageUnit, writes, egressPercent, reads, period]);

  const maxCost = Math.max(costs.cloudflare, costs.aws, costs.gcp, 1);

  const applyUseCase = (useCase) => {
    setStorage(String(useCase.storage));
    setStorageUnit(useCase.unit);
    setWrites(formatNumber(useCase.writes));
    setEgressPercent(useCase.egressPercent);
    setReads(formatNumber(useCase.reads));
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b border-[#EBD5C1] bg-[#FFFBF5]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2">
            <svg className="h-7 text-[#FF4801]" viewBox="0 0 66 30" fill="currentColor">
              <path d="M52.688 13.028c-.22 0-.437.008-.654.015a.3.3 0 0 0-.102.024.37.37 0 0 0-.236.255l-.93 3.249c-.401 1.397-.252 2.687.422 3.634.618.876 1.646 1.39 2.894 1.45l5.045.306a.45.45 0 0 1 .435.41.5.5 0 0 1-.025.223.64.64 0 0 1-.547.426l-5.242.306c-2.848.132-5.912 2.456-6.987 5.29l-.378 1a.28.28 0 0 0 .248.382h18.054a.48.48 0 0 0 .464-.35c.32-1.153.482-2.344.48-3.54 0-7.22-5.79-13.072-12.933-13.072M44.807 29.578l.334-1.175c.402-1.397.253-2.687-.42-3.634-.62-.876-1.647-1.39-2.896-1.45l-23.665-.306a.47.47 0 0 1-.374-.199.5.5 0 0 1-.052-.434.64.64 0 0 1 .552-.426l23.886-.306c2.836-.131 5.9-2.456 6.975-5.29l1.362-3.6a.9.9 0 0 0 .04-.477C48.997 5.259 42.789 0 35.367 0c-6.842 0-12.647 4.462-14.73 10.665a6.92 6.92 0 0 0-4.911-1.374c-3.28.33-5.92 3.002-6.246 6.318a7.2 7.2 0 0 0 .18 2.472C4.3 18.241 0 22.679 0 28.133q0 .74.106 1.453a.46.46 0 0 0 .457.402h43.704a.57.57 0 0 0 .54-.418" />
            </svg>
            <div className="hidden lg:flex flex-col -mb-1">
              <span className="text-[9px] font-medium text-[#521000] uppercase">Cloudflare</span>
              <span className="text-[23px] font-medium text-[#521000]" style={{ letterSpacing: '-0.46px' }}>Workers Platform</span>
            </div>
          </a>
          <div className="flex gap-3">
            <a href="#" className="hidden sm:block px-6 py-3 rounded-full font-medium text-sm border border-[#EBD5C1] text-[#FF4801] hover:border-dashed transition-all">
              View docs
            </a>
            <a href="#" className="px-6 py-3 rounded-full font-medium text-sm bg-[#FF4801] text-white hover:opacity-95 transition-all">
              Get started with R2
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-8 sm:pt-12 max-w-5xl mx-auto px-6 sm:px-8">
        <h1 className="font-medium text-2xl sm:text-3xl text-[#521000] mb-3" style={{ letterSpacing: '-0.035em' }}>
          R2 Pricing Calculator
        </h1>
        <p className="text-sm sm:text-base text-[#521000]/60 leading-relaxed">
          Cloudflare R2 Object Storage is S3-compatible and allows developers to store large amounts of unstructured data without the costly egress bandwidth fees.
        </p>
        <p className="text-sm sm:text-base text-[#521000] font-medium mt-3">
          Enter your expected usage to estimate your monthly cost.
        </p>
      </section>

      {/* Calculator */}
      <main className="max-w-5xl mx-auto px-6 sm:px-8 mt-8">
        <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 sm:p-8">
          {/* Corner brackets */}
          <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
          <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />

          {/* Form */}
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Storage input */}
              <div className="flex flex-col">
                <label className="mb-2 text-base font-medium text-[#521000]">
                  How much data will you store?
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className="flex-1 border border-[#EBD5C1] bg-[#FFFDFB] text-[#521000] text-sm rounded-lg p-3 text-right focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
                  />
                  <div className="relative ml-2">
                    <select
                      value={storageUnit}
                      onChange={(e) => setStorageUnit(e.target.value)}
                      className="appearance-none pl-3 pr-8 py-3 text-sm text-[#521000] bg-[#FEF7ED] border border-[#EBD5C1] rounded-lg cursor-pointer focus:border-[#FF4801] outline-none"
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

              {/* Writes input */}
              <div className="flex flex-col">
                <label className="mb-2 text-base font-medium text-[#521000]">
                  How many writes per month?
                </label>
                <input
                  type="text"
                  value={writes}
                  onChange={(e) => setWrites(e.target.value)}
                  className="border border-[#EBD5C1] bg-[#FFFDFB] text-[#521000] text-sm rounded-lg p-3 text-right focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
                />
              </div>

              {/* Egress slider */}
              <div className="flex flex-col">
                <label className="mb-2 text-base font-medium text-[#521000]">
                  What % of data downloaded monthly?
                </label>
                <div className="pt-8 relative">
                  <input
                    type="range"
                    min="0"
                    max="500"
                    value={egressPercent}
                    onChange={(e) => setEgressPercent(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #FF4801 ${egressPercent / 5}%, #EBD5C1 ${egressPercent / 5}%)`
                    }}
                  />
                  <div
                    className="absolute -top-1 text-xs font-medium text-[#FF4801] bg-[#FF4801]/10 px-2 py-1 rounded-full"
                    style={{ left: `calc(${egressPercent / 5}% - 20px)` }}
                  >
                    {egressPercent}%
                  </div>
                  <div className="flex justify-between pt-2 text-xs text-[#521000]/60">
                    <span>0%</span>
                    <span>500%</span>
                  </div>
                </div>
              </div>

              {/* Reads input */}
              <div className="flex flex-col">
                <label className="mb-2 text-base font-medium text-[#521000]">
                  How many reads per month?
                </label>
                <input
                  type="text"
                  value={reads}
                  onChange={(e) => setReads(e.target.value)}
                  className="border border-[#EBD5C1] bg-[#FFFDFB] text-[#521000] text-sm rounded-lg p-3 text-right focus:border-[#FF4801] focus:ring-1 focus:ring-[#FF4801] outline-none"
                />
              </div>
            </div>
          </form>

          {/* Period toggle */}
          <div className="flex justify-end mt-6 mb-4">
            <div className="inline-flex rounded-full border border-[#EBD5C1] overflow-hidden">
              <button
                type="button"
                onClick={() => setPeriod('month')}
                className={`px-4 py-2 text-sm font-medium transition-all ${
                  period === 'month' ? 'bg-[#FF4801] text-white' : 'bg-[#FFFDFB] text-[#521000] hover:bg-[#FEF7ED]'
                }`}
              >
                month
              </button>
              <button
                type="button"
                onClick={() => setPeriod('year')}
                className={`px-4 py-2 text-sm font-medium transition-all ${
                  period === 'year' ? 'bg-[#FF4801] text-white' : 'bg-[#FFFDFB] text-[#521000] hover:bg-[#FEF7ED]'
                }`}
              >
                year
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            {/* Cloudflare R2 */}
            <div className="bg-[#FFFDFB] border border-[#EBD5C1] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-[#FF4801] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">R2</span>
                  </div>
                  <span className="font-medium text-[#521000]">Cloudflare R2</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-medium text-[#521000]">${formatCurrency(costs.cloudflare)}</span>
                  <span className="text-sm text-[#521000]/60">/{period === 'year' ? 'yr' : 'mo'}</span>
                </div>
              </div>
              <div className="h-3 bg-[#EBD5C1]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF4801] rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, (costs.cloudflare / maxCost) * 100)}%` }}
                />
              </div>
            </div>

            {/* AWS S3 */}
            <div className="bg-[#FFFDFB] border border-[#EBD5C1] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-[#FF9900] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">S3</span>
                  </div>
                  <span className="font-medium text-[#521000]">Amazon S3</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-medium text-[#521000]">${formatCurrency(costs.aws)}</span>
                  <span className="text-sm text-[#521000]/60">/{period === 'year' ? 'yr' : 'mo'}</span>
                </div>
              </div>
              <div className="h-3 bg-[#EBD5C1]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF9900] rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, (costs.aws / maxCost) * 100)}%` }}
                />
              </div>
            </div>

            {/* GCP */}
            <div className="bg-[#FFFDFB] border border-[#EBD5C1] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-[#4285F4] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">GC</span>
                  </div>
                  <span className="font-medium text-[#521000]">Google Cloud Storage</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-medium text-[#521000]">${formatCurrency(costs.gcp)}</span>
                  <span className="text-sm text-[#521000]/60">/{period === 'year' ? 'yr' : 'mo'}</span>
                </div>
              </div>
              <div className="h-3 bg-[#EBD5C1]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4285F4] rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, (costs.gcp / maxCost) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Use case presets */}
          <div className="mt-6 pt-6 border-t border-[#EBD5C1]/50">
            <p className="text-sm text-[#521000]/60 mb-3">Try a use case</p>
            <div className="grid grid-cols-3 gap-3">
              {USE_CASES.map((useCase) => (
                <button
                  key={useCase.name}
                  type="button"
                  onClick={() => applyUseCase(useCase)}
                  className="flex flex-col items-center p-4 border border-[#EBD5C1] bg-[#FFFDFB] text-center hover:border-dashed hover:border-[#FF4801] transition-all"
                >
                  <span className="text-lg mb-2">{useCase.icon}</span>
                  <span className="text-sm font-medium text-[#521000]">{useCase.name}</span>
                  <span className="text-xs text-[#521000]/60 mt-0.5">{useCase.storage}{useCase.unit}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing table */}
        <div className="bg-[#FFFDFB] border border-[#EBD5C1] p-6 mt-8">
          <h2 className="font-medium text-lg text-[#521000] mb-2">Pricing Details</h2>
          <p className="text-sm text-[#521000]/60 mb-6">
            R2 charges based on storage and operations. You pay zero egress fees.{' '}
            <a href="#" className="text-[#FF4801] underline hover:text-[#FF4801]/80">View docs</a>
          </p>
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
                <td className="py-3 pl-4">$0.015 / GB</td>
              </tr>
              <tr className="border-b border-[#EBD5C1]/50">
                <td className="py-3 pr-4 font-medium text-[#521000]">Class A (writes)</td>
                <td className="py-3 px-4">1 million / month</td>
                <td className="py-3 pl-4">$4.50 / million</td>
              </tr>
              <tr className="border-b border-[#EBD5C1]/50">
                <td className="py-3 pr-4 font-medium text-[#521000]">Class B (reads)</td>
                <td className="py-3 px-4">10 million / month</td>
                <td className="py-3 pl-4">$0.36 / million</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-[#521000]">Egress</td>
                <td className="py-3 px-4">Free</td>
                <td className="py-3 pl-4">Free</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-[#EBD5C1]">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 flex flex-wrap gap-4 text-xs text-[#521000]/60">
          <span>© 2024 Cloudflare, Inc.</span>
          <a href="#" className="hover:text-[#521000]">Privacy</a>
          <a href="#" className="hover:text-[#521000]">Terms</a>
        </div>
      </footer>

      {/* Custom slider styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
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
      `}</style>
    </div>
  );
}
```

---

# 2. Landing Page

A complete marketing landing page template.

## React + Tailwind Version

```jsx
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b border-[#EBD5C1] bg-[#FFFBF5] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2">
            <svg className="h-8 text-[#FF4801]" viewBox="0 0 66 30" fill="currentColor">
              <path d="M52.688 13.028c-.22 0-.437.008-.654.015a.3.3 0 0 0-.102.024.37.37 0 0 0-.236.255l-.93 3.249c-.401 1.397-.252 2.687.422 3.634.618.876 1.646 1.39 2.894 1.45l5.045.306a.45.45 0 0 1 .435.41.5.5 0 0 1-.025.223.64.64 0 0 1-.547.426l-5.242.306c-2.848.132-5.912 2.456-6.987 5.29l-.378 1a.28.28 0 0 0 .248.382h18.054a.48.48 0 0 0 .464-.35c.32-1.153.482-2.344.48-3.54 0-7.22-5.79-13.072-12.933-13.072M44.807 29.578l.334-1.175c.402-1.397.253-2.687-.42-3.634-.62-.876-1.647-1.39-2.896-1.45l-23.665-.306a.47.47 0 0 1-.374-.199.5.5 0 0 1-.052-.434.64.64 0 0 1 .552-.426l23.886-.306c2.836-.131 5.9-2.456 6.975-5.29l1.362-3.6a.9.9 0 0 0 .04-.477C48.997 5.259 42.789 0 35.367 0c-6.842 0-12.647 4.462-14.73 10.665a6.92 6.92 0 0 0-4.911-1.374c-3.28.33-5.92 3.002-6.246 6.318a7.2 7.2 0 0 0 .18 2.472C4.3 18.241 0 22.679 0 28.133q0 .74.106 1.453a.46.46 0 0 0 .457.402h43.704a.57.57 0 0 0 .54-.418" />
            </svg>
            <span className="text-xl font-medium text-[#521000]">Workers</span>
          </a>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-[#521000]/70 hover:text-[#521000]">Features</a>
            <a href="#pricing" className="text-sm text-[#521000]/70 hover:text-[#521000]">Pricing</a>
            <a href="#docs" className="text-sm text-[#521000]/70 hover:text-[#521000]">Docs</a>
          </nav>
          <div className="flex gap-3">
            <a href="/login" className="hidden sm:inline-flex px-5 py-2.5 rounded-full text-sm font-medium text-[#FF4801] border border-[#EBD5C1] hover:border-dashed transition-all">
              Log in
            </a>
            <a href="/signup" className="px-5 py-2.5 rounded-full text-sm font-medium bg-[#FF4801] text-white hover:opacity-95 transition-all">
              Start building
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 sm:py-24 bg-[#FF4801] relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-white mb-6" style={{ letterSpacing: '-0.02em' }}>
            Build full-stack applications<br />at the edge
          </h1>
          <p className="text-lg text-white/75 max-w-2xl mx-auto mb-8">
            Deploy serverless code instantly across the globe for exceptional performance, reliability, and scale. No cold starts, no configuration.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="/signup" className="px-8 py-3.5 rounded-full font-medium bg-white text-[#FF4801] hover:opacity-95 transition-all">
              Start building for free
            </a>
            <a href="/docs" className="px-8 py-3.5 rounded-full font-medium text-white border border-white/40 hover:bg-white/10 transition-all">
              Read the docs
            </a>
          </div>
        </div>
        {/* Dot pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#521000] mb-4">
              Everything you need to build
            </h2>
            <p className="text-[#521000]/60 max-w-2xl mx-auto">
              From compute to storage to AI — all the primitives you need, integrated and ready to use.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 hover:bg-[#FEF7ED] transition-all">
              <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              
              <div className="w-12 h-12 rounded-lg bg-[#0A95FF]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#0A95FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[#521000] mb-2">Workers</h3>
              <p className="text-sm text-[#521000]/60 leading-relaxed">
                Deploy serverless functions at the edge. Zero cold starts, automatic scaling, 300+ locations worldwide.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 hover:bg-[#FEF7ED] transition-all">
              <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              
              <div className="w-12 h-12 rounded-lg bg-[#EE0DDB]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#EE0DDB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[#521000] mb-2">R2 Storage</h3>
              <p className="text-sm text-[#521000]/60 leading-relaxed">
                S3-compatible object storage with zero egress fees. Store unlimited data without bandwidth costs.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6 hover:bg-[#FEF7ED] transition-all">
              <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
              
              <div className="w-12 h-12 rounded-lg bg-[#19E306]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#19E306]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[#521000] mb-2">Workers AI</h3>
              <p className="text-sm text-[#521000]/60 leading-relaxed">
                Run AI models at the edge. Access LLMs, image models, and more with simple APIs and pay-per-use pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-[#FEF7ED]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-medium text-[#FF4801] mb-2">300+</div>
              <div className="text-sm text-[#521000]/60 uppercase tracking-wider">Edge locations</div>
            </div>
            <div>
              <div className="text-4xl font-medium text-[#FF4801] mb-2">0ms</div>
              <div className="text-sm text-[#521000]/60 uppercase tracking-wider">Cold starts</div>
            </div>
            <div>
              <div className="text-4xl font-medium text-[#FF4801] mb-2">99.99%</div>
              <div className="text-sm text-[#521000]/60 uppercase tracking-wider">Uptime SLA</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-medium text-[#521000] mb-4">
            Ready to build something amazing?
          </h2>
          <p className="text-[#521000]/60 mb-8">
            Get started with our generous free tier. No credit card required.
          </p>
          <a href="/signup" className="inline-flex px-8 py-3.5 rounded-full font-medium bg-[#FF4801] text-white hover:opacity-95 transition-all">
            Start building for free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-[#EBD5C1]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap justify-between items-center gap-4">
          <div className="text-sm text-[#521000]/60">
            © 2024 Cloudflare, Inc.
          </div>
          <div className="flex gap-6 text-sm text-[#521000]/60">
            <a href="#" className="hover:text-[#521000]">Privacy</a>
            <a href="#" className="hover:text-[#521000]">Terms</a>
            <a href="#" className="hover:text-[#521000]">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

---

# 3. Interactive Tool

A generic configuration/tool template with split-panel layout.

## React + Tailwind Version

```jsx
import { useState } from 'react';

export default function ConfigTool() {
  const [config, setConfig] = useState({
    region: 'us-east',
    instances: 2,
    memory: 128,
    enableLogging: true,
    enableMetrics: false,
  });

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b border-[#EBD5C1] bg-[#FFFBF5]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-medium text-[#521000]">Worker Configuration</h1>
          <button className="px-5 py-2.5 rounded-full text-sm font-medium bg-[#FF4801] text-white hover:opacity-95 transition-all">
            Deploy
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6">
            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />

            <h2 className="text-lg font-medium text-[#521000] mb-6">Settings</h2>

            <div className="space-y-6">
              {/* Region select */}
              <div>
                <label className="block mb-2 text-sm font-medium text-[#521000]">Region</label>
                <div className="relative">
                  <select
                    value={config.region}
                    onChange={(e) => updateConfig('region', e.target.value)}
                    className="w-full appearance-none pl-4 pr-10 py-3 text-sm text-[#521000] bg-[#FFFDFB] border border-[#EBD5C1] rounded-lg cursor-pointer focus:border-[#FF4801] outline-none"
                  >
                    <option value="us-east">US East (Virginia)</option>
                    <option value="us-west">US West (Oregon)</option>
                    <option value="eu-west">EU West (Ireland)</option>
                    <option value="ap-south">Asia Pacific (Singapore)</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#521000]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Instances */}
              <div>
                <label className="block mb-2 text-sm font-medium text-[#521000]">Instances</label>
                <div className="flex items-center border border-[#EBD5C1] rounded-lg overflow-hidden">
                  <button
                    onClick={() => updateConfig('instances', Math.max(1, config.instances - 1))}
                    className="px-4 py-3 bg-[#FEF7ED] text-[#521000] hover:bg-[#EBD5C1] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="flex-1 text-center text-sm font-medium text-[#521000]">{config.instances}</span>
                  <button
                    onClick={() => updateConfig('instances', Math.min(10, config.instances + 1))}
                    className="px-4 py-3 bg-[#FEF7ED] text-[#521000] hover:bg-[#EBD5C1] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Memory slider */}
              <div>
                <label className="block mb-2 text-sm font-medium text-[#521000]">
                  Memory: <span className="text-[#FF4801]">{config.memory}MB</span>
                </label>
                <input
                  type="range"
                  min="128"
                  max="2048"
                  step="128"
                  value={config.memory}
                  onChange={(e) => updateConfig('memory', Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #FF4801 ${((config.memory - 128) / (2048 - 128)) * 100}%, #EBD5C1 ${((config.memory - 128) / (2048 - 128)) * 100}%)`
                  }}
                />
                <div className="flex justify-between mt-1 text-xs text-[#521000]/60">
                  <span>128MB</span>
                  <span>2048MB</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4 pt-4 border-t border-[#EBD5C1]/50">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-[#521000]">Enable logging</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={config.enableLogging}
                      onChange={(e) => updateConfig('enableLogging', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#EBD5C1] rounded-full peer peer-checked:bg-[#FF4801] transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                  </div>
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-[#521000]">Enable metrics</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={config.enableMetrics}
                      onChange={(e) => updateConfig('enableMetrics', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#EBD5C1] rounded-full peer peer-checked:bg-[#FF4801] transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="relative bg-[#FFFDFB] border border-[#EBD5C1] p-6">
            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -top-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-[#EBD5C1] rounded-[1.5px] bg-[#FFFBF5]" />

            <h2 className="text-lg font-medium text-[#521000] mb-6">Configuration Preview</h2>

            {/* Code preview */}
            <div className="bg-[#1a1209] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <span className="ml-2 text-xs text-white/50 font-mono">wrangler.toml</span>
              </div>
              <pre className="p-4 text-sm font-mono text-[#f5ede0] overflow-x-auto">
                <code>{`name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"

[placement]
mode = "smart"

[[services]]
binding = "MY_SERVICE"
service = "my-service"

# Generated configuration
[limits]
cpu_ms = 50

[observability]
enabled = ${config.enableLogging}

[observability.logs]
enabled = ${config.enableLogging}
invocation_logs = ${config.enableLogging}

# Region: ${config.region}
# Instances: ${config.instances}
# Memory: ${config.memory}MB
# Metrics: ${config.enableMetrics}`}</code>
              </pre>
            </div>

            {/* Estimated cost */}
            <div className="mt-6 p-4 bg-[#FF4801]/5 rounded-lg border border-[#FF4801]/20">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#521000]">Estimated monthly cost</span>
                <span className="text-lg font-medium text-[#FF4801]">
                  ${((config.instances * config.memory * 0.0001) + (config.enableLogging ? 5 : 0) + (config.enableMetrics ? 3 : 0)).toFixed(2)}/mo
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Custom styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: white;
          border: 2px solid #FF4801;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          cursor: grab;
        }
      `}</style>
    </div>
  );
}
```

---

## Usage Notes

### Customizing Templates

1. **Replace placeholder content** — Update headings, descriptions, and values
2. **Adjust calculations** — Modify pricing constants and formulas
3. **Add/remove sections** — Combine components from SNIPPETS.md
4. **Change colors** — Use product category colors for feature-specific tools

### Testing Checklist

Before deploying, verify:

- [ ] All interactive elements work (inputs, buttons, toggles)
- [ ] Calculations update in real-time
- [ ] Responsive layout works on mobile
- [ ] Focus states are visible
- [ ] Colors match the design system
- [ ] Corner brackets appear on cards

---

*These templates are based on workers.cloudflare.com, workershops.cloudflare.com, and r2-calculator.cloudflare.com.*



# ===== SKILLS.md =====

# CF Workers Design System - AI Skills & Commands

> **Quick-reference commands and skills for AI agents** to generate Cloudflare-style UI components, pages, and tools.

---

## Available Skills

### `/cf-design` - Design System Reference

Load the complete CF Workers design tokens and guidelines.

```
/cf-design
```

**Use when:** You need to reference colors, typography, spacing, animations, or any design token.

**Returns:** Core design system documentation including:
- Color palette (light/dark mode)
- Typography scale
- Spacing system
- Border radius values
- Shadow definitions
- Animation timing functions

---

### `/cf-component [name]` - Generate Component

Generate a specific component in the CF Workers style.

```
/cf-component button
/cf-component card
/cf-component input
/cf-component calculator
/cf-component hero
/cf-component nav
```

**Available components:**
| Component | Description |
|-----------|-------------|
| `button` | Primary, secondary, ghost, icon buttons |
| `card` | Basic, feature, pricing, stat cards |
| `input` | Text input, select, slider, toggle |
| `calculator` | Pricing calculator with comparison bars |
| `hero` | Landing page hero section |
| `nav` | Header navigation with mobile menu |
| `table` | Data table with CF styling |
| `badge` | Status badges and pills |
| `progress` | Progress bars |
| `tabs` | Tab navigation |

**Options:**
- `--react` - Generate React + Tailwind version (default)
- `--html` - Generate vanilla HTML + CSS version
- `--both` - Generate both versions

---

### `/cf-page [type]` - Generate Full Page

Generate a complete page template.

```
/cf-page landing
/cf-page calculator
/cf-page docs
/cf-page demo
```

**Page types:**
| Type | Description |
|------|-------------|
| `landing` | Product landing page with hero, features, CTA |
| `calculator` | Pricing calculator (R2-style) |
| `docs` | Documentation page with sidebar |
| `demo` | Interactive demo/playground |

---

### `/cf-tokens` - Export Design Tokens

Export design tokens in various formats.

```
/cf-tokens css
/cf-tokens tailwind
/cf-tokens json
/cf-tokens figma
```

**Formats:**
- `css` - CSS custom properties (`:root` block)
- `tailwind` - Tailwind config extension
- `json` - JSON token file
- `figma` - Figma-compatible token format

---

## Quick Commands

### Colors

```
/cf-color primary    → #FF4801
/cf-color background → #FFFBF5
/cf-color text       → #521000
/cf-color border     → #EBD5C1
/cf-color success    → #16A34A
/cf-color error      → #DC2626
```

### Typography

```
/cf-font sans   → "FT Kunst Grotesk", -apple-system, sans-serif
/cf-font mono   → "Apercu Mono Pro", monospace
/cf-size h1     → 32px, weight 500, tracking -0.02em
/cf-size body   → 16px, weight 400, line-height 1.5
```

### Spacing

```
/cf-space sm    → 8px
/cf-space md    → 16px
/cf-space lg    → 24px
/cf-space xl    → 32px
/cf-space section → 64px
```

### Radius

```
/cf-radius button → 9999px (full)
/cf-radius card   → 12px
/cf-radius input  → 8px
```

---

## Skill Definitions

### For OpenCode / Claude

Add this skill to your agent configuration:

```yaml
# ~/.config/opencode/skills/cf-design/SKILL.md
name: cf-design
description: Generate Cloudflare Workers-style UI components and pages
triggers:
  - /cf-design
  - /cf-component
  - /cf-page
  - /cf-tokens
resources:
  - https://cf-workers-design.nireka-96.workers.dev/CF-WORKERS-DESIGN.md
  - https://cf-workers-design.nireka-96.workers.dev/SNIPPETS.md
  - https://cf-workers-design.nireka-96.workers.dev/EXAMPLES.md
```

### System Prompt Addition

Add to your AI agent's system prompt:

```
## CF Workers Design System

When building UI for Cloudflare-related projects, use the CF Workers Design System:

### Core Design Rules
1. NEVER use pure white (#FFFFFF) - use warm cream (#FFFBF5)
2. NEVER use pure black (#000000) - use warm brown (#521000)
3. Buttons are ALWAYS fully rounded (border-radius: 9999px)
4. Primary accent is orange (#FF4801)
5. Use corner bracket decorations on cards (8px squares at corners)

### Quick Reference
- Background: #FFFBF5
- Text: #521000
- Orange: #FF4801
- Border: #EBD5C1
- Font: "FT Kunst Grotesk" or system sans-serif

### Resources
- Design Tokens: https://cf-workers-design.nireka-96.workers.dev/CF-WORKERS-DESIGN.md
- Components: https://cf-workers-design.nireka-96.workers.dev/SNIPPETS.md
- Examples: https://cf-workers-design.nireka-96.workers.dev/EXAMPLES.md
```

---

## Usage Examples

### Example 1: Create a Button

**Prompt:**
```
/cf-component button --react
```

**Output:**
```tsx
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  className, 
  children,
  ...props 
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium transition-all',
        'active:scale-[0.98] active:translate-y-[1px]',
        {
          'bg-[#FFFBF5] text-[#FF4801] border border-[#FFFBF5] hover:border-dashed': variant === 'primary',
          'bg-[#FF4801] text-white hover:opacity-95': variant === 'secondary',
          'bg-transparent text-[#FF4801] border border-[#EBD5C1] hover:border-dashed': variant === 'ghost',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-6 py-3 text-base': size === 'md',
          'px-8 py-4 text-lg': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

### Example 2: Create a Pricing Calculator

**Prompt:**
```
/cf-page calculator
```

**Output:** Full R2-style pricing calculator with:
- Input fields for storage, operations, egress
- Slider for usage percentage
- Comparison bars (Cloudflare vs AWS vs GCP)
- Corner bracket decorations
- Responsive layout

### Example 3: Get All CSS Variables

**Prompt:**
```
/cf-tokens css
```

**Output:**
```css
:root {
  --cf-orange: #FF4801;
  --cf-orange-hover: #FF7038;
  --cf-text: #521000;
  --cf-text-muted: rgba(82, 16, 0, 0.7);
  --cf-bg-page: #FFFBF5;
  --cf-bg-card: #FFFDFB;
  --cf-border: #EBD5C1;
  /* ... */
}
```

---

## Integration with MCP

For Model Context Protocol (MCP) integration:

```json
{
  "name": "cf-workers-design",
  "description": "Cloudflare Workers Design System",
  "tools": [
    {
      "name": "get_design_tokens",
      "description": "Get CF Workers design tokens (colors, typography, spacing)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "enum": ["colors", "typography", "spacing", "shadows", "animations", "all"]
          }
        }
      }
    },
    {
      "name": "generate_component",
      "description": "Generate a UI component in CF Workers style",
      "inputSchema": {
        "type": "object",
        "properties": {
          "component": {
            "type": "string",
            "enum": ["button", "card", "input", "calculator", "hero", "nav", "table", "badge"]
          },
          "format": {
            "type": "string",
            "enum": ["react", "html", "both"],
            "default": "react"
          }
        },
        "required": ["component"]
      }
    },
    {
      "name": "generate_page",
      "description": "Generate a full page template",
      "inputSchema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["landing", "calculator", "docs", "demo"]
          }
        },
        "required": ["type"]
      }
    }
  ],
  "resources": [
    {
      "uri": "cf-design://tokens",
      "name": "Design Tokens",
      "mimeType": "text/markdown"
    },
    {
      "uri": "cf-design://snippets",
      "name": "Component Snippets",
      "mimeType": "text/markdown"
    },
    {
      "uri": "cf-design://examples",
      "name": "Full Examples",
      "mimeType": "text/markdown"
    }
  ]
}
```

---

## Cheat Sheet

### Must-Have Styles

```css
/* Warm background - NEVER pure white */
background-color: #FFFBF5;

/* Warm text - NEVER pure black */
color: #521000;

/* Orange accent */
color: #FF4801;

/* Rounded buttons */
border-radius: 9999px;

/* Card corners */
border: 1px solid #EBD5C1;

/* Hover: dashed border */
border-style: dashed;

/* Button press */
transform: translateY(1px);
scale: 0.98;
```

### Don't Do This

```css
/* ❌ Pure white background */
background-color: #FFFFFF;

/* ❌ Pure black text */
color: #000000;

/* ❌ Square buttons */
border-radius: 4px;

/* ❌ Blue accent (unless product-specific) */
color: #0066FF;

/* ❌ Heavy shadows */
box-shadow: 0 10px 40px rgba(0,0,0,0.3);
```

---

## Resources

- **Live Docs**: https://cf-workers-design.nireka-96.workers.dev
- **Design Tokens**: [CF-WORKERS-DESIGN.md](./CF-WORKERS-DESIGN.md)
- **Components**: [SNIPPETS.md](./SNIPPETS.md)
- **AI Guide**: [PROMPTING-GUIDE.md](./PROMPTING-GUIDE.md)
- **Examples**: [EXAMPLES.md](./EXAMPLES.md)
- **GitLab**: https://gitlab.cfdata.org/ndalwadi/cf-workers-design

---

*Use these skills to quickly generate on-brand Cloudflare interfaces without memorizing the entire design system.*
