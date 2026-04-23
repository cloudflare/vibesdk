# Pre-Login Marketing Site — emergent.sh-style

**Owner:** @UI/UX
**Skill invoked:** `ui-ux-pro-max`, `frontend-design`, `copywriting`, `marketing-psychology`

---

## Page Map

```
/                  → Landing (hero, demo, features, proof, pricing, CTA)
/pricing           → Pricing deep-dive + comparison table
/templates         → Template gallery (what you can build)
/showcase          → Apps built w/ VibeSDK
/docs              → Deep-link into docs
/enterprise        → Enterprise pitch + contact
/auth/login        → Login (w/ OAuth: GH, Google)
/auth/signup       → Signup (email + OAuth)
```

---

## 1. Landing `/` (primary conversion surface)

### Section Order (emergent.sh pattern)

```
[01] Nav              — sticky, 64h, blur-bg
[02] Hero             — "Build apps by describing them"
[03] Live demo        — embedded prompt → preview iframe
[04] Logo cloud       — "Trusted by teams at ..."
[05] How it works     — 3-step w/ agent chip animation
[06] Feature grid     — 6 cards, 3×2
[07] Built-with       — Cloudflare platform strip
[08] Templates strip  — horizontal scroll, 8 cards
[09] Testimonials     — 3-col quotes
[10] Pricing          — 4 tiers w/ "Most popular"
[11] FAQ              — accordion, 8 items
[12] Final CTA band   — "Start building in 60s"
[13] Footer           — links, social, legal
```

### [02] Hero Spec

```
Layout:   centered, max-w-5xl, py-32
Headline: 5xl/6xl, -0.02em, weight 700, 2 lines
           "Describe it. Deploy it."
           "AI builds your full-stack app."
Subhead:  xl, text-secondary, max-w-2xl, "From prompt to production in
           minutes. Multi-agent planner writes, tests, and ships the code
           for you — on Cloudflare's edge."
CTAs:     [Start free →] [Watch 2-min demo]
              primary        ghost
Aurora:   animated gradient blur behind hero (orange→indigo→teal)
          respects prefers-reduced-motion
Below CTA: tiny row: "No credit card · Free tier · Open source"
```

### [03] Live Demo

```
Card, rounded-xl, border, bg-surface
Left:  prompt input (prefilled, editable) + "Generate" button
Right: loading → plan tree → preview iframe
Stream real agent chips (TeamLead, Planner, Coder, Tester) w/ faux-latency
Fallback: static gif if WS blocked
```

### [06] Feature Grid (copy)

| Icon | Title                  | Body                                                |
|------|------------------------|-----------------------------------------------------|
| 🧠   | Multi-agent planner    | Team-lead critiques before coders execute           |
| ⚡    | Parallel execution     | 4 agents writing files at once                      |
| 🧪   | Self-healing tests     | Tester agent runs + auto-fixes failures             |
| 🔐   | Your keys, your data   | BYO API keys, encrypted per-user DO                 |
| 🚀   | One-click deploy       | Ships to Cloudflare Workers, custom domains         |
| 📦   | Open source core       | Fork the platform, own the stack                    |

### [10] Pricing — see `PRICING-TIERS.md`

---

## 2. Navigation

```
Pre-login:   [Logo]  Product  Templates  Pricing  Docs   Enterprise   [Sign in] [Start free]
Post-login:  [Logo]  Projects  Templates  Usage         [Avatar ▾]
```

- Sticky, 64h
- Scroll past hero → blur-bg (backdrop-blur-lg) + border-bottom
- Mobile: hamburger → slide-in drawer

---

## 3. Auth Flow

```
Signup:
  ┌───────────────────────┐
  │ VibeSDK               │
  │ Start building        │
  │ [GitHub] [Google]     │
  │ ──── or ────          │
  │ email                 │
  │ [ Continue ]          │
  │ Free tier, no card    │
  └───────────────────────┘

Login: same card, "Continue with magic link" primary, OAuth secondary
```

- No passwords (magic-link + OAuth only)
- After signup: one onboarding screen → "What do you want to build?" → route to `/app/new`

---

## 4. Pre-Login Design Tokens (Light-Mode Variant)

Marketing site supports **both themes**; toggle in nav. Default = dark (matches app).

```css
/* LIGHT */
[data-theme="light"] {
  --bg-app:           #FAFAFA;
  --bg-chat:          #FFFFFF;
  --brand-surface:    #FFFFFF;
  --brand-surface-2:  #F5F6F8;
  --brand-border:     #E5E7EB;
  --text-primary:     #0A0B0F;
  --text-secondary:   #4B5563;
  --text-tertiary:    #9CA3AF;
  /* accents unchanged */
}
```

---

## 5. Copy Voice

- Direct, confident, zero fluff
- 2nd person ("you"), active verbs
- Numbers where possible ("Ship in 60s", "4 agents in parallel")
- No jargon ("LLM", "agent swarm") in hero — save for /docs
- Trust signals inline ("Open source", "Your keys", "Cloudflare edge")

---

## 6. Performance Targets

- LCP < 1.8s on 4G
- CLS < 0.05
- Hero image: AVIF + responsive srcset
- Aurora gradient: CSS only, no canvas
- Fonts: subsetted, `font-display: swap`
- JS budget pre-login: < 120KB gz (no React on marketing pages — Astro or plain HTML option on table)

---

## 7. Implementation Note

Current `src/routes/` has app shell only. Two options:

**A.** Add `/src/routes/marketing/` — same React app, SEO via react-helmet.
**B.** Split: `apps/marketing` (Astro, static) + `apps/app` (current React). Cleaner, better perf.

**Recommendation:** B for v1 if sprint budget allows, else A.
