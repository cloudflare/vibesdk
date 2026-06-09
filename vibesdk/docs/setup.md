# VibSDK Setup Guide

Local first time setup guide for VibSDK - get your AI coding platform running locally and also ready to be deployed. 

**Make sure to read through the entire guide for important notes, and have all the required information ready before starting.**

**Important Note: Cloudflare WARP has been known to cause issues with anonymous Cloudflared tunnels used in local development. It may cause previews to not load. If you experience issues with local development previews, try disabling WARP (full mode) while working with VibSDK. You may use WARP in DNS only (1.1.1.1) mode**

## Prerequisites

Before getting started, make sure you have:

### Required
- **Node.js** (v18 or later)
- **Cloudflare account** with API access  
- **Cloudflare API Token** with appropriate permissions

### Recommended
- **Bun**
- **Custom domain** configured in Cloudflare (for production deployment)

### For Production Features
- **Workers Paid Plan** (for remote Cloudflare resources)
- **Workers for Platforms** subscription (for app deployment features)
- **Advanced Certificate Manager** (if using first-level subdomains)

## Quick Start

The fastest way to get VibSDK running is with our automated setup script:

```bash
# Bun is recommended for the projec instead of npm. First install bun if you don't have it already
curl -fsSL https://bun.sh/install | bash
# Then install dependencies and run setup
bun install
bun run setup
```

This interactive script will guide you through the entire setup process, including:

- **Package manager setup** (installs Bun automatically for better performance)
- **Cloudflare credentials** collection (Account ID and API Token)
- **Domain configuration** (custom domain or localhost for development)
- **Remote setup** (optional production deployment configuration)
- **AI Gateway configuration** (Cloudflare AI Gateway recommended)
- **API key collection** (OpenAI, Anthropic, Google AI Studio, etc.)
- **OAuth setup** (Google, GitHub login - optional)
- **Resource creation** (KV namespaces, D1 databases, R2 buckets, AI Gateway)
- **File generation** (`.dev.vars` and optionally `.prod.vars`)
- **Configuration updates** (`wrangler.jsonc` and `vite.config.ts`)
- **Database setup** (schema generation and migrations)
- **Template deployment** (example app templates to R2)
- **Readiness report** (comprehensive status and next steps)

## What You'll Need During Setup

The setup script will ask you for the following information:

### Cloudflare Account Information

1. **Account ID**: Found in your Cloudflare dashboard sidebar
2. **API Token**: In you Cloudflare dashboard under "My Profile" > "API Tokens", create a token (Using the "Edit Cloudflare Workers" template is recommended) with the following configurations:
   - Your Account - Workers KV Storage:Edit, Workers Scripts:Edit, Account Settings:Read, Workers Tail:Read, Workers R2 Storage:Edit, Cloudflare Pages:Edit, Workers Builds Configuration:Edit, Workers Agents Configuration:Edit, Workers Observability:Edit, Containers:Edit, D1:Edit, AI Gateway:Read, AI Gateway:Edit, AI Gateway:Run, Cloudchamber:Edit, Browser Rendering:Edit
   - All zones - Workers Routes:Edit
   - All users - User Details:Read, Memberships:Read

   **If using the `Edit Cloudflare Workers` template, make sure to add the missing permissions above manually.**

   **Important**: Some features like D1 databases and R2 may require a paid Cloudflare plan.

### Domain Configuration

**With Custom Domain:**
```bash
Enter your custom domain (or press Enter to skip): myapp.com
✅ Custom domain set: myapp.com
Use remote Cloudflare resources (KV, D1, R2, etc.)? (Y/n): 
Configure for production deployment? (Y/n): 
```

**Without Custom Domain:**
```bash
Enter your custom domain (or press Enter to skip): [press Enter]
⚠️  No custom domain provided.
   • Remote Cloudflare resources: Not available
   • Production deployment: Not available
   • Only local development will be configured

Continue with local-only setup? (Y/n): 
```

### AI Gateway Configuration

**Cloudflare AI Gateway (Recommended)**
- **Automatic token setup**: When selected, `CLOUDFLARE_AI_GATEWAY_TOKEN` is automatically set to your API token
- **No manual configuration**: The script handles all AI Gateway authentication
- **Better performance**: Caching, rate limiting, and monitoring included

**Custom OpenAI URL (Alternative)**
- For users with existing OpenAI-compatible endpoints
- Requires manual model configuration in `worker/agents/inferutils/config.ts`

### AI Provider Selection

The setup script offers multiple AI providers with intelligent multi-selection:

**Available Providers:**
1. **OpenAI** (for GPT models)
2. **Anthropic** (for Claude models)  
3. **Google AI Studio** (for Gemini models) - **Default & Recommended**
4. **Cerebras** (for open source models)
5. **OpenRouter** (for various models)
6. **Custom provider** (for any other provider)

**Provider Selection:**
- Select multiple providers with comma-separated numbers (e.g., `1,2,3`)
- Each selected provider will prompt for its API key
- Custom providers automatically generate `PROVIDER_NAME_API_KEY` variables
- Custom providers are automatically added to `worker-configuration.d.ts`

### Important Model Configuration Notes

**Google AI Studio (Recommended):**
- Default model configurations use Gemini models
- No additional `worker/agents/inferutils/config.ts` editing required
- Best compatibility - This is the model used in the official deployment at https://build.cloudflare.dev
- You can get a free API key from https://aistudio.google.com/

**Other Providers:**
- **Strong warning**: You MUST edit `worker/agents/inferutils/config.ts` 
- Change default model configurations from Gemini to your selected providers
- Model format: `<provider-name>/<model-name>` (e.g., `openai/gpt-4`, `anthropic/claude-3.5-sonnet`)
- Review fallback model configurations

**Without AI Gateway:**
- **Manual config.ts editing required** for all model configurations
- Model names must follow `<provider-name>/<model-name>` format

### OAuth Configuration

The script will also ask for OAuth credentials:

- **Google OAuth**: For user authentication and login (not AI Studio access)
- **GitHub OAuth**: For user authentication and login
- **GitHub Export OAuth**: For exporting generated apps to GitHub repositories (separate from login OAuth)

**If you don't provide OAuth credentials, by default at login, you will only be able to use email-based registration/login.**

### Docker Requirement

For local development with sandbox instances, Docker is required. Make sure Docker is installed and running on your machine before running the platform.

## Manual Setup (Alternative)

If you prefer to set up manually:

### 1. Create `.dev.vars` file

Copy `.dev.vars.example` to `.dev.vars` and fill in your values:

```bash
cp .dev.vars.example .dev.vars
```

### 2. Configure Required Variables

```bash
# Essential
CLOUDFLARE_API_TOKEN="your-api-token"
CLOUDFLARE_ACCOUNT_ID="your-account-id"

# Security
JWT_SECRET="generated-secret"
WEBHOOK_SECRET="generated-secret"

# Domain (optional)
CUSTOM_DOMAIN="your-domain.com"
```

### 3. Create Cloudflare Resources

Create required resources in your Cloudflare account:
- KV Namespace for `VibecoderStore`
- D1 Database named `vibesdk-db`
- R2 Bucket named `vibesdk-templates`

### 4. Update `wrangler.jsonc`

Update resource IDs in `wrangler.jsonc` with the IDs from step 3.

## Starting Development

After setup is complete:

```bash
# Set up database
bun run db:migrate:local

# Start development server
bun run dev
```

Visit your app at `http://localhost:5173`

**Important Note**: If you didn't specifiy any oauth credentials during setup, You would need to register an account for the first time. 

## Troubleshooting

### Common Issues

**D1 Database "Unauthorized" Error**: This usually means:
- Your API token lacks "D1:Edit" permissions
- Your account doesn't have access to D1 (may require paid plan)
- You've exceeded your D1 database quota
- **Solution**: Update your API token permissions or upgrade your Cloudflare plan

**Permission Errors**: Ensure your API token has all required permissions listed above.

**Domain Not Found**: Make sure your domain is:
- Added to Cloudflare
- DNS is properly configured
- API token has zone permissions

**Resource Creation Failed**: Check that your account has:
- Available KV namespace quota (10 on free plan)
- D1 database quota (may require paid plan)
- R2 bucket quota (may require paid plan)
- Appropriate plan level for requested features

**R2 Bucket "Unauthorized" Error**: This usually means:
- Your API token lacks "R2:Edit" permissions
- Your account doesn't have access to R2 (may require paid plan)
- You've exceeded your R2 bucket quota
- **Solution**: Update your API token permissions or upgrade your Cloudflare plan

**AI Configuration Issues**:
- **"AI Gateway token already configured" but token not in .dev.vars**: Re-run setup, this was a bug that's now fixed
- **Models not working with custom providers**: Edit `worker/agents/inferutils/config.ts` to change default model configurations
- **Custom provider not recognized**: Check that the provider was added to `worker-configuration.d.ts`
- **AI Gateway creation failed**: Ensure your API token has AI Gateway permissions

**Local Development & Tunnel Issues**:
- **Cloudflared tunnel timeout**: Wait 20-30 seconds, then refresh. Tunnel creation can be slow
- **"Tunnel creation failed"**: This is normal occasionally. The app will still work with regular preview URLs
- **Sandbox instances dying**: Normal behavior if they restart successfully. Only worry if persistent
- **Preview URL not accessible**: Check if tunnel is still creating, or try refreshing the instance
- **Multiple port exposure issues on macOS**: Use tunnels (`USE_TUNNEL_FOR_PREVIEW=true`) - this is the default

**Deploy to Cloudflare Button Issues (Chat Interface)**:
- **"Deploy button not working locally"**: Chat interface deploy button requires custom domain, initial deployment, and remote dispatch bindings
- **"Dispatch namespace not found"**: Deploy your VibSDK project to Cloudflare at least once first
- **"Deploy fails with authentication error"**: Ensure your custom domain is properly configured and deployed
- **Note**: This refers to deploying generated apps from the chat interface, not GitHub repository deployments

**Corporate Network Issues**:
- **SSL/TLS certificate errors in Docker containers**: Corporate networks often use custom root CA certificates
- **Cloudflared tunnel failures**: May be blocked by corporate proxies or require certificate trust
- **Package installation failures**: npm/bun installs may fail due to certificate validation

**Corporate Network Solutions**:
If you're on a corporate network with custom SSL certificates, you'll need to modify the `SandboxDockerfile`:

1. **Copy your corporate root CA certificate** to the project root (don't commit to git!)
2. **Edit SandboxDockerfile** to include your certificate:

```dockerfile
# Add your company's Root CA certificate for corporate network access
COPY your-root-ca.pem /usr/local/share/ca-certificates/your-root-ca.crt
RUN update-ca-certificates

# Set SSL environment variables for cloudflared and other tools
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/your-root-ca.crt
ENV CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

**⚠️ Security Warning**: Never commit corporate CA certificates to public repositories. Use `.gitignore` to exclude certificate files and only use this for local development.

### Getting Help

1. Check the setup report for specific issues and suggestions
2. Review the Cloudflare Workers documentation
3. Ensure all prerequisites are met

## Production Deployment

If you configured remote deployment during setup, you'll have a `.prod.vars` file ready for production. Deploy with:

```bash
bun run deploy
```

This will:
- Build the application
- Update Cloudflare resources 
- Deploy to Cloudflare Workers
- Apply database migrations
- Configure custom domain routing (if specified)

### Production-Only Setup

If you only set up for local development initially, you can configure production later:

1. **Run setup again** and choose "yes" for remote deployment configuration
2. **Provide production domain** when prompted
3. **Deploy** using `npm run deploy`

### Manual Production Setup

Alternatively, create `.prod.vars` manually based on `.dev.vars` but with:
- Production domain in `CUSTOM_DOMAIN`
- Production API keys and secrets
- `ENVIRONMENT="prod"`

## Next Steps

Once setup is complete:

1. **Start developing** with `npm run dev`
2. **Visit** `http://localhost:5173` to access VibSDK
3. **Try generating** your first AI-powered application
4. **Deploy to production** when ready with `npm run deploy`

## File Structure After Setup

The setup script creates and modifies these files:

```
vibesdk/
├── .dev.vars              # Local development environment variables
├── .prod.vars             # Production environment variables (if configured)
├── wrangler.jsonc         # Updated with resource IDs and domain
├── vite.config.ts         # Updated for remote/local bindings
├── migrations/            # Database migration files
└── templates/             # Template repository (downloaded)
```

## Summary

The VibSDK setup script provides a comprehensive, intelligent configuration experience:

### **Key Features:**
- **Simplified domain setup** - One-time domain configuration with clear feature implications
- **Intelligent AI provider selection** - Multi-provider support with automatic configuration
- **AI Gateway automation** - Automatic token setup and configuration
- **Custom provider support** - Dynamic API key generation and worker configuration updates  
- **Production-ready** - Both local development and production deployment configuration
- **User-friendly defaults** - Y/n prompts with clear default indicators

### **What Gets Configured:**
- Cloudflare resources (KV, D1, R2, AI Gateway, dispatch namespaces)
- Environment variables (.dev.vars and .prod.vars)
- Worker configuration (wrangler.jsonc, worker-configuration.d.ts)
- Database setup and migrations
- Template deployment
- ARM64 compatibility

The setup script handles everything from basic Cloudflare resource creation to advanced AI provider configuration, making it easy to get started regardless of your Cloudflare plan or AI provider preferences.

For any issues during setup, check the troubleshooting section above or refer to the comprehensive status report the script provides at the end.

## Important Caveats & Known Issues

### **Local Development with Cloudflared Tunnels**

**Default Behavior**: Local development uses cloudflared tunnels by default (`USE_TUNNEL_FOR_PREVIEW=true`)

**Why Tunnels?**
- **MacBook compatibility**: Cloudflare sandbox SDK Docker images have issues with multiple exposed ports on macOS
- **Simplified networking**: Avoids complex localhost proxying setup
- **Quick development**: Provides immediate external access for testing

**Tunnel Limitations**:
- **Startup time**: Tunnel creation can take 10-20 seconds
- **Timeouts**: Tunnel creation may timeout occasionally (this is normal)
- **External dependency**: Requires internet connection and cloudflare.com access

### **"Deploy to Cloudflare" Button Limitations (Chat Interface)**

The "Deploy to Cloudflare" button in the chat interface (for generated apps) has specific requirements for local development:

> **Note**: This refers to the deployment button within the VibSDK platform's chat interface, not the GitHub repository deploy button.

**Requirements**:
1. **Custom domain** must be properly configured during setup
2. **Initial deployment** - Project must be deployed at least once to your Cloudflare account
3. **Remote dispatch bindings** - `wrangler.jsonc` must have remote dispatch namespace enabled
4. **Dispatch worker** - A dispatch worker must be running in your account

**Why These Requirements?**
- The deploy feature uses Cloudflare's dispatch namespace system
- Dispatch requires a running worker in your account to handle deployment requests
- Local-only development isn't yet supported for this in vibesdk

**Current Status**: Making "Deploy to Cloudflare" work completely in local-only mode is not yet implemented.

### **Sandbox Instance Behavior**

**Normal Behavior**:
- **Instance restarts**: Sandbox deployments may occasionally die and restart
- **Temporary failures**: Short-term deployment failures are expected
- **Self-healing**: The system will retry and recover automatically

**When to Be Concerned**:
- Consistent failures over 5+ minutes
- Complete inability to create instances
- Persistent networking issues

**What's Normal**:
- Individual instance failures that resolve quickly
- Occasional tunnel connection issues
- Brief periods of unavailability during restarts If issue persists, please open an issue on GitHub with the status report and any additional information you think would be helpful.
