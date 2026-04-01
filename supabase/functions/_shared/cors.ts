// supabase/functions/_shared/cors.ts
// Shared CORS headers for all Edge Functions with dynamic origin support

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8080')
  .split(',')
  .map((o: string) => o.trim());

/**
 * Get CORS headers with dynamic origin checking.
 * If the request Origin is in the allowlist, it's reflected back.
 * Otherwise, the first allowed origin is used (browser will block the request).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

/**
 * @deprecated Use getCorsHeaders(req) for dynamic origin support.
 * Kept for backward compatibility — returns headers for the first allowed origin.
 */
export const corsHeaders = getCorsHeaders();

/** Standard CORS preflight response with dynamic origin */
export function corsResponse(req?: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}
