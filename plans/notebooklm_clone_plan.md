# NotebookLM Clone Implementation Plan (Based on InsightsLM)

## Project Overview
InsightsLM is an open-source, self-hostable alternative to Google's NotebookLM. It allows users to upload documents and get AI-powered insights, chat with their documents, and generate audio summaries.

## Architecture Components

### Frontend (React + TypeScript)
- **Framework**: Vite + React + TypeScript
- **UI Library**: shadcn/ui with Tailwind CSS
- **State Management**: React hooks + TanStack Query
- **Routing**: React Router DOM
- **Authentication**: Custom AuthContext with Supabase Auth

### Backend Services
1. **Supabase** (Database, Authentication, Storage, Edge Functions)
   - PostgreSQL database with vector embeddings support
   - Row Level Security (RLS) for data protection
   - Storage buckets for document and audio files
   - Edge functions for API endpoints

2. **n8n** (Workflow Automation)
   - Document processing workflows
   - Chat interaction workflows
   - Audio generation workflows
   - Vector store operations

### Data Flow
1. User uploads documents via frontend
2. Frontend uploads to Supabase storage
3. Supabase edge function triggers n8n workflow
4. n8n processes document (extracts text, creates embeddings)
5. Embeddings stored in Supabase vector store
6. User chats with documents via frontend
7. Frontend sends query to Supabase edge function
8. Supabase forwards to n8n chat workflow
9. n8n retrieves relevant chunks from vector store
10. AI model generates response with citations
11. Response returned to frontend

## Key Agents Needed for Development

### 1. Project Manager (PM) Agent
- **Role**: Oversee the entire implementation process
- **Skills**: Project planning, timeline management, resource allocation
- **Responsibilities**: Coordinate between different specialists, track progress, ensure milestones are met

### 2. Full Stack Developer Agent
- **Role**: Implement frontend and integrate with backend services
- **Skills**: React, TypeScript, Supabase integration, API development
- **Responsibilities**: Build UI components, implement authentication, connect to Supabase and n8n APIs

### 3. Backend Architect Agent
- **Role**: Configure Supabase infrastructure and n8n workflows
- **Skills**: Database design, Supabase configuration, n8n workflow design
- **Responsibilities**: Set up database schema, configure RLS policies, implement edge functions

### 4. DevOps/QA Agent
- **Role**: Deployment, testing, and infrastructure management
- **Skills**: CI/CD, testing, cloud infrastructure, security
- **Responsibilities**: Deploy to production, perform testing, monitor performance, ensure security

### 5. AI Integration Specialist Agent
- **Role**: Configure AI models and vector processing
- **Skills**: AI/ML, embeddings, vector databases, LLM integration
- **Responsibilities**: Set up OpenAI/Gemini integration, optimize vector search, tune AI prompts

## Implementation Strategy

### Phase 1: Environment Setup
1. Set up development environment with Node.js, Bun, Git
2. Create Supabase account and project
3. Create n8n account (self-hosted or cloud)
4. Obtain API keys for AI services (OpenAI, Google Gemini, etc.)

### Phase 2: Backend Configuration
1. Apply database migrations to Supabase
2. Configure Supabase authentication settings
3. Set up storage buckets with proper RLS policies
4. Deploy edge functions to Supabase
5. Configure n8n workflows with proper credentials

### Phase 3: Frontend Development
1. Install dependencies (`bun install`)
2. Configure environment variables
3. Implement core UI components (dashboard, notebook view, chat interface)
4. Integrate with Supabase authentication
5. Connect to document upload and chat APIs

### Phase 4: Integration & Testing
1. Test document upload and processing workflow
2. Verify chat functionality with citations
3. Test audio generation features
4. Perform security and performance testing
5. Optimize for production deployment

## Deployment Strategy

### Option 1: Self-Hosted (Recommended for privacy)
- Frontend: Deploy to Vercel, Netlify, or similar
- Backend: Supabase (hosted) + Self-hosted n8n
- Domain: Custom domain with SSL

### Option 2: Cloud Deployment
- Frontend: Vercel/Netlify
- Backend: Supabase (hosted) + n8n Cloud
- More convenient but less control over data

### Required Environment Variables
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_key
GOOGLE_API_KEY=your_google_api_key
OPENAI_API_KEY=your_openai_key (if using OpenAI)
```

### n8n Webhook URLs (to be configured in Supabase secrets):
- NOTEBOOK_CHAT_URL
- NOTEBOOK_GENERATION_URL
- AUDIO_GENERATION_WEBHOOK_URL
- DOCUMENT_PROCESSING_WEBHOOK_URL
- ADDITIONAL_SOURCES_WEBHOOK_URL
- NOTEBOOK_GENERATION_AUTH (password for webhook authentication)

## Key Features to Implement

1. **Document Upload & Processing**
   - Support for PDF, TXT, DOC, DOCX, audio files
   - Automatic text extraction
   - Vector embedding generation

2. **Chat Interface**
   - Conversational AI with document context
   - Source citations for AI responses
   - Chat history persistence

3. **Audio Generation**
   - Podcast-style audio summaries
   - Text-to-speech capabilities

4. **User Management**
   - Authentication and authorization
   - Personal notebooks and documents
   - Privacy controls

## Success Criteria
- Document upload and processing works correctly
- Chat functionality returns relevant answers with citations
- Audio generation works for notebook summaries
- Application is secure and performs well
- All components are properly integrated