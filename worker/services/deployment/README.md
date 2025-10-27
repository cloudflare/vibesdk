# Multi-Provider Deployment System

This deployment system allows generated apps to be deployed to multiple hosting providers including Cloudflare Workers, Vercel, Netlify, and GitHub Pages.

## Overview

The deployment system provides:
- **Unified Interface**: Single API for deploying to multiple providers
- **Provider Abstraction**: Easy to add new deployment providers
- **Credential Management**: Secure storage of deployment credentials
- **Deployment Tracking**: Database tracking of all deployments
- **Status Monitoring**: Real-time deployment status updates via WebSocket

## Supported Providers

### 1. Cloudflare Workers
- **Status**: Primary deployment target (existing integration)
- **Features**: Workers for Platforms, Dispatch Namespaces
- **Use Case**: Dynamic server-side applications

### 2. Vercel
- **Status**: ✅ Implemented
- **Features**: Automatic build and deploy, edge functions
- **Use Case**: React, Next.js, and modern web applications
- **API**: Uses Vercel Deployment API v13

### 3. Netlify
- **Status**: ✅ Implemented
- **Features**: Continuous deployment, serverless functions
- **Use Case**: Static sites and JAMstack applications
- **API**: Uses Netlify API v1

### 4. GitHub Pages
- **Status**: ✅ Implemented
- **Features**: Free static hosting, custom domains
- **Use Case**: Static sites, documentation, portfolios
- **API**: Uses GitHub API v3

## Architecture

```
┌─────────────────────┐
│  DeploymentService  │  (Coordinator)
└──────────┬──────────┘
           │
           ├─────────────────────────────────────┐
           │                                     │
┌──────────▼──────────┐              ┌──────────▼──────────┐
│ DeploymentProvider  │              │ DeploymentDbService │
│      Factory        │              │   (Database ORM)    │
└──────────┬──────────┘              └─────────────────────┘
           │
           ├────────┬────────┬────────┐
           │        │        │        │
    ┌──────▼──┐ ┌──▼───┐ ┌──▼────┐ ┌─▼──────┐
    │ Vercel │ │Netlify│ │GitHub │ │Cloudflare│
    │Provider│ │Provider│ │Pages  │ │(existing)│
    └─────────┘ └───────┘ └───────┘ └─────────┘
```

## Usage

### Basic Deployment

```typescript
import { DeploymentService } from './services/deployment';

// Create deployment service with credentials
const deploymentService = new DeploymentService({
  vercelApiToken: env.VERCEL_API_TOKEN,
  netlifyApiToken: env.NETLIFY_API_TOKEN,
  githubToken: env.GITHUB_TOKEN,
  githubRepo: 'username/repo-name',
});

// Prepare deployment options
const options: DeploymentOptions = {
  files: generatedFilesMap,
  projectName: 'my-awesome-app',
  framework: 'react',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  production: true,
};

// Deploy to Vercel
const result = await deploymentService.deploy('vercel', options);

if (result.success) {
  console.log('Deployed to:', result.deploymentUrl);
} else {
  console.error('Deployment failed:', result.error);
}
```

### Deployment with Custom Configuration

```typescript
const result = await deploymentService.deploy(
  'netlify',
  options,
  {
    siteId: 'existing-site-id',
    customDomain: 'myapp.com',
    environmentVariables: {
      API_KEY: 'secret-key',
      NODE_ENV: 'production',
    },
  }
);
```

### Monitoring Deployment Status

```typescript
const status = await deploymentService.getDeploymentStatus(
  'vercel',
  deploymentId
);

console.log('Status:', status); // 'pending' | 'building' | 'ready' | 'failed'
```

### Getting Deployment Logs

```typescript
const logs = await deploymentService.getDeploymentLogs(
  'netlify',
  deploymentId
);

logs.forEach(log => console.log(log));
```

## Database Schema

### Deployments Table

Tracks all deployments across providers:

```typescript
{
  id: string;                    // Unique deployment ID
  appId: string;                 // Reference to app
  provider: DeploymentProvider;  // 'vercel' | 'netlify' | 'github-pages'
  deploymentId: string;          // Provider-specific ID
  buildId: string;               // Provider-specific build ID
  deploymentUrl: string;         // Primary deployment URL
  previewUrl: string;            // Preview/staging URL
  status: DeploymentStatus;      // Current status
  config: object;                // Provider configuration
  isProduction: boolean;         // Production flag
  errorMessage: string;          // Error details
  logs: string[];                // Deployment logs
  createdAt: Date;
  updatedAt: Date;
  deployedAt: Date;
}
```

### Deployment Credentials Table

Securely stores user deployment credentials:

```typescript
{
  id: string;
  userId: string;
  provider: DeploymentProvider;
  name: string;                  // User-friendly name
  encryptedCredentials: string;  // AES-256 encrypted
  credentialPreview: string;     // Masked preview
  isActive: boolean;
  isDefault: boolean;            // Default for this provider
  createdAt: Date;
  updatedAt: Date;
  lastUsed: Date;
}
```

## WebSocket Events

The deployment system broadcasts real-time updates via WebSocket:

### Deployment Started
```typescript
{
  type: 'deployment_started',
  provider: 'vercel',
  message: 'Starting deployment to Vercel...',
  deploymentId: 'dep_123'
}
```

### Deployment Progress
```typescript
{
  type: 'deployment_progress',
  provider: 'netlify',
  message: 'Building application...',
  deploymentId: 'dep_123',
  status: 'building'
}
```

### Deployment Completed
```typescript
{
  type: 'deployment_completed',
  provider: 'github-pages',
  message: 'Successfully deployed!',
  deploymentId: 'username/repo',
  deploymentUrl: 'https://username.github.io/repo',
  previewUrl: 'https://username.github.io/repo'
}
```

### Deployment Error
```typescript
{
  type: 'deployment_error',
  provider: 'vercel',
  message: 'Deployment failed',
  deploymentId: 'dep_123',
  error: 'Build error: Missing dependency'
}
```

## Provider-Specific Details

### Vercel

**Requirements:**
- Vercel API token
- Optional: Project ID for existing projects

**Configuration:**
```typescript
{
  apiToken: string;
  projectId?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  environmentVariables?: Record<string, string>;
}
```

**Features:**
- Automatic framework detection
- Edge function support
- Preview deployments
- Production deployments

### Netlify

**Requirements:**
- Netlify API token
- Optional: Site ID for existing sites

**Configuration:**
```typescript
{
  apiToken: string;
  siteId?: string;
  customDomain?: string;
}
```

**Features:**
- Automatic site creation
- File-based deployments
- Build logs
- Draft/production deployments

### GitHub Pages

**Requirements:**
- GitHub personal access token
- Repository name (format: `owner/repo`)
- Optional: Branch name (default: `gh-pages`)

**Configuration:**
```typescript
{
  githubToken: string;
  githubRepo: string;        // 'username/repo'
  githubBranch?: string;     // default: 'gh-pages'
}
```

**Features:**
- Automatic repository creation
- Branch-based deployments
- Public repositories
- Custom domains support

## Environment Variables

Add these to your `.dev.vars` file:

```env
# Vercel
VERCEL_API_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=your_project_id  # Optional

# Netlify
NETLIFY_API_TOKEN=your_netlify_token
NETLIFY_SITE_ID=your_site_id  # Optional

# GitHub Pages
GITHUB_TOKEN=your_github_token
GITHUB_REPO=username/repo-name
GITHUB_BRANCH=gh-pages  # Optional
```

## Adding a New Provider

1. **Create Provider Class**

```typescript
// worker/services/deployment/providers/my-provider.ts
export class MyProviderDeploymentProvider implements IDeploymentProvider {
  readonly name: DeploymentProvider = 'my-provider';

  async deploy(options: DeploymentOptions, config: DeploymentConfig): Promise<DeploymentResult> {
    // Implementation
  }

  async getDeploymentStatus(deploymentId: string, config: DeploymentConfig): Promise<DeploymentStatus> {
    // Implementation
  }
}
```

2. **Register in Factory**

```typescript
// worker/services/deployment/providers/index.ts
case 'my-provider':
  return new MyProviderDeploymentProvider();
```

3. **Update Types**

```typescript
// worker/services/deployment/types.ts
export type DeploymentProvider = 'cloudflare' | 'vercel' | 'netlify' | 'github-pages' | 'my-provider';
```

4. **Update Database Schema**

```typescript
// worker/database/schema.ts
const DEPLOYMENT_PROVIDER_VALUES = ['cloudflare', 'vercel', 'netlify', 'github-pages', 'my-provider'] as const;
```

## Security Considerations

- **Credential Encryption**: All deployment credentials are encrypted using AES-256
- **Token Storage**: API tokens should never be logged or exposed
- **Environment Variables**: Use `.dev.vars` for local development
- **Secrets Management**: Store credentials in Cloudflare Workers secrets for production
- **Access Control**: Credentials are user-specific and cannot be accessed by other users

## Best Practices

1. **Use Default Credentials**: Set a default credential for each provider to streamline deployments
2. **Monitor Status**: Always check deployment status after initiating deployment
3. **Handle Errors**: Implement proper error handling for failed deployments
4. **Log Management**: Review deployment logs for debugging
5. **Production Flag**: Use `production: true` for final deployments
6. **Environment Variables**: Configure environment variables per provider

## Troubleshooting

### Deployment Fails Immediately
- Check if credentials are valid
- Verify environment variables are set
- Ensure API tokens have correct permissions

### Build Fails
- Review deployment logs
- Check build command and output directory
- Verify all dependencies are included

### Status Stuck in "Building"
- Check provider dashboard for details
- Review deployment logs
- Consider timeout settings

## Future Enhancements

- [ ] Support for deployment rollbacks
- [ ] Deployment history and comparison
- [ ] Automated deployment testing
- [ ] Multi-region deployments
- [ ] Deployment webhooks
- [ ] Custom build configurations
- [ ] Environment-specific deployments
- [ ] Deployment templates
