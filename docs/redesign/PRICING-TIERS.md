# Pricing Tiers — Tiered Upgrades

**Owner:** @PO + @Analyst-Commercial
**Skill invoked:** `pricing-strategy`, `marketing-psychology`

## Positioning

- **Free** — hook: one-shot generation, hosted preview only
- **Pro** — activation: multi-agent parallelism + deploy to your Cloudflare
- **Team** — expansion: shared workspaces, team seats
- **Enterprise** — enterprise: SSO, SLA, private model, on-prem keys

## Tier Matrix

| Feature                           | Free       | Pro $20/mo  | Team $60/seat | Enterprise      |
|-----------------------------------|------------|-------------|---------------|-----------------|
| App generations / month           | 5          | 100         | 500 / seat    | Unlimited       |
| Parallel agents                   | 1 (serial) | 4           | 4             | 8               |
| Model tier                        | Sonnet-L   | Sonnet-M+H  | Opus optional | Opus default    |
| Critic agent (plan red-team)      | —          | ✓           | ✓             | ✓               |
| Custom domain deploy              | —          | ✓           | ✓             | ✓               |
| GitHub export                     | ✓          | ✓           | ✓             | ✓               |
| BYO API keys                      | ✓          | ✓           | ✓             | ✓ + managed     |
| Team workspaces                   | —          | —           | ✓             | ✓               |
| SSO / SAML                        | —          | —           | —             | ✓               |
| Private model endpoint            | —          | —           | —             | ✓               |
| Support                           | Community  | Email       | Priority      | Dedicated       |
| SLA                               | —          | —           | —             | 99.9% uptime    |
| Usage analytics                   | Basic      | Full        | Full + team   | Full + audit    |

## Gating Implementation

```ts
// worker/services/entitlements.ts
type Tier = 'free' | 'pro' | 'team' | 'enterprise';

interface Entitlements {
  maxGenerationsPerMonth: number;
  maxParallelAgents: 1 | 4 | 8;
  modelTiers: ('haiku' | 'sonnet' | 'opus')[];
  criticEnabled: boolean;
  customDomainDeploy: boolean;
  teamWorkspaces: boolean;
  ssoEnabled: boolean;
}

const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free:       { maxGenerationsPerMonth: 5,   maxParallelAgents: 1, modelTiers: ['haiku','sonnet'], criticEnabled: false, customDomainDeploy: false, teamWorkspaces: false, ssoEnabled: false },
  pro:        { maxGenerationsPerMonth: 100, maxParallelAgents: 4, modelTiers: ['sonnet'],         criticEnabled: true,  customDomainDeploy: true,  teamWorkspaces: false, ssoEnabled: false },
  team:       { maxGenerationsPerMonth: 500, maxParallelAgents: 4, modelTiers: ['sonnet','opus'],  criticEnabled: true,  customDomainDeploy: true,  teamWorkspaces: true,  ssoEnabled: false },
  enterprise: { maxGenerationsPerMonth: Infinity, maxParallelAgents: 8, modelTiers: ['sonnet','opus'], criticEnabled: true, customDomainDeploy: true, teamWorkspaces: true, ssoEnabled: true  },
};
```

Enforcement point: `TeamLeadAgent.spawnSubAgents()` checks tier before spawning >1 Coder.

## Upgrade Prompts (in-app)

| Trigger                                        | Prompt                                              |
|------------------------------------------------|-----------------------------------------------------|
| User on Free hits 5 generations                | "You've hit Free limit. Pro unlocks 100/mo + parallel agents → [Upgrade]" |
| User on Free requests feature needing Critic   | "Plan critique is a Pro feature. [Try Pro for $20] or [Continue without]" |
| User on Pro requests >4 parallel agents        | "Team plan unlocks 8 parallel agents → [See Team]"  |
| User mentions "SSO" or "SAML" in chat          | Sidebar nudge: "Talk to sales for Enterprise"       |

## Psychology Notes (`marketing-psychology`)

- **Anchor Enterprise "Contact us"** — makes Team look reasonable
- **"Most popular" badge** on Pro — social proof
- **Annual toggle** — save 20% (16/mo Pro, 48/seat Team)
- **Loss framing** on trial expiry — "Your parallel agents will slow to 1 in 3 days"
- **Counter-intuitive: Free generations don't rollover** — urgency each month

## Metrics (Phase 7 review)

- Free → Pro conversion target: 3% (industry avg 2-5%)
- Pro retention M3: > 85%
- ARPU target M6: $32
- Gross margin: > 70% (LLM cost is biggest variable — see model-tiering section)
