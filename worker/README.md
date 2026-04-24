# Limits & Free Tier System

## Overview

This implementation provides a comprehensive limits and free tier management system with the following components:

## Architecture

### 1. **Type Definitions** (`worker/types/limits.ts`)
- `LimitType`: Measurement types (prompts, tokens, cost)
- `LimitWindow`: Time windows (daily, weekly, monthly, lifetime)
- `LimitConfig`: Individual limit configuration
- `UserLimitsConfig`: Complete user limits
- `UsageData`: Tracking data for time windows
- `IUsageTracker`: Abstract interface for usage tracking
- `ILimitsConfig`: Abstract interface for limits configuration

### 2. **Usage Tracking** (`worker/services/limits/UsageTracker.ts`)
- `KVUsageTracker`: KV-based implementation
- Tracks usage across multiple time windows simultaneously
- Automatic TTL-based cleanup
- Window boundary calculations

### 3. **Limits Configuration** (`worker/services/limits/LimitsConfig.ts`)
- `KVLimitsConfig`: KV-based configuration storage
- User-specific custom limits
- Default limits for all users
- Fallback to hardcoded defaults

### 4. **Limits Service** (`worker/services/limits/LimitsService.ts`)
Main orchestration service:
- `checkLimits()`: Check if user is within limits
- `recordUsage()`: Record API usage
- `getUsageSummary()`: Get usage dashboard data
- `hasUserApiToken()`: Check if user has their own token
- `getUserApiToken()`: Retrieve user's token
- Static cost estimation utilities

### 5. **Integration Points**

#### Inference Flow (`worker/agents/inferutils/core.ts`)
- **`getApiKey()`**: Checks limits and switches to user token when exceeded
- **After response**: Records usage (prompts, tokens, cost)

#### API Endpoints (`worker/api/controllers/limits/controller.ts`)
- `GET /api/limits/usage` - Get current user's usage and limits
- `POST /api/limits/admin/set-user-limits` - Set custom limits for a user
- `POST /api/limits/admin/set-default-limits` - Update default limits
- `DELETE /api/limits/admin/remove-user-limits/:userId` - Revert to defaults
- `GET /api/limits/admin/user/:userId` - Get specific user's limits

## Default Free Tier Configuration

```typescript
[
  { type: 'prompts', window: 'daily', maxValue: 100 },
  { type: 'prompts', window: 'monthly', maxValue: 1000 },
  { type: 'tokens', window: 'daily', maxValue: 500000 },
  { type: 'cost', window: 'monthly', maxValue: 10.0 }
]
```

## Flow

### 1. **Request Initiation**
User makes an LLM API call → `infer()` function called

### 2. **Pre-Request Check** (in `getApiKey()`)
```typescript
LimitsService.checkLimits(userId)
├── Get user's limit configuration
├── Check usage against each enabled limit
└── Return: shouldUseUserKey = true/false
```

If limits exceeded:
- Attempt to use user's stored Cloudflare AI Gateway token
- Falls back to free tier if no user token found

### 3. **API Call Execution**
Request sent with appropriate API key

### 4. **Post-Request Tracking** (in `infer()`)
```typescript
LimitsService.recordUsage(userId, {
  prompts: 1,
  tokens: usage.total_tokens,
  cost: estimatedCost,
  model: modelName
})
```

Updates usage counters for:
- Daily window
- Weekly window  
- Monthly window
- Lifetime window

## Storage Structure

### KV Keys

**Usage Tracking:**
```
usage:{userId}:{type}:{window}:{date}
```
Example: `usage:user123:prompts:daily:2025-11-24`

**Limits Configuration:**
```
limits:user:{userId}
limits:default
```

### Data Format
```json
{
  "userId": "user123",
  "type": "prompts",
  "window": "daily",
  "currentValue": 45,
  "windowStart": "2025-11-24T00:00:00Z",
  "windowEnd": "2025-11-24T23:59:59Z",
  "lastUpdated": "2025-11-24T15:30:00Z"
}
```

## Custom Implementations

The system uses abstract interfaces (`IUsageTracker`, `ILimitsConfig`) allowing alternative backends:

### Potential Implementations:
- **D1 Database**: For queryable analytics
- **Durable Objects**: For real-time accuracy
- **Analytics Engine**: For time-series data
- **R2**: For long-term storage

### Example: Custom Tracker
```typescript
class D1UsageTracker implements IUsageTracker {
  async getUsage(userId: string, type: LimitType, window: LimitWindow): Promise<UsageData> {
    // Query D1 database
  }
  
  async incrementUsage(userId: string, increment: UsageIncrement): Promise<void> {
    // Update D1 tables
  }
  // ... implement other methods
}
```

## Cost Estimation

Model pricing estimates (per 1M tokens):
```typescript
const pricing = {
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'claude-3-opus': { input: 15, output: 75 },
  // ... more models
}
```

Cost = (inputTokens / 1M × inputPrice) + (outputTokens / 1M × outputPrice)

## Admin Operations

### Set Custom User Limits
```bash
POST /api/limits/admin/set-user-limits
{
  "userId": "user123",
  "limits": [
    { "type": "prompts", "window": "daily", "maxValue": 500, "enabled": true }
  ],
  "unlimited": false,
  "notes": "Premium user"
}
```

### Grant Unlimited Access
```bash
POST /api/limits/admin/set-user-limits
{
  "userId": "user123",
  "unlimited": true
}
```

### Update Default Limits
```bash
POST /api/limits/admin/set-default-limits
{
  "limits": [
    { "type": "prompts", "window": "daily", "maxValue": 200, "enabled": true }
  ]
}
```

## Monitoring & Analytics

### User Dashboard
```bash
GET /api/limits/usage
```

Returns:
- Current usage across all windows
- Limit configurations
- Whether user is within limits
- Percentage used for each limit
- Whether user has their own API token

### Admin View
```bash
GET /api/limits/admin/user/{userId}
```

Returns detailed usage and configuration for any user.

## Future Enhancements

1. **Notification System**: Warn users at 80%, 90%, 100% usage
2. **Usage History**: Store historical usage for trend analysis
3. **Rate Limiting**: Add per-minute/hour limits
4. **Billing Integration**: Automatic upgrade prompts
5. **Usage Predictions**: ML-based forecasting
6. **Custom Windows**: Allow custom time periods
7. **Grace Periods**: Soft limits before hard cutoff
8. **Rollover**: Allow unused quota to carry over

## Error Handling

- Usage tracking failures don't block requests
- Limits checks default to allowing requests on error
- Logged errors for monitoring and debugging
- Graceful degradation when KV is unavailable

## Testing Recommendations

1. Test window boundary calculations
2. Verify TTL-based cleanup
3. Test concurrent usage updates
4. Validate cost estimation accuracy
5. Test fallback to user token
6. Verify admin permissions
7. Test usage reset functionality
