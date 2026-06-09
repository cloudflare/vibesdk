# Cloudflare Orange Build - Architecture Diagrams

This document contains comprehensive Mermaid diagrams representing the architecture of the Cloudflare Orange Build project.

## Presentation-Ready Architecture Diagram

*Copy-paste this beautiful diagram directly into your slides*

```mermaid
graph TB
    %% User Interface Layer
    subgraph "🖥️ Frontend (React + Vite)"
        UI["🎨 User Interface<br/>Dashboard & Chat"]
        Chat["💬 Real-time Chat<br/>WebSocket Connection"]
        Preview["👁️ Live Preview<br/>Sandbox Integration"]
    end
    
    %% API Gateway Layer
    subgraph "🚦 API Gateway Layer"
        APIRouter["🌐 API Router<br/>Hono Framework"]
    end
    
    %% Core Backend Services
    subgraph "🔐 Core Services (Cloudflare Workers)"
        Auth["🔑 Auth Service<br/>JWT + OAuth"]
        AgentController["🎛️ Agent Controller<br/>WebSocket Manager"]
        SandboxService["📦 Sandbox Service<br/>Container Orchestration"]
    end
    
    %% Agent System (Durable Objects)
    subgraph "🤖 Agent System (Durable Objects)"
        CodeGenAgent["⚡ Code Generator Agent<br/>Deterministic State Machine"]
        AgentState["💾 Agent State<br/>Persistent in Durable Object"]
    end
    
    %% AI Operations Pipeline
    subgraph "🧠 AI Operations Pipeline"
        BlueprintGen["📋 Blueprint Generation"]
        PhaseGen["📈 Phase Planning"]
        PhaseImpl["⚙️ Implementation"]
        CodeReview["🔍 Code Review"]
        CodeFixer["🛠️ Real-time Fixing"]
    end
    
    %% Storage & Infrastructure
    subgraph "☁️ Cloudflare Infrastructure"
        D1["🗄️ D1 Database<br/>User Data + Apps"]
        KV["🔗 KV Storage<br/>Sessions + Cache"]
        R2["📁 R2 Storage<br/>Templates + Assets"]
        Containers["🐳 Containers<br/>Sandbox Runtime"]
        AIGateway["🚪 AI Gateway<br/>Multi-Provider Router"]
    end
    
    %% External AI Providers
    subgraph "🤖 AI Providers"
        Gemini["💎 Gemini (Primary)"]
        OpenAI["🧠 OpenAI GPT-4"]
        Claude["🎭 Anthropic Claude"]
        Cerebras["🧪 Cerebras"]
    end
    
    %% External Services
    subgraph "🌍 External Services"
        GitHub["🐙 GitHub API"]
        OAuth["🔐 OAuth Providers"]
    end
    
    %% Request Flow
    UI --> APIRouter
    Chat --> APIRouter
    Preview --> APIRouter
    
    APIRouter --> Auth
    APIRouter --> AgentController  
    APIRouter --> SandboxService
    
    %% Agent Orchestration
    AgentController --> CodeGenAgent
    CodeGenAgent -.-> AgentState
    CodeGenAgent --> SandboxService
    
    %% AI Operations Flow
    CodeGenAgent --> BlueprintGen
    CodeGenAgent --> PhaseGen
    CodeGenAgent --> PhaseImpl
    CodeGenAgent --> CodeReview
    CodeGenAgent --> CodeFixer
    
    %% Data Persistence
    Auth --> D1
    AgentController --> KV
    SandboxService --> R2
    SandboxService --> Containers
    BlueprintGen --> R2
    
    %% AI Gateway Routing
    BlueprintGen --> AIGateway
    PhaseGen --> AIGateway
    PhaseImpl --> AIGateway
    CodeReview --> AIGateway
    CodeFixer --> AIGateway
    
    AIGateway --> Gemini
    AIGateway --> OpenAI
    AIGateway --> Claude
    AIGateway --> Cerebras
    
    %% External Integrations
    Auth --> OAuth
    SandboxService --> GitHub
    
    %% Styling
    classDef frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000
    classDef router fill:#fff8e1,stroke:#f57f17,stroke-width:2px,color:#000
    classDef backend fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#000
    classDef agent fill:#ff9900,stroke:#cc7a00,stroke-width:3px,color:#fff
    classDef ai fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000
    classDef infra fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px,color:#000
    classDef aiproviders fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#000
    classDef external fill:#f1f8e9,stroke:#33691e,stroke-width:2px,color:#000
    
    class UI,Chat,Preview frontend
    class APIRouter router
    class Auth,AgentController,SandboxService backend
    class CodeGenAgent,AgentState agent
    class BlueprintGen,PhaseGen,PhaseImpl,CodeReview,CodeFixer ai
    class D1,KV,R2,Containers,AIGateway infra
    class Gemini,OpenAI,Claude,Cerebras aiproviders
    class GitHub,OAuth external
```

---

## Detailed System Diagrams

### 1. Overall System Architecture

```mermaid
graph TB
    subgraph "Frontend (Vite + React)"
        UI[User Interface]
        Chat[Chat Interface]
        Preview[Live Preview]
        Dashboard[User Dashboard]
    end
    
    subgraph "Cloudflare Workers (Backend)"
        APIRouter[API Router]
        Auth[Auth Service]
        AgentController[Agent Controller]
        SandboxService[Sandbox Service]
        
        subgraph "Agents SDK (Durable Objects)"
            CodeGenAgent[Code Generator Agent]
            AgentState[Agent State & Context]
        end
    end
    
    subgraph "AI Operations"
        BlueprintGen[Blueprint Generation]
        PhaseGen[Phase Generation]
        PhaseImpl[Phase Implementation]
        CodeReview[Code Review]
        RealtimeCodeFixer[Realtime Code Fixer]
        FastCodeFixer[Fast Code Fixer]
        FileRegen[File Regeneration]
        UserConvProcessor[User Conversation Processor]
    end
    
    subgraph "Cloudflare Infrastructure"
        D1[(D1 Database)]
        KV[KV Storage]
        R2[R2 Object Storage]
        Containers[Cloudflare Containers]
        Workers[Workers Runtime]
        AIGateway[AI Gateway]
    end
    
    subgraph "External Services"
        OpenAI[OpenAI API]
        GitHub[GitHub API]
        OAuth[OAuth Providers]
    end
    
    UI --> APIRouter
    Chat --> APIRouter
    Preview --> APIRouter
    Dashboard --> APIRouter
    
    APIRouter --> Auth
    APIRouter --> AgentController
    APIRouter --> SandboxService
    AgentController --> CodeGenAgent
    CodeGenAgent --> SandboxService
    CodeGenAgent --> BlueprintGen
    CodeGenAgent --> PhaseGen
    CodeGenAgent --> PhaseImpl
    CodeGenAgent --> CodeReview
    CodeGenAgent --> RealtimeCodeFixer
    CodeGenAgent --> FastCodeFixer
    CodeGenAgent --> FileRegen
    CodeGenAgent --> UserConvProcessor
    
    Auth --> D1
    AgentState --> D1
    SandboxService --> Containers
    SandboxService --> R2
    
    BlueprintGen --> AIGateway
    PhaseGen --> AIGateway
    PhaseImpl --> AIGateway
    CodeReview --> AIGateway
    RealtimeCodeFixer --> AIGateway
    FastCodeFixer --> AIGateway
    FileRegen --> AIGateway
    UserConvProcessor --> AIGateway
    AIGateway --> OpenAI
    
    Auth --> OAuth
    SandboxService --> GitHub
    AgentController --> KV
    
    style CodeGenAgent fill:#ff9900
    style AIGateway fill:#ff9900
    style D1 fill:#ff9900
    style Containers fill:#ff9900
```

## 2. Hybrid Agent System Architecture

```mermaid
graph TB
    subgraph "Single Orchestrating Agent (Cloudflare Agents SDK)"
        Agent[Code Generator Agent]
        StateMachine[Deterministic State Machine]
        AgentState[Shared Agent State]
        WebSocket[WebSocket Broadcasting]
    end
    
    subgraph "Specialized AI Operations"
        BlueprintOp[Blueprint Generation<br/>PRD & Template Selection]
        PhaseGen[Phase Generation<br/>Planning & Strategy]
        PhaseImpl[Phase Implementation<br/>File Generation]
        CodeReview[Code Review<br/>Issue Detection]
        RealtimeCodeFixer[Realtime Code Fixer<br/>Runtime Error Resolution]
        FastCodeFixer[Fast Code Fixer<br/>Quick Issue Fixes]
        FileRegen[File Regeneration<br/>Surgical Code Fixes]
        UserConvProcessor[User Conversation Processor<br/>User Feedback Integration]
    end
    
    subgraph "Deterministic Orchestration Logic"
        PhaseManager[Phase Manager]
        UserInputHandler[User Input Handler]
        FileManager[File Content Manager]
        ErrorHandler[Error Recovery System]
    end
    
    subgraph "AI Integration Layer"
        AIGateway[Cloudflare AI Gateway]
        PromptSystem[Dynamic Prompt System]
        StreamingFormat[SCOF Streaming Format]
    end
    
    Agent --> StateMachine
    StateMachine --> PhaseManager
    StateMachine --> UserInputHandler
    StateMachine --> FileManager
    StateMachine --> ErrorHandler
    
    PhaseManager --> BlueprintOp
    PhaseManager --> PhaseGen
    PhaseManager --> PhaseImpl
    PhaseManager --> UserConvProcessor
    
    ErrorHandler --> CodeReview
    ErrorHandler --> RealtimeCodeFixer
    ErrorHandler --> FastCodeFixer
    ErrorHandler --> FileRegen
    
    BlueprintOp --> AIGateway
    PhaseGen --> AIGateway
    PhaseImpl --> AIGateway
    CodeReview --> AIGateway
    RealtimeCodeFixer --> AIGateway
    FastCodeFixer --> AIGateway
    FileRegen --> AIGateway
    UserConvProcessor --> AIGateway
    
    AIGateway --> PromptSystem
    AIGateway --> StreamingFormat
    
    Agent --> AgentState
    Agent --> WebSocket
    
    BlueprintOp -.-> AgentState
    PhaseGen -.-> AgentState
    PhaseImpl -.-> AgentState
    CodeReview -.-> AgentState
    RealtimeCodeFixer -.-> AgentState
    FastCodeFixer -.-> AgentState
    FileRegen -.-> AgentState
    UserConvProcessor -.-> AgentState
    
    style Agent fill:#ff9900
    style StateMachine fill:#ffcc66
    style AIGateway fill:#ff9900
```

## 3. Authentication & User Management Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant AuthController
    participant OAuth
    participant D1
    participant JWT
    
    User->>Frontend: Login Request
    Frontend->>AuthController: POST /api/auth/providers
    AuthController->>Frontend: Available auth methods
    
    alt OAuth Flow
        Frontend->>AuthController: POST /api/auth/oauth/github
        AuthController->>OAuth: Redirect to GitHub
        OAuth->>User: Authorization page
        User->>OAuth: Grant permission
        OAuth->>AuthController: Callback with code
        AuthController->>OAuth: Exchange code for tokens
        OAuth->>AuthController: User profile + tokens
        AuthController->>D1: Store/update user
        AuthController->>JWT: Generate tokens
        JWT->>AuthController: Access/Refresh tokens
        AuthController->>Frontend: Set HTTP-only cookies
    else Email/Password Flow
        Frontend->>AuthController: POST /api/auth/login
        AuthController->>D1: Verify credentials
        D1->>AuthController: User data
        AuthController->>JWT: Generate tokens
        JWT->>AuthController: Access/Refresh tokens
        AuthController->>Frontend: Set HTTP-only cookies
    end
    
    Frontend->>User: Login success
    
    Note over AuthController,D1: Session stored in D1<br/>JWT tokens in HTTP-only cookies<br/>Automatic token refresh
```

## 4. Sandbox System & Deployment Pipeline

```mermaid
graph TD
    subgraph "User Request"
        UserInput[User Prompt]
        ChatInterface[Chat Interface]
    end
    
    subgraph "Code Generation Phase"
        Agent[Smart Agent]
        CodeGen[Code Generation]
        FileSystem[Generated Files]
    end
    
    subgraph "Sandbox System"
        SandboxSDK[Cloudflare Sandbox SDK]
        Container[Isolated Container]
        LivePreview[Live Preview Server]
        ResourceProv[Resource Provisioner]
        TemplateParser[Template Parser]
        ConfigKV[Configuration Storage<br/>KV-based wrangler.jsonc]
    end
    
    subgraph "Quality Assurance"
        RuntimeCheck[Runtime Error Detection]
        StaticAnalysis[Static Analysis]
        CodeFixer[Auto Code Fixing]
    end
    
    subgraph "Deployment Options"
        WorkersDev[workers.dev Deployment]
        DispatchNamespace[Dispatch Namespace]
        GitHubExport[GitHub Export]
    end
    
    subgraph "Cloudflare Resources"
        D1DB[(Auto-provisioned D1)]
        KVStore[Auto-provisioned KV]
        CFWorkers[Cloudflare Workers]
    end
    
    UserInput --> ChatInterface
    ChatInterface --> Agent
    Agent --> CodeGen
    CodeGen --> FileSystem
    
    FileSystem --> SandboxSDK
    SandboxSDK --> Container
    Container --> LivePreview
    
    LivePreview --> RuntimeCheck
    RuntimeCheck --> StaticAnalysis
    StaticAnalysis --> CodeFixer
    CodeFixer --> FileSystem
    
    FileSystem --> ResourceProv
    ResourceProv --> D1DB
    ResourceProv --> KVStore
    
    Container --> TemplateParser
    TemplateParser --> WorkersDev
    TemplateParser --> DispatchNamespace
    TemplateParser --> GitHubExport
    
    WorkersDev --> CFWorkers
    DispatchNamespace --> CFWorkers
    
    style SandboxSDK fill:#ff9900
    style Container fill:#ff9900
    style D1DB fill:#ff9900
    style KVStore fill:#ff9900
    style CFWorkers fill:#ff9900
```

## 5. Database Schema & Relationships

```mermaid
erDiagram
    users {
        text id PK
        text email UK
        text username UK
        text password_hash
        text full_name
        text avatar_url
        text verification_token
        integer email_verified
        timestamp created_at
        timestamp updated_at
    }
    
    sessions {
        text id PK
        text user_id FK
        text access_token
        text refresh_token
        timestamp expires_at
        timestamp created_at
    }
    
    teams {
        text id PK
        text name
        text slug UK
        text description
        text avatar_url
        text owner_id FK
        timestamp created_at
    }
    
    team_members {
        text team_id FK
        text user_id FK
        text role
        timestamp joined_at
    }
    
    apps {
        text id PK
        text title
        text description
        text slug
        text icon_url
        text original_prompt
        text final_prompt
        json blueprint
        text framework
        text user_id FK
        text team_id FK
        text session_token
        text visibility
        text board_id FK
        text status
        text deployment_url
        text cloudflare_account_id
        text deployment_status
        json deployment_metadata
        text github_repository_url
        text github_repository_visibility
        integer is_archived
        integer is_featured
        integer version
        text parent_app_id
        text screenshot_url
        timestamp screenshot_captured_at
        timestamp created_at
        timestamp updated_at
        timestamp last_deployed_at
    }
    
    cloudflare_accounts {
        text id PK
        text user_id FK
        text team_id FK
        text account_id
        text encrypted_api_token
        text account_name
        timestamp created_at
    }
    
    github_integrations {
        text id PK
        text user_id FK
        text team_id FK
        text github_username
        text encrypted_access_token
        json repositories
        timestamp created_at
    }
    
    boards {
        text id PK
        text name
        text description
        text slug UK
        text creator_id FK
        integer is_public
        timestamp created_at
    }
    
    users ||--o{ sessions : has
    users ||--o{ teams : owns
    users ||--o{ team_members : belongs_to
    teams ||--o{ team_members : has
    users ||--o{ apps : creates
    teams ||--o{ apps : owns
    users ||--o{ cloudflare_accounts : has
    teams ||--o{ cloudflare_accounts : has
    users ||--o{ github_integrations : has
    teams ||--o{ github_integrations : has
    users ||--o{ boards : creates
    boards ||--o{ apps : contains

## 6. User Journey Flow - App Creation to Deployment

```mermaid
journey
    title User Creates and Deploys an App
    section Getting Started
      Visit Homepage: 5: User
      Enter App Description: 4: User
      Start Generation: 5: User
    section Code Generation
      AI Creates Blueprint: 3: System
      Phase-wise Implementation: 4: System
      Real-time Code Review: 4: System
      Error Detection & Fixing: 3: System
    section Live Preview
      Sandbox Container Starts: 5: System
      Live Preview Available: 5: User
      Runtime Error Detection: 4: System
      Iterative Improvements: 4: User, System
    section Quality Assurance
      Static Analysis: 4: System
      Code Review Cycle: 3: System
      Auto-fix Critical Issues: 4: System
      User Feedback Integration: 5: User
    section Deployment
      Resource Provisioning: 3: System
      Template Parsing: 3: System
      Cloudflare Workers Deploy: 5: System
      Live App URL Generated: 5: User
    section Post-Deployment
      Save to Dashboard: 4: User
      Share with Community: 3: User
      GitHub Export: 4: User
```

## 7. Real-time Communication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Agent
    participant AIGateway
    participant Sandbox
    participant WebSocket
    
    User->>Frontend: Send message
    Frontend->>Agent: WebSocket message
    Agent->>WebSocket: Broadcast generation_started
    WebSocket->>Frontend: Real-time update
    
    loop Phase Generation
        Agent->>AIGateway: Phase planning request
        AIGateway->>Agent: Streaming response
        Agent->>WebSocket: Broadcast phase_update
        WebSocket->>Frontend: Live phase progress
    end
    
    loop Code Implementation
        Agent->>AIGateway: Code generation request
        AIGateway->>Agent: SCOF streaming format
        Agent->>WebSocket: Broadcast file_generated
        WebSocket->>Frontend: Live file updates
    end
    
    Agent->>Sandbox: Deploy to container
    Sandbox->>Agent: Preview URL ready
    Agent->>WebSocket: Broadcast preview_ready
    WebSocket->>Frontend: Preview available
    
    loop Quality Assurance
        Sandbox->>Agent: Runtime errors detected
        Agent->>AIGateway: Fix generation request
        AIGateway->>Agent: Fixed code
        Agent->>Sandbox: Update files
        Agent->>WebSocket: Broadcast fixes_applied
        WebSocket->>Frontend: Updated preview
    end
    
    User->>Frontend: Deploy to Cloudflare
    Frontend->>Agent: Deploy request
    Agent->>Sandbox: Trigger deployment
    Sandbox->>Agent: Deployment complete
    Agent->>WebSocket: Broadcast deployment_complete
    WebSocket->>Frontend: Live app URL
```

## 8. AI Operations Pipeline

```mermaid
flowchart TD
    %% User Input
    Input["🗣️ User Prompt<br/>Natural Language Request"]
    
    %% Planning Phase
    subgraph "📋 Planning Phase"
        TemplateSelection["🏷️ Template Selection<br/>Cloudflare Stack Templates"]
        BlueprintGen["🏠 Blueprint Generation<br/>PRD + Architecture Design"]
    end
    
    %% State Machine Controller
    subgraph "🤖 Deterministic State Machine"
        StateMachine["⚙️ Agent State Controller<br/>generateAllFiles()"]
        
        subgraph "🔄 State Transitions"
            PhaseGenerating["📈 PHASE_GENERATING"]
            PhaseImplementing["🚀 PHASE_IMPLEMENTING"]
            Reviewing["🔍 REVIEWING"]
            Finalizing["✨ FINALIZING"]
            Idle["✅ IDLE"]
        end
    end
    
    %% Operations Layer
    subgraph "🧠 AI Operations"
        PhaseGenOp["📈 Phase Generation<br/>Development Phases"]
        PhaseImplOp["🚀 Phase Implementation<br/>File Generation + SCOF"]
        CodeReviewOp["🔍 Code Review<br/>Issue Detection"]
        FastCodeFixerOp["⚡ Fast Code Fixer<br/>Quick Issue Fixes"]
        FileRegenOp["🛠️ File Regeneration<br/>Surgical Code Repairs"]
        ScreenshotAnalysisOp["📷 Screenshot Analysis<br/>Visual Validation"]
        UserConvOp["💬 User Conversation<br/>Feedback Processing"]
    end
    
    %% Quality Assurance
    subgraph "🔍 Quality Assurance"
        ReviewCycles["🔄 Review Cycles<br/>Up to 5 iterations"]
        IssueCheck{{"⚠️ Issues Found?"}}
        StaticAnalysis["📊 Static Analysis<br/>Code Validation"]
    end
    
    %% External Integration
    subgraph "🤖 AI Gateway"
        AIGateway["🚪 Cloudflare AI Gateway<br/>Multi-Provider Router"]
        
        subgraph "🌐 AI Providers"
            Gemini["💎 Gemini (Primary)"]
            GPT["🧠 GPT-4"]
            Claude["🎭 Claude"]
            Cerebras["🧪 Cerebras"]
        end
    end
    
    %% Main Flow
    Input --> TemplateSelection
    TemplateSelection --> BlueprintGen
    BlueprintGen --> StateMachine
    
    %% State Machine Flow
    StateMachine --> PhaseGenerating
    PhaseGenerating --> PhaseImplementing
    PhaseImplementing --> Reviewing
    Reviewing --> Finalizing
    Finalizing --> Idle
    
    %% Operations Execution
    PhaseGenerating --> PhaseGenOp
    PhaseImplementing --> PhaseImplOp
    Reviewing --> CodeReviewOp
    
    %% Quality Control Loop
    CodeReviewOp --> ReviewCycles
    ReviewCycles --> IssueCheck
    IssueCheck -->|"✅ Yes"| FastCodeFixerOp
    IssueCheck -->|"✅ Yes"| FileRegenOp
    IssueCheck -->|"❌ No"| StaticAnalysis
    FastCodeFixerOp --> PhaseImplementing
    FileRegenOp --> PhaseImplementing
    
    %% User Interaction
    UserConvOp --> PhaseGenerating
    ScreenshotAnalysisOp --> CodeReviewOp
    
    %% AI Integration
    TemplateSelection --> AIGateway
    BlueprintGen --> AIGateway
    PhaseGenOp --> AIGateway
    PhaseImplOp --> AIGateway
    CodeReviewOp --> AIGateway
    FastCodeFixerOp --> AIGateway
    FileRegenOp --> AIGateway
    ScreenshotAnalysisOp --> AIGateway
    UserConvOp --> AIGateway
    
    AIGateway --> Gemini
    AIGateway --> GPT
    AIGateway --> Claude
    AIGateway --> Cerebras
    
    %% Enhanced Styling
    classDef planning fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#000
    classDef statemachine fill:#fff3e0,stroke:#f57c00,stroke-width:3px,color:#000
    classDef states fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef operations fill:#e8f5e8,stroke:#388e3c,stroke-width:2px,color:#000
    classDef quality fill:#ffebee,stroke:#d32f2f,stroke-width:2px,color:#000
    classDef ai fill:#ff9900,stroke:#cc7a00,stroke-width:3px,color:#fff
    classDef decision fill:#fff8e1,stroke:#f57f17,stroke-width:2px,color:#000
    classDef success fill:#66ff66,stroke:#2e7d32,stroke-width:3px,color:#000
    classDef providers fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000
    
    class Input,TemplateSelection,BlueprintGen planning
    class StateMachine statemachine
    class PhaseGenerating,PhaseImplementing,Reviewing,Finalizing states
    class Idle success
    class PhaseGenOp,PhaseImplOp,CodeReviewOp,FastCodeFixerOp,FileRegenOp,ScreenshotAnalysisOp,UserConvOp operations
    class ReviewCycles,StaticAnalysis quality
    class IssueCheck decision
    class AIGateway ai
    class Gemini,GPT,Claude,Cerebras providers
```

## 9. Technology Stack Overview

```mermaid
graph TB
    subgraph "Frontend Layer"
        React[React 18]
        Vite[Vite Build Tool]
        TailwindCSS[Tailwind CSS]
        ShadcnUI[shadcn/ui Components]
        ReactRouter[React Router]
    end
    
    subgraph "Backend Layer"
        CFWorkers[Cloudflare Workers]
        AgentsSDK[Cloudflare Agents SDK]
        TypeScript[TypeScript]
        HonoRouter[Hono Router]
        AuthMiddleware[Auth Middleware]
        BaseController[Base Controller]
    end
    
    subgraph "Data Layer"
        D1[Cloudflare D1 SQLite]
        Drizzle[Drizzle ORM]
        KV[Cloudflare KV]
        R2[Cloudflare R2]
        DatabaseService[Database Service]
        UserService[User Service]
        AppService[App Service]
        AuthService[Auth Service]
    end
    
    subgraph "AI & External Services"
        AIGateway[Cloudflare AI Gateway]
        OpenAI[OpenAI GPT-4]
        GitHubAPI[GitHub API]
        OAuth[OAuth Providers]
    end
    
    subgraph "Infrastructure"
        CFContainers[Cloudflare Containers]
        SandboxSDK[Cloudflare Sandbox SDK]
        WebSockets[WebSocket API]
        WorkersAnalytics[Workers Analytics]
    end
    
    React --> CFWorkers
    Vite --> React
    TailwindCSS --> React
    ShadcnUI --> React
    ReactRouter --> React
    
    CFWorkers --> AgentsSDK
    TypeScript --> CFWorkers
    HonoRouter --> CFWorkers
    AuthMiddleware --> CFWorkers
    BaseController --> CFWorkers
    
    CFWorkers --> DatabaseService
    DatabaseService --> Drizzle
    Drizzle --> D1
    DatabaseService --> UserService
    DatabaseService --> AppService
    DatabaseService --> AuthService
    CFWorkers --> KV
    CFWorkers --> R2
    
    CFWorkers --> AIGateway
    AIGateway --> OpenAI
    CFWorkers --> GitHubAPI
    CFWorkers --> OAuth
    
    CFWorkers --> CFContainers
    CFContainers --> SandboxSDK
    CFWorkers --> WebSockets
    CFWorkers --> WorkersAnalytics
    
    style CFWorkers fill:#ff9900
    style AgentsSDK fill:#ff9900
    style D1 fill:#ff9900
    style AIGateway fill:#ff9900
    style CFContainers fill:#ff9900
```
