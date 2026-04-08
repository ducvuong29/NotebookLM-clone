import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";

interface EditFlowchartRequest {
  instruction: string;
  current_mermaid_code: string;
  source_id?: string;
  notebook_id?: string;
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  try {
    // 2. Authenticate Request
    const { user, error: authError } = await authenticateRequest(req);
    if (authError || !user) {
      return authError;
    }

    // 3. Parse and Validate Request Body
    const body: EditFlowchartRequest = await req.json();
    const { instruction, current_mermaid_code } = body;

    if (!instruction?.trim() || !current_mermaid_code?.trim()) {
      return new Response(
        JSON.stringify({ error: "Thiếu instruction hoặc current_mermaid_code" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // 4. Call OpenAI API
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.warn("OPENAI_API_KEY is not set.");
      return new Response(
        JSON.stringify({ error: "Hệ thống AI chưa được cấu hình (Missing API Key)." }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are an expert Mermaid flowchart editor.
You will be provided with the current Mermaid graph/flowchart code and a user instruction.
Your task is to modify the code exactly as requested and return ONLY the modified valid Mermaid code.
Do not include \`\`\`mermaid or \`\`\` fences in your output. Do not include any explanation or extra text.
Ensure the layout is clean and the syntax is correct.`;

    const openAiRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Instruction: ${instruction}\n\nCurrent Code:\n${current_mermaid_code}` 
          },
        ],
        temperature: 0.1, // Low temp for deterministic syntax
      }),
    });

    if (!openAiRes.ok) {
      const errorText = await openAiRes.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API returned status ${openAiRes.status}`);
    }

    const openAiData = await openAiRes.json();
    let editedCode = openAiData.choices?.[0]?.message?.content || "";

    // 5. Clean / Strip Output
    // Strip markdown fences if GPT included them despite instructions
    editedCode = editedCode.replace(/^```[a-z]*\n?/gm, '').replace(/```\n?$/gm, '');
    editedCode = editedCode.trim();

    return new Response(
      JSON.stringify({ mermaid_code: editedCode }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("edit-flowchart error:", errorMsg);
    
    return new Response(
      JSON.stringify({ error: "Lỗi nội bộ máy chủ khi chỉnh sửa sơ đồ." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
