// supabase/functions/_shared/cors.ts
// Shared CORS headers for all Edge Functions

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Standard CORS preflight response */
export function corsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}
