# DESIGN.md — VibeSDK Visual System

**Owner:** @UI/UX
**References:** emergent.sh (pre-login), app.emergent.sh (post-login), manus.im (agent UX)
**Skill invoked:** `ui-ux-pro-max`, `design:design-system`

---

## 1. Brand Tokens

### Color (dark-first, light-optional)

```css
/* PRIMITIVE */
--brand-ink:        #0A0B0F;   /* page bg, deepest */
--brand-surface:    #14161C;   /* card bg */
--brand-surface-2:  #1C1F27;   /* raised card */
--brand-border:     #262A34;
--brand-border-hi:  #3A3F4C;

--accent-primary:   #F38020;   /* Cloudflare orange — keep heritage */
--accent-secondary: #6366F1;   /* indigo — AI agent accent */
--accent-success:   #10B981;
--accent-warn:      #F59E0B;
--accent-error:     #EF4444;

--text-primary:     #F5F6F8;
--text-secondary:   #A1A6B2;
--text-tertiary:    #6B7280;

/* SEMANTIC */
--bg-app:           var(--brand-ink);
--bg-chat:          var(--brand-surface);
--bg-plan-pane:     var(--brand-surface-2);
--bg-preview:       #FFFFFF;         /* preview always light */
```

### Typography

```
Display:  Inter Display, 600/700, -0.02em, tight
Body:     Inter, 400/500, -0.005em
Mono:     JetBrains Mono, 400, 0.9em

Scale (rem):
  xs   0.75   sm 0.875   base 1.0
  lg   1.125  xl 1.25    2xl 1.5
  3xl  1.875  4xl 2.25   5xl 3.0
  6xl  3.75   hero 5.0
```

### Spacing + Radius + Shadow

```
Space: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
Radius: sm 6 / md 10 / lg 14 / xl 20 / full 9999
Shadow-card:    0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)
Shadow-hover:   0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 36px rgba(0,0,0,0.4)
Shadow-glow:    0 0 0 1px var(--accent-primary), 0 8px 32px rgba(243,128,32,0.25)
```

### Motion

```
Ease-out:   cubic-bezier(0.22, 0.61, 0.36, 1)
Ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
Duration:   fast 120ms / base 200ms / slow 320ms / page 480ms
```

---

## 2. Post-Login App Layout (like app.emergent.sh)

```
┌──────────────────────────────────────────────────────────────────┐
│  Sidebar (240)  │  Main canvas                                    │
│                 │  ┌──────────────────────────┬──────────────┐    │
│  [Logo]         │  │ Plan tree (320)          │ Preview      │    │
│  [+ New]        │  │ ┌ milestone ▼           │              │    │
│                 │  │ │ ├ task (● running)    │   iframe     │    │
│  — Recent —     │  │ │ └ task (✓ done)      │              │    │
│  project A      │  │ │ agents: P C T K       │              │    │
│  project B      │  ├──┴──────────────────────┼──────────────┤    │
│                 │  │ Chat/Prompt (flex)       │ File tree    │    │
│  — Library —    │  │ > your prompt here       │ src/         │    │
│  Templates      │  │ [TeamLead: planning...]  │ └ App.tsx    │    │
│  Integrations   │  │                          │              │    │
│                 │  │ [input ────────── ↵ ]    │              │    │
│  [Settings]     │  └──────────────────────────┴──────────────┘    │
│  [Usage 43/100] │                                                 │
└─────────────────┴─────────────────────────────────────────────────┘
```

**Panes (resizable via react-resizable-panels):**

| Pane        | Default W | Min  | Role                            |
|-------------|-----------|------|---------------------------------|
| Sidebar     | 240       | 60   | nav, projects, usage            |
| Plan tree   | 320       | 240  | live agent plan + statuses      |
| Chat        | flex      | 400  | prompt + TeamLead log           |
| Preview     | 560       | 320  | iframe sandbox                  |
| File tree   | 240       | 180  | read-only, collapsible          |

### Agent Status Chips (Manus-style)

```
┌─────────────────────────────────────┐
│ 🧠 TeamLead   ● thinking   00:04   │
│ 📋 Planner    ✓ done       00:02   │
│ ⚡ Coder-1    ● writing    00:01   │
│ ⚡ Coder-2    ● writing    00:01   │
│ 🧪 Tester     ⏸ queued     —       │
│ 🛡 Critic     ⏸ pending    —       │
└─────────────────────────────────────┘
```

Each chip: click → expand → stream its log lines.

### Key Interactions

| Action               | Feedback                                           |
|----------------------|----------------------------------------------------|
| Submit prompt        | Chat pushes msg → TeamLead chip animates thinking  |
| Plan generated       | Plan tree mounts w/ stagger (40ms/node)            |
| Coder writes file    | File tree highlights green 500ms, then settles     |
| Preview reload       | Fade + 200ms blur → sharp                          |
| Error in Tester      | Red banner top of chat, "Debug" button             |
| Upgrade needed       | Inline pill in chat: "Pro unlocks parallel Coders" |

---

## 3. Component Inventory (build order)

```
Tier A (sprint 1, blocks everything):
  - Button (primary/secondary/ghost/danger)
  - Input / Textarea / PromptBox (w/ slash-commands)
  - Card + Surface
  - Sidebar + SidebarItem
  - AgentChip + AgentLog

Tier B (sprint 2):
  - PlanTree (recursive, collapsible, status-colored)
  - FileTree (virtualized, icon-per-ext)
  - PreviewPane (iframe + device frame toggle)
  - ResizableLayout

Tier C (sprint 3, marketing):
  - Hero, FeatureGrid, PricingCards, LogoCloud
  - Footer, Navbar (pre-login)
  - Testimonial, CTA-Band
```

---

## 4. Accessibility (WCAG 2.2 AA)

- Contrast: text-primary on bg-app = 16.2:1 ✓
- All agent chips have visible text label + icon (not icon-only)
- Keyboard: Cmd+K global, Cmd+Enter submit, `/` focus prompt
- Focus ring: 2px var(--accent-primary), offset 2px
- Reduced motion: respects `prefers-reduced-motion` — stagger disabled, durations→0

---

## 5. Handoff to @Dev

- Token file: `src/styles/tokens.css` (create)
- Component library: extend existing `src/components/ui/` (shadcn/ui base)
- Use `cva` for variants, `tailwind-merge` for class composition
- Storybook (optional) — deferred to sprint 2
