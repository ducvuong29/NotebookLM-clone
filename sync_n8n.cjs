const fs = require("fs");
const path = require("path");

const mcpConfigPath = `C:\\Users\\PC\\.gemini\\antigravity\\mcp_config.json`;
const configData = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
const n8nConfig = configData.mcpServers["n8n-prod"].env;

const API_URL = n8nConfig.N8N_API_URL;
const API_KEY = n8nConfig.N8N_API_KEY;

const headers = {
  "X-N8N-API-KEY": API_KEY,
  "Content-Type": "application/json"
};

async function sync() {
  const dirPath = path.join(__dirname, "n8n");
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".json"));

  // Get current workflows
  console.log("Fetching existing workflows...");
  const res = await fetch(`${API_URL}/api/v1/workflows`, { headers });
  const data = await res.json();
  const existingWorkflows = data.data; // n8n API wraps in data object usually, wait. actually /api/v1/workflows returns { data: [...] }

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const wfName = content.name;

    const existingWf = existingWorkflows.find(w => w.name === wfName);

    const safeSettings = {};
    if (content.settings && content.settings.executionOrder) {
      safeSettings.executionOrder = content.settings.executionOrder;
    }

    // Resolve Sub-workflow IDs before saving
    if (content.nodes) {
      for (const node of content.nodes) {
        if (node.type === "n8n-nodes-base.executeWorkflow" && node.parameters?.workflowId) {
          const wIdObj = node.parameters.workflowId;
          if (wIdObj && wIdObj.cachedResultName) {
            const targetName = wIdObj.cachedResultName;
            const targetWf = existingWorkflows.find(w => w.name === targetName);
            if (targetWf) {
              console.log(`[Resolving] Sub-workflow '${targetName}' -> ID: ${targetWf.id}`);
              wIdObj.value = targetWf.id;
              if (wIdObj.cachedResultUrl) {
                wIdObj.cachedResultUrl = `/workflow/${targetWf.id}`;
              }
            } else {
              console.warn(`[Warning] Could not resolve sub-workflow '${targetName}'`);
            }
          }
        }
      }
    }

    if (existingWf) {
      console.log(`Updating existing workflow: ${wfName} (ID: ${existingWf.id})`);
      const updateRes = await fetch(`${API_URL}/api/v1/workflows/${existingWf.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: content.name,
          nodes: content.nodes,
          connections: content.connections,
          settings: safeSettings
        })
      });
      if (updateRes.ok) {
        console.log(`✅ Successfully updated ${wfName}`);
      } else {
        console.error(`❌ Failed to update ${wfName}:`, await updateRes.text());
      }
    } else {
      console.log(`Creating new workflow: ${wfName}`);
      const createRes = await fetch(`${API_URL}/api/v1/workflows`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: content.name,
          nodes: content.nodes,
          connections: content.connections,
          settings: safeSettings
        })
      });
      if (createRes.ok) {
        console.log(`✅ Successfully created ${wfName}`);
        // Now refresh the existingWorkflows to ensure we have its ID for subsequent workflows that might need it
        const newRes = await fetch(`${createRes.headers.get("location") || `${API_URL}/api/v1/workflows`}`, { headers });
        // Instead of fetching individual, let's just do a blanket workflows refresh
        const refreshed = await fetch(`${API_URL}/api/v1/workflows`, { headers });
        const refData = await refreshed.json();
        existingWorkflows.length = 0;
        existingWorkflows.push(...refData.data);
      } else {
        console.error(`❌ Failed to create ${wfName}:`, await createRes.text());
      }
    }
  }
}

sync().catch(console.error);
