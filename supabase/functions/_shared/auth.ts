// supabase/functions/_shared/auth.ts
// Shared JWT authentication helper for user-facing Edge Functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

interface AuthResult {
  user: { id: string; email?: string; [key: string]: unknown } | null;
  error: Response | null;
}

/** Extract + verify JWT from Authorization header. Returns user or error Response. */
export async function authenticateRequest(
  req: Request,
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({
          error: "Missing authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser();
  if (userError || !user) {
    console.error("Auth error:", userError);
    return {
      user: null,
      error: new Response(
        JSON.stringify({
          error: "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }

  return { user, error: null };
}
