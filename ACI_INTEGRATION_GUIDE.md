# ACI.dev Integration Guide for VibeSDK

## Overview

VibeSDK now integrates with ACI.dev, providing AI agents access to 600+ APIs and services for building data-rich applications and dashboards.

## What is ACI.dev?

ACI.dev is an open-source platform that provides unified access to hundreds of APIs and services through a single interface. It handles authentication, rate limiting, and provides a consistent API for AI agents to interact with external services.

## Available ACI Functions

### Core Functions
- `aci_execute_function` - Execute any ACI.dev function
- `aci_search_functions` - Search for available functions by intent
- `aci_get_function_definition` - Get detailed function parameters

### Function Categories
- **Web Search**: Brave Search, Tavily
- **Email**: Gmail, Outlook
- **Calendar**: Google Calendar, Outlook Calendar
- **Cloud Services**: AWS, GCP, Azure
- **Communication**: Slack, Discord, Teams
- **Productivity**: Notion, Linear, Jira
- **And 600+ more services**

## Usage Examples

### Basic Function Execution

```typescript
// Search for relevant functions
const searchResult = await aci_search_functions({
  intent: "get weather data"
});

// Execute a weather function
const weatherData = await aci_execute_function({
  functionName: "OPENWEATHER__CURRENT_WEATHER",
  arguments: {
    location: "New York",
    units: "metric"
  }
});
```

### Dashboard Data Fetching

```typescript
// Get data from multiple sources for a dashboard
const [notionData, githubData, slackData] = await Promise.all([
  aci_execute_function({
    functionName: "NOTION__GET_PAGES",
    arguments: { database_id: "your-database-id" }
  }),
  aci_execute_function({
    functionName: "GITHUB__GET_REPOS",
    arguments: { owner: "your-username" }
  }),
  aci_execute_function({
    functionName: "SLACK__GET_MESSAGES",
    arguments: { channel: "#general" }
  })
]);
```

### CRUD Operations

```typescript
// Create, Read, Update, Delete operations
const createResult = await aci_execute_function({
  functionName: "NOTION__CREATE_PAGE",
  arguments: {
    parent_id: "database-id",
    properties: { Name: { title: [{ text: { content: "New Task" } }] } }
  }
});

const readResult = await aci_execute_function({
  functionName: "NOTION__GET_PAGE",
  arguments: { page_id: createResult.id }
});

const updateResult = await aci_execute_function({
  functionName: "NOTION__UPDATE_PAGE",
  arguments: {
    page_id: createResult.id,
    properties: { Status: { select: { name: "In Progress" } } }
  }
});
```

## Integration Patterns

### 1. Data Fetching Hooks

```typescript
// Custom hook for ACI data fetching
export function useACIData(functionName: string, args: any) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await aci_execute_function({ functionName, arguments: args });
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [functionName, JSON.stringify(args)]);

  return { data, loading, error };
}
```

### 2. Dashboard Components

```typescript
// Dashboard component using ACI data
export function MetricsDashboard() {
  const { data: metrics } = useACIData("GOOGLE_ANALYTICS__GET_METRICS", {
    property_id: "your-property-id",
    date_ranges: [{ start_date: "30daysAgo", end_date: "today" }]
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardContent>
          <div className="text-2xl font-bold">{metrics?.totalUsers || 0}</div>
          <p className="text-muted-foreground">Total Users</p>
        </CardContent>
      </Card>
      {/* More metric cards */}
    </div>
  );
}
```

### 3. Real-time Updates

```typescript
// Real-time dashboard updates
export function RealtimeDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const newData = await aci_execute_function({
        functionName: "SLACK__GET_CHANNEL_INFO",
        arguments: { channel: "#general" }
      });
      setData(newData);
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return <Dashboard data={data} />;
}
```

## Best Practices

### Error Handling
```typescript
try {
  const result = await aci_execute_function({
    functionName: "API_NAME__FUNCTION_NAME",
    arguments: { /* params */ }
  });

  if (result.success) {
    // Use the data
    setData(result.data);
  } else {
    // Handle API errors
    setError(result.error);
  }
} catch (error) {
  // Handle network or authentication errors
  setError('Failed to fetch data');
}
```

### Loading States
```typescript
function DashboardComponent() {
  const { data, loading, error } = useACIData("API__FUNCTION", args);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return <EmptyState />;

  return <DashboardContent data={data} />;
}
```

### Caching
```typescript
// Cache ACI function results
const cache = new Map();

async function getCachedACIData(functionName: string, args: any) {
  const cacheKey = `${functionName}:${JSON.stringify(args)}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const result = await aci_execute_function({ functionName, arguments: args });
  cache.set(cacheKey, result);

  return result;
}
```

## Available Services

ACI.dev provides access to hundreds of services. Here are some popular ones for dashboard applications:

### Analytics & Monitoring
- Google Analytics
- Mixpanel
- PostHog
- Sentry

### Communication
- Slack
- Discord
- Microsoft Teams
- Gmail

### Project Management
- Linear
- Jira
- Notion
- Asana

### Cloud Services
- AWS (EC2, S3, Lambda)
- Google Cloud Platform
- Microsoft Azure

### Databases & Storage
- MongoDB
- PostgreSQL
- Redis
- Google Sheets

For a complete list of available services, visit: https://aci.dev/tools

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Ensure `ACI_API_KEY` is correctly set in environment variables
   - Check that the API key has proper permissions

2. **Function Not Found**
   - Use `aci_search_functions` to find the correct function name
   - Check function naming conventions (usually `SERVICE__FUNCTION`)

3. **Rate Limiting**
   - ACI.dev handles rate limiting automatically
   - Implement caching to reduce API calls

4. **Network Errors**
   - Always provide fallback data or error states
   - Implement retry logic for transient failures

### Debug Mode

Enable ACI debugging by setting:
```bash
ACI_DEBUG=true
```

This will log all ACI function calls and responses for troubleshooting.
