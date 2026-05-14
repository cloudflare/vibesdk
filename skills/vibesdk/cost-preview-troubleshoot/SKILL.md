# Cost Preview Troubleshoot Skill

## Purpose
Diagnose issues with the per-phase credit cost preview system (S5 feature).

## When to Invoke
- CostPreviewBadge not appearing in the UI before a phase runs
- Badge shows 0–0 credits
- Badge doesn't dismiss after 8 seconds
- `vibesdk:cost_preview` event not firing

## System Overview
```
PhaseGenerationOperation produces PhaseConceptType
  → phasic.ts:emitCostPreview(phaseConcept)
    → effortEstimator.estimatePhaseCredits(fileCount, tier, enableCritic)
    → broadcast COST_PREVIEW WebSocket message
      → handle-websocket-message.ts case 'cost_preview'
        → window.dispatchEvent(new CustomEvent('vibesdk:cost_preview', { detail }))
          → CostPreviewBadge component receives event → renders amber pill
            → setTimeout 8s → auto-dismiss
```

## Diagnostic Checklist

### 1. Check WebSocket message reaches frontend
```javascript
// Browser DevTools Console
window.addEventListener('vibesdk:cost_preview', e => console.log(e.detail));
// Then trigger a generation — event should fire with: { phaseName, creditsMin, creditsMax, fileCount, modelTier }
```

### 2. Check broadcast is emitting COST_PREVIEW
```typescript
// worker/agents/core/behaviors/phasic.ts — emitCostPreview()
// Must call: this.broadcast(WebSocketMessageResponses.COST_PREVIEW, { ... })
// WebSocketMessageResponses.COST_PREVIEW = 'cost_preview'  ← from constants.ts
```

### 3. Check effortEstimator returns non-zero
```typescript
// worker/services/billing/effortEstimator.ts
// estimatePhaseCredits(fileCount: number, tier: SubscriptionTier, enableCritic = false)
// Returns: { creditsMin, creditsMax, fileCount, modelTier }
// If fileCount = 0, creditsMin and creditsMax will also be 0 — phase has no files?
```

### 4. Check CostPreviewBadge is mounted
```typescript
// src/routes/chat/chat.tsx
// CostPreviewBadge must be inside the JSX tree, after S5 import
// Look for: <CostPreviewBadge /> near <PhaseQualityBadge />
```

### 5. Check handle-websocket-message.ts
```typescript
// src/routes/chat/utils/handle-websocket-message.ts
// Must have case 'cost_preview': block that dispatches vibesdk:cost_preview
// The case uses _type2 alias to avoid block-scoped redeclaration conflict
```

## Key Files
```
worker/services/billing/effortEstimator.ts         — credit range calculation
worker/agents/core/behaviors/phasic.ts             — emitCostPreview(), broadcast call
worker/api/websocketTypes.ts                       — CostPreviewMessage type
src/components/billing/CostPreviewBadge.tsx        — amber pill UI component
src/routes/chat/utils/handle-websocket-message.ts — event dispatch bridge
src/routes/chat/chat.tsx                           — badge mount point
worker/agents/constants.ts                         — COST_PREVIEW = 'cost_preview'
```

## Credit Estimation Formula
```
numCoders = min(4, max(1, fileCount))
filesPerCoder = ceil(fileCount / numCoders)
creditsMin = estimateGenerationCredits('free', numCoders, filesPerCoder, false)
creditsMax = estimateGenerationCredits(tier === 'free' ? 'free' : 'pro', numCoders, filesPerCoder, enableCritic)
```
