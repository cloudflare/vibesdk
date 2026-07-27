# Legacy V1 Dev API Postman Collection

> This collection documents the legacy V1 Dev/phasic API surface and has not been migrated to the current Think behavior. Verify routes and payloads against `worker/api/routes/` before using it for current integrations.

The collection remains available for compatibility testing of supported legacy endpoints, OAuth setup, and CSRF behavior.

## 📋 Overview

This collection includes **100+ API endpoints** organized into logical groups:

- 🔐 **Authentication** - OAuth, email auth, session management (16 endpoints)
- 🤖 **Agent & Code Generation** - AI-powered webapp creation (5 endpoints) 
- 📱 **Apps Management** - CRUD operations, public feed, favorites (10 endpoints)
- 👤 **User Management** - Profile, apps with pagination (2 endpoints)
- 📊 **Analytics & Stats** - User stats, AI Gateway analytics (4 endpoints)
- 🤖 **Model Configuration** - AI model settings, BYOK providers (8 endpoints)
- 🏢 **Custom Model Providers** - OpenAI-compatible API management (6 endpoints)
- 🔐 **Secrets Management** - API keys, credentials with templates (5 endpoints)
- 🐙 **GitHub Integration** - Repository export, OAuth (2 endpoints)

## 🚀 Quick Setup

### 1. Import Collection & Environment

1. **Import Collection**: 
   - Open Postman → Import → Upload `v1dev-api-collection.postman_collection.json`

2. **Import Environment**: 
   - Import → Upload `v1dev-environment.postman_environment.json`
   
3. **Select Environment**: 
   - Choose "V1 Dev Environment" from the environment dropdown

### 2. Configure Base URL

Update the `baseUrl` environment variable:

- **Production**: `https://your-production-domain.com`
- **Local Development**: `http://localhost:8787` (Wrangler dev server)

### 3. OAuth Setup in Postman

⚠️ **IMPORTANT**: OAuth endpoints redirect to external providers (Google/GitHub) and cannot be tested directly in Postman.

#### 🌐 Recommended Approach: OAuth Helper Requests

1. **Use the OAuth Helper requests**:
   - Run "🌐 OAuth Helper - Get Google URL" 
   - Check the **Console tab** in Postman for the OAuth URL
   - Copy the URL and open it in your browser

2. **Complete authentication in browser**:
   - Follow the OAuth flow in your browser
   - After successful auth, you'll be redirected back to your app
   - Session cookies are now set for your domain

3. **Return to Postman**:
   - Session cookies will work automatically for same-domain requests
   - Test with "Get User Profile" to verify authentication

#### Alternative: Manual URL Construction

If helpers don't work, manually construct URLs:
- **Google OAuth**: `{{baseUrl}}/api/auth/oauth/google`  
- **GitHub OAuth**: `{{baseUrl}}/api/auth/oauth/github`
- Open these URLs directly in your browser

#### Why Direct OAuth Requests Show HTML

- OAuth endpoints return HTTP redirects (302) to provider websites
- Postman shows the redirect HTML instead of following it
- This is normal behavior - OAuth requires browser-based flows

### 4. CSRF Token Automation

The collection automatically handles CSRF tokens:

- Pre-request scripts fetch CSRF tokens when needed
- Tokens are stored in the `csrf_token` environment variable
- All state-changing requests include the token automatically

## 🔑 Authentication Methods

### 1. Email Authentication
```json
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "Test User"
}

POST /api/auth/login
{
  "email": "user@example.com", 
  "password": "SecurePassword123!"
}
```

### 2. OAuth Authentication
- **Google OAuth**: `GET /api/auth/oauth/google`
- **GitHub OAuth**: `GET /api/auth/oauth/github`

### 3. Session-Based Authentication
- Uses secure HTTP-only cookies
- Sessions are automatically maintained across requests
- CSRF protection via `X-CSRF-Token` header

## 📱 Core API Workflows

### 1. Create a New App with AI

```bash
# 1. Login or use OAuth
POST /api/auth/login

# 2. Start code generation
POST /api/agent
{
  "query": "Create a React todo app with TypeScript and Tailwind CSS",
  "agentMode": "smart",
  "language": "typescript", 
  "frameworks": ["react", "tailwindcss"],
  "selectedTemplate": "react-typescript"
}

# 3. Connect to WebSocket for real-time updates
GET /api/agent/{agentId}/ws (WebSocket)

# 4. Deploy preview when ready
GET /api/agent/{agentId}/preview
```

### 2. Browse and Interact with Apps

```bash
# Get public apps (no auth required)
GET /api/apps/public?page=1&limit=20&sort=stars&order=desc

# Get app details (no auth required)
GET /api/apps/{appId}

# Star an app (requires auth)
POST /api/apps/{appId}/star

# Fork an app (requires auth) 
POST /api/apps/{appId}/fork
```

### 3. Configure AI Models

```bash
# Get available models and providers
GET /api/model-configs/byok-providers

# Update model configuration for specific agent action
PUT /api/model-configs/planner
{
  "modelName": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096,
  "temperature": 0.7,
  "reasoningEffort": "medium"
}

# Test model configuration
POST /api/model-configs/test
{
  "agentActionName": "planner",
  "useUserKeys": true
}
```

### 4. Manage API Keys and Secrets

```bash
# Get secret templates
GET /api/secrets/templates

# Store an API key
POST /api/secrets
{
  "templateId": "openai_api_key",
  "name": "My OpenAI API Key",
  "envVarName": "OPENAI_API_KEY",
  "value": "sk-your-api-key-here"
}

# Create custom model provider  
POST /api/user/providers
{
  "name": "My Custom OpenAI Provider",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-your-key",
  "models": [...]
}
```

## 🔧 Advanced Features

### Environment Variables
The collection uses these automatically managed variables:

| Variable | Description | Auto-populated |
|----------|-------------|----------------|
| `csrf_token` | CSRF protection token | ✅ |
| `user_id` | Current user ID | ✅ |
| `session_id` | Current session ID | ✅ |
| `agent_id` | Current agent/app ID | ✅ |
| `app_id` | Current app ID | ✅ |
| `provider_id` | Model provider ID | Manual |
| `secret_id` | Secret ID | Manual |

### Request Automation

- **CSRF Tokens**: Automatically fetched and included
- **Session Management**: Cookies handled transparently  
- **Variable Population**: IDs extracted from responses
- **Error Handling**: Test scripts validate responses

### WebSocket Testing

For WebSocket endpoints like agent communication:

1. Use a WebSocket client (wscat, Postman WebSocket, etc.)
2. Connect to: `ws://localhost:8787/api/agent/{agentId}/ws`
3. Include authentication cookies
4. Send/receive real-time messages during code generation

## 🛠️ Development Setup

### Local Development

1. **Start Wrangler Dev Server**:
   ```bash
   cd /path/to/vibesdk
   bun run dev
   ```

2. **Update Environment**:
   - Set `baseUrl` to `http://localhost:8787`
   - Ensure `.dev.vars` contains required environment variables

3. **Test Authentication**:
   - OAuth may require ngrok for localhost callback URLs
   - Email auth works directly with localhost

### Production Testing

1. Update `baseUrl` to your production domain
2. Ensure OAuth apps are configured with correct callback URLs
3. Test with real OAuth credentials

## 📚 API Documentation

### Authentication Levels

- **Public**: No authentication required
- **Authenticated**: Requires valid session
- **Owner Only**: Requires ownership of the resource

### Common Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `page` | Page number for pagination | `1` |
| `limit` | Items per page | `20` |
| `sort` | Sort field | `createdAt`, `stars` |
| `order` | Sort order | `asc`, `desc` |
| `period` | Time period filter | `today`, `week`, `month`, `all` |
| `search` | Search query | `"todo app"` |

### Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "pagination": {  // For paginated responses
    "page": 1,
    "limit": 20, 
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }  // Optional additional details
}
```

## 🚨 Troubleshooting

### Common Issues

1. **CSRF Token Errors**:
   - Ensure pre-request scripts are enabled
   - Manually run "Get CSRF Token" request
   - Check that `X-CSRF-Token` header is included in POST/PUT/DELETE requests

2. **Authentication Issues**:
   - Verify cookies are enabled in Postman
   - Check that OAuth callback URLs match your configuration
   - Ensure session hasn't expired (check "Get User Profile")

3. **WebSocket Connection Issues**:
   - WebSockets require active session authentication
   - Use external WebSocket client if Postman WebSocket support is limited
   - Verify agent ownership for WebSocket connections

4. **Local Development Issues**:
   - Ensure Vite is running (`bun run dev`)
   - Check that `.dev.vars` contains required environment variables
   - Verify D1 migrations are applied (`bun run db:migrate:local`)

### Getting Help

1. **Check API Response**: Look at response body for detailed error messages
2. **Verify Environment**: Ensure correct `baseUrl` is set
3. **Test Authentication**: Run "Check Auth Status" to verify session
4. **Review Logs**: Check browser DevTools or Wrangler logs for additional context

## 🎯 Testing Workflows

### Complete User Journey

1. **Register/Login** → Authentication working
2. **Create App** → AI generation working
3. **Browse Public Apps** → Public feed working
4. **Star/Fork App** → Social features working
5. **Configure Models** → AI customization working
6. **Manage Secrets** → Security features working
7. **Export to GitHub** → Integration working

### Quick Health Check

Run these requests to verify the system:

1. `GET /api/auth/providers` - System status
2. `GET /api/apps/public` - Public API working
3. `POST /api/auth/login` - Authentication working
4. `GET /api/model-configs` - AI system working
5. `GET /api/stats` - Analytics working

This collection provides comprehensive coverage of all V1 Dev APIs with proper authentication, error handling, and real-world usage examples. Perfect for development, testing, and integration work!