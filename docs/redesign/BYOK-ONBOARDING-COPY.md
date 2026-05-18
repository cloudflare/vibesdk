# BYOK Direct-API Onboarding Copy

**Owner:** @BA + @UI/UX-Copy
**Status:** READY — Ship by Jun 3 2026 (T-12d before Anthropic Jun-8 activation email)

---

## Why BYOK Matters (Internal Context)

- Anthropic splits subscriptions Jun 15: Pro $20 / Max5x $100 / Max20x $200
- Activation email lands Jun 8 — peak user confusion window begins there
- BYOK users pay Anthropic/OpenAI directly — no vibesdk token billing, no markup
- Must set user expectations BEFORE Jun 8 email hits their inbox
- Target: Indian developers who are cost-sensitive and want full billing transparency

---

## UI Component Map (drop copy here)

All BYOK copy lives in two files:

| Component | Path | Copy locations |
|---|---|---|
| BYOK modal (primary) | `src/components/byok-api-keys-modal.tsx` | `DialogTitle`, `DialogDescription`, input `Label`, help text, success/error states |
| Config modal (gateway) | `src/components/config-modal.tsx` | BYOK tab header, mode description, explainer card |
| Settings page | `src/routes/settings/index.tsx` | Section header "Provider API Keys", scroll-to-link label |
| Landing feature grid | `docs/redesign/UI-UX-PRELOGIN.md` [06] | Feature card: "Your keys, your data" |
| Pricing table | `docs/redesign/PRICING-TIERS.md` | "BYO API keys" row + upgrade prompt copy |

---

## In-App Copy: BYOK Modal (`byok-api-keys-modal.tsx`)

### Dialog Header

**Title:**
```
Use Your Own API Key
```

**Subtitle (DialogDescription):**
```
Connect your Anthropic or OpenAI key directly. You pay them at their published
rates — vibesdk never marks up your AI usage.
```

### Explainer Card (render above provider list on first open)

**Title:**
```
How BYOK works
```

**Body (3 bullets):**
```
- Your key goes directly from vibesdk to Anthropic or OpenAI — every token
  is billed on your provider account at their published rates.
- vibesdk does not add any markup. You see exact costs in your
  Anthropic Console or OpenAI dashboard, not in vibesdk billing.
- Your key is encrypted with XChaCha20-Poly1305 before storage and is
  never logged, shared, or visible to vibesdk staff. Revoke it anytime
  from this screen.
```

### Add Keys Tab

**Tab label:**
```
Add Keys
```

**Provider list label:**
```
Select provider
```

#### Anthropic Input

```
Label:       Anthropic API Key
Placeholder: sk-ant-api03-...
Help text:   Encrypted in your account vault. Get yours at console.anthropic.com
```

#### OpenAI Input

```
Label:       OpenAI API Key
Placeholder: sk-...
Help text:   Encrypted in your account vault. Get yours at platform.openai.com/api-keys
```

#### Google AI Studio Input

```
Label:       Google AI Studio API Key
Placeholder: AIza...
Help text:   Encrypted in your account vault. Get yours at aistudio.google.com/app/apikey
```

#### Cerebras Input

```
Label:       Cerebras API Key
Placeholder: csk-...
Help text:   Encrypted in your account vault. Get yours at cloud.cerebras.ai
```

### Save Button

```
Add Key
```
*(current label — no change required; context is clear from provider selection)*

### Success Toast

```
{Provider name} key active. Usage billed directly by {Provider name}.
```

Example: `Anthropic key active. Usage billed directly by Anthropic.`

### Error Toast (invalid key format)

```
This key format looks wrong. Expected: {provider.placeholder}
Check it at {provider console URL} and try again.
```

### Manage Keys Tab

**Tab label:**
```
Manage Keys
```

**Empty state heading:**
```
No API keys configured
```

**Empty state body:**
```
Add a key using the "Add Keys" tab. Your keys stay encrypted in your vault.
```

**Vault locked state heading:**
```
Vault is locked
```

**Vault locked state body:**
```
Unlock your vault to view and manage API keys
```

**Vault not set up heading:**
```
Set up your secure vault
```

**Vault not set up body:**
```
Create a vault to securely store your API keys with XChaCha20-Poly1305 encryption
```

### Delete Confirmation Dialog

**Title:**
```
Remove API key?
```

**Body:**
```
This removes {provider name} from vibesdk. Your {provider name} account and
any existing usage are not affected. This action cannot be undone in vibesdk
(you can always add the key again).
```

---

## Onboarding Modal Copy (first-run, post-signup)

*Context: shown as a step in the new-user onboarding flow. Surface after email verification.*

### Step Title

```
How do you want to power your AI?
```

### Option A — Managed (platform pays)

```
Label:       vibesdk provides AI
Description: We handle the AI credits. Usage counted against your plan quota.
Badge:       Included in plan
```

### Option B — BYOK (user pays provider directly)

```
Label:       Bring my own key
Description: Connect your Anthropic or OpenAI key. You pay them directly — no
             markup, no quota limits from vibesdk.
Badge:       Unlimited AI usage
```

### BYOK Explanation Modal (shown when user selects Option B)

**Title:**
```
You are in control of your AI costs
```

**Body:**
```
When you use your own API key:

- Every AI request runs on your Anthropic or OpenAI account
- Costs appear in your provider dashboard at their exact published rates
- vibesdk adds zero markup — what Anthropic or OpenAI charges you is what you pay
- Your key is encrypted before it ever touches our storage (XChaCha20-Poly1305)
- You can revoke or swap your key from Settings at any time

This is especially useful if you already have an Anthropic or OpenAI subscription
and want to keep all AI costs in one place.
```

**CTA:**
```
Connect my key
```

**Secondary link:**
```
Use vibesdk's AI instead
```

---

## Settings Page Copy (`src/routes/settings/index.tsx`)

### Section Header (id="model-configs" > Provider API Keys)

**Heading:**
```
Provider API Keys (BYOK)
```

**Description:**
```
Connect your own Anthropic, OpenAI, or Google AI key. Requests run on your
provider account at their published rates — vibesdk does not bill for tokens.
```

**Button label:**
```
Manage API Keys
```

---

## FAQ Additions (landing `/` accordion, `UI-UX-PRELOGIN.md` [11])

Add these items to the FAQ section:

---

**Q: Will Anthropic's new pricing (Jun 15) affect my vibesdk subscription?**

A: If you use BYOK — your own Anthropic API key — then no. You pay Anthropic directly at their published rates. vibesdk never adds a markup on AI usage. Your vibesdk subscription price does not change.

---

**Q: What is BYOK?**

A: BYOK means Bring Your Own Key. Instead of vibesdk buying AI credits on your behalf, you connect your own Anthropic, OpenAI, or Google AI API key. Every AI request goes directly from vibesdk to your provider account — you see the exact costs in your Anthropic Console or OpenAI dashboard, not in vibesdk billing. There is no per-token markup from vibesdk.

---

**Q: Is my API key safe?**

A: Yes. Your key is encrypted with XChaCha20-Poly1305 using a per-user encryption key before it is stored. It is never logged, never visible to vibesdk staff, and never sent anywhere except directly to your chosen AI provider. You can delete it from vibesdk Settings at any time — this does not affect your provider account.

---

**Q: Can I switch between vibesdk's AI and my own key?**

A: Yes. Open Settings > AI Model Configurations > Manage API Keys to add, swap, or remove your key. If no BYOK key is configured, vibesdk falls back to its own AI provider pool, which counts against your plan quota.

---

## Pricing Page Copy Addition (`PRICING-TIERS.md`)

### Banner (above tier table)

```
Bring your own Anthropic, OpenAI, or Google AI key and pay AI costs directly —
no markup, no surprise bills. BYOK is available on every plan.
```

### Tier table row update

Current row label: `BYO API keys`
Updated label: `BYO API keys (pay provider directly, no markup)`

Available on: Free / Pro / Team / Enterprise (all tiers — matches existing matrix)

### Upgrade Prompt Addition (for users confused by Anthropic Jun-15 email)

| Trigger | Prompt |
|---|---|
| User opens BYOK modal within 7 days of Jun 8 | "Seeing Anthropic's new pricing email? With BYOK, you pay Anthropic directly at their rates — vibesdk adds nothing on top. [Connect your key]" |

---

## Landing Feature Grid Update (`UI-UX-PRELOGIN.md` [06])

Current card:
```
Icon: locked
Title: Your keys, your data
Body:  BYO API keys, encrypted per-user DO
```

Updated body:
```
Connect your own Anthropic or OpenAI key. Pay providers at their published
rates with zero vibesdk markup. Keys encrypted per-user with XChaCha20-Poly1305.
```

---

## Implementation Notes for Developers

1. **No new components needed.** All copy drops into existing `byok-api-keys-modal.tsx` and `config-modal.tsx` string literals.
2. **Explainer card** is new UI — add a `<Card>` block above the provider list in the "Add Keys" tab. Conditionally show on first open (`localStorage` flag: `vibesdk_byok_explainer_seen`).
3. **Onboarding step** requires a new step added to the post-signup onboarding wizard (if one exists) or a one-time banner on first chat load.
4. **FAQ items** go into whatever accordion component drives `/` [11] section.
5. **Anthropic Jun-8 trigger banner:** fire when `Date.now()` is within `[Jun 8, Jun 22]` window and user has not added a BYOK key yet. Dismiss to localStorage.
6. Vault encryption details referenced in copy match the live implementation in `worker/services/secrets/` (XChaCha20-Poly1305, per-user MEK → UMK → DEK chain).
