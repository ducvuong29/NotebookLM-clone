
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // ============ AUTHORIZATION CHECK ============
    const { user, error: authError } = await authenticateRequest(req)
    if (authError) return authError

    // ============ END AUTHORIZATION CHECK ============

    const { sourceId, filePath, sourceType } = await req.json()

    if (!sourceId || !filePath || !sourceType) {
      return new Response(
        JSON.stringify({ error: 'sourceId, filePath, and sourceType are required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user owns this source
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // PERF: Fetch source info AND member check in PARALLEL
    // Before: source lookup (~200-400ms) → conditional member check (~200-400ms) = ~400-800ms
    // After:  both in parallel = ~200-400ms total
    // Fetch source data + precise membership check in parallel.
    // SECURITY: notebook_members query MUST include notebook_id filter.
    // Previous version pre-fetched without notebook_id — allowing editors of
    // OTHER notebooks to bypass authorization (CVE-class: broken object-level auth).
    const { data: source, error: sourceError } = await supabaseClient
      .from('sources')
      .select('id, notebook_id, notebooks!inner(user_id)')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      console.error('Source lookup error:', sourceError)
      return new Response(
        JSON.stringify({ error: 'Source not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Check that the user has write access (owner or editor of THIS notebook)
    const isOwner = (source.notebooks as { user_id: string }).user_id === user!.id;

    if (!isOwner) {
      // Precise membership check — filtered by the correct notebook_id now that we have it
      const { data: memberCheck } = await supabaseClient
        .from('notebook_members')
        .select('role')
        .eq('notebook_id', source.notebook_id)  // ← MUST filter by notebook_id
        .eq('user_id', user!.id)
        .maybeSingle();

      if (memberCheck?.role !== 'editor') {
        console.error('User does not have write access:', {
          userId: user!.id,
          notebookId: source.notebook_id,
          memberRole: memberCheck?.role ?? 'none'
        })
        return new Response(
          JSON.stringify({ error: 'Forbidden - you do not have write access to this notebook' }),
          { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
    }


    // Activity logging for source_added is now automatically handled by a Postgres trigger
    // defined in 20260401170956_fix_source_added_trigger.sql


    // Get environment variables
    const webhookUrl = Deno.env.get('DOCUMENT_PROCESSING_WEBHOOK_URL')
    const webhookAuthHeader = Deno.env.get('NOTEBOOK_GENERATION_AUTH')

    if (!webhookUrl) {
      console.error('Missing DOCUMENT_PROCESSING_WEBHOOK_URL environment variable')

      // Update source status to failed
      await supabaseClient
        .from('sources')
        .update({ processing_status: 'failed' })
        .eq('id', sourceId)

      return new Response(
        JSON.stringify({ error: 'Document processing webhook URL not configured' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }


    // Create the file URL for public access
    const fileUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/sources/${filePath}`

    // Prepare the payload for the webhook with correct variable names
    const payload = {
      source_id: sourceId,
      file_url: fileUrl,
      file_path: filePath,
      source_type: sourceType,
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-document-callback`
    }


    // Call external webhook with proper headers
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    }

    if (webhookAuthHeader) {
      webhookHeaders['Authorization'] = webhookAuthHeader
    }

    // BUG-02 fix: AbortController with 30s timeout.
    // Without this, fetch hangs up to 54s (Deno auto-kill) when n8n is slow/down.
    // At 500+ users, hanging requests exhaust the Edge Function concurrency pool,
    // blocking ALL other functions (chat, audio, admin).
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s

    let response: Response
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)

      // AbortError = our timeout fired; anything else = network failure
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'
      console.error(
        isTimeout ? 'Webhook call timed out after 30s' : 'Webhook call network error:',
        fetchError
      )

      // Mark source as failed so UI shows error state immediately
      await supabaseClient
        .from('sources')
        .update({ processing_status: 'failed' })
        .eq('id', sourceId)

      return new Response(
        JSON.stringify({
          error: isTimeout
            ? 'Document processing timed out — the processing server may be busy. Please try again.'
            : 'Document processing failed — network error',
          retryable: true,
        }),
        {
          status: isTimeout ? 504 : 502,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook call failed:', response.status, errorText);

      // Update source status to failed
      await supabaseClient
        .from('sources')
        .update({ processing_status: 'failed' })
        .eq('id', sourceId)

      return new Response(
        JSON.stringify({ error: 'Document processing failed', details: errorText, retryable: true }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ success: true, message: 'Document processing initiated', result }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-document function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
