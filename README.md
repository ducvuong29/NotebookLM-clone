# NotebookLM Clone

> An open-source, self-hosted alternative to NotebookLM designed to be a powerful AI research tool that grounds its responses exclusively in the sources you provide, making it a reliable window into your knowledge base.

## About The Project

NotebookLM is one of the most powerful AI research tools available today. However, its closed-source nature limits its potential for customization and private hosting. This project was created to bridge this gap.

It's a robust application featuring a modern React/Vite frontend and a powerful backend combination of Supabase and n8n.

## Key Features

* **Chat with Your Documents:** Upload your documents and get instant, context-aware answers.
* **Verifiable Citations:** Jump directly to the source of the information to ensure the AI isn't hallucinating.
* **Podcast Generation:** Create audio summaries and discussions from your source materials, just like in NotebookLM.
* **Private and Self-Hosted:** Maintain complete control over your data by hosting it yourself. Use local models if you wish.
* **Customizable and Extensible:** Built with modern, accessible tools, making it easy to tailor to your specific needs.

## Built With

This project is built with a modern, powerful stack:
* **Frontend:** 
    * Vite, React, TypeScript
    * shadcn-ui, Tailwind CSS
* **Backend:**
    * [Supabase](https://supabase.com/) - for database, authentication, and storage.
    * [N8N](https://n8n.io) - for workflow automation and backend logic.


## Important: Recent Changes

> ⚠️ **Authentication Update**
>
> Supabase has introduced a new authentication system and is moving towards new publishable + secret keys in place of the anon + service role secret. As a result, the edge functions in this repository have been updated to handle security, authentication, and authorization within the code of the function itself. **Do NOT enable the "Verify JWT" flag on the functions.**

---

## 🛠️ Getting Started: Local Development Guide

This guide will walk you through setting up the NotebookLM Clone entirely on your local machine.

### 1. Prerequisites
Ensure you have the following installed:
- **Node.js** (v18+ recommended)
- **Bun** (Required package manager for this project)
- **Git**
- **Supabase CLI** (Required for database and edge functions deployment)
- **Docker Compose** (Required for self-hosting n8n)

### 2. Standard Repository Setup
Clone the GitHub repository and install the dependencies.
```bash
git clone https://github.com/theaiautomators/insights-lm-public.git
cd insights-lm-public

# Install frontend dependencies using Bun
bun install
```

### 3. Supabase Cloud Setup
We will connect your local development environment to a Supabase Cloud project.

First, ensure you have created a project on [Supabase.com](https://supabase.com/).

```bash
# Login to Supabase CLI
supabase login

# Run init if you haven't already
supabase init

# Link your local repository to your Supabase Cloud project
# You can find the project reference in your Supabase project settings
supabase link --project-ref <your-supabase-project-id>
```

Create a `.env` file in the root folder and add your cloud credentials (found in Project Settings -> API in the Supabase Dashboard):
```env
VITE_SUPABASE_URL="https://<your-supabase-project-id>.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-cloud-anon-key"
```

Apply the database schema to your cloud project:
```bash
supabase db push
```

### 4. Edge Functions Configuration
Before deploying edge functions, configure the secret variables they need. Run the following command (replace with your actual external values and n8n local webhook URL):

```bash
supabase secrets set \
  OPENAI_API_KEY="your-openai-api-key" \
  NOTEBOOK_GENERATION_AUTH="your-n8n-auth-password" \
  DOCUMENT_PROCESSING_WEBHOOK_URL="http://host.docker.internal:5678/webhook/extract-text" \
  NOTEBOOK_CHAT_URL="http://host.docker.internal:5678/webhook/send-chat-message" \
  NOTEBOOK_GENERATION_URL="http://host.docker.internal:5678/webhook/generate-notebook" \
  AUDIO_GENERATION_WEBHOOK_URL="http://host.docker.internal:5678/webhook/generate-audio" \
  ADDITIONAL_SOURCES_WEBHOOK_URL="http://host.docker.internal:5678/webhook/process-sources"
```
*(Note: If running n8n locally via Docker, `http://host.docker.internal:5678` ensures the containerized edge functions can reach your local n8n instance).*

Deploy the edge functions:
```bash
supabase functions deploy
```

### 5. Start the React/Vite App
Now you can start the application frontend:
```bash
bun run dev
```
Access the application at `http://localhost:5173`.


---

## 🐳 Self-Hosted n8n via Docker (Detailed Setup)

The backend heavy-lifting relies on **n8n**. If you don't want to use n8n Cloud, you can self-host it using Docker. 

**Important:** The Podcast Generation feature utilizes the **n8n CLI node** to run FFMPEG. Because standard n8n docker images don't include FFMPEG, you MUST build a custom image.

### Step 1: Create a custom Dockerfile
Create a new file named `Dockerfile` (or `Dockerfile.n8n`) in your project folder.
```dockerfile
# BƯỚC 1: Mượn một kho chứa có sẵn phần mềm FFmpeg tĩnh (static)
FROM mwader/static-ffmpeg:6.0 AS ffmpeg-source

# BƯỚC 2: Gọi môi trường n8n mới nhất của bạn ra
FROM n8nio/n8n:latest

# Chuyển sang quyền root để có quyền dán file
USER root

# BƯỚC 3: Copy trực tiếp 2 file chạy của FFmpeg sang thẳng n8n
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/

# Trả lại quyền cho n8n để hệ thống chạy an toàn
USER node
```

### Step 2: Create a Docker Compose file
In the same folder, create a `docker-compose.yml` file:
```yaml
version: '3.8'

services:
  n8n:
    build: .
    container_name: n8n_server
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=https://<your-ngrok-url>.ngrok-free.dev/
      - GENERIC_TIMEZONE=Asia/Ho_Chi_Minh
      - N8N_ENCRYPTION_KEY=<your-secret-encryption-key>
      - NODES_EXCLUDE=[]
      - NODE_FUNCTION_ALLOW_BUILTIN=* 
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

### Step 3: Run the n8n Container
```bash
# Build the custom image grabbing the latest stable n8n version
docker compose build --pull

# Start the container
docker compose up -d
```
Visit `http://localhost:5678` to finish setting up your n8n internal owner account.

### Step 4: Import Workflows
In the repository, explore the `n8n/` folder:
- **Approach 1:** Import `Import_Insights_LM_Workflows.json` into a blank workflow and run it to automatically recreate everything.
- **Approach 2:** Manually import each of the 6 `.json` workflow files.

**Don't forget:** 
- Configure credentials inside n8n (Supabase URL/Service Role Key & OpenAI API).
- Publish your workflows and activate them for webhooks to be alive.

---

## Credential Configuration Notes

### Webhook Auth (for n8n)
* **Do NOT add "Bearer" or any prefix** to the password - just enter the password value directly in your n8n authentication settings.

### n8n Version 2 Notes
> ⚠️ **Important for n8n v2 Users**

In n8n version 2, you need to **publish** your workflows (not just activate them). 
**Publishing Order (Important!):**
1. **First:** Publish the `Extract Text` sub-workflow
2. **Second:** Publish the `Upsert to Vector Store` workflow
3. **Then:** Publish the remaining workflows

---

## Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

- Fork the Project
- Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
- Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
- Push to the Branch (`git push origin feature/AmazingFeature`)
- Open a Pull Request

## License

This codebase is distributed under the MIT License.

## A Note on n8n's Sustainable Use License

While this project is open-sourced, **n8n** is distributed under a [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md). This license allows free usage for internal business purposes, but if you plan to use it as part of a commercial SaaS offering, you may need to obtain an n8n Enterprise License. Verify with the n8n team for commercial use cases.
