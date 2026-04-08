import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // 1. JWT auth
    const { user, error: authError } = await authenticateRequest(req);
    if (authError) return authError;

    // 2. Parse body
    const { notebook_id, source_id, force = false } = await req.json();
    if (!notebook_id || !source_id) {
      return new Response(
        JSON.stringify({ error: 'notebook_id and source_id are required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Permission check + source fetch (PARALLEL)
    const [memberResult, notebookResult, sourceResult] = await Promise.all([
      supabaseAdmin.from('notebook_members')
        .select('role').eq('notebook_id', notebook_id).eq('user_id', user!.id).maybeSingle(),
      supabaseAdmin.from('notebooks')
        .select('id, user_id, visibility').eq('id', notebook_id).maybeSingle(),
      supabaseAdmin.from('sources')
        .select('content, title, processing_status')
        .eq('id', source_id).eq('notebook_id', notebook_id).single(),
    ]);

    // 4. Verify permission — owner, member, or public notebook allowed
    const notebook = notebookResult.data;
    if (!notebook) {
      return new Response(
        JSON.stringify({ error: 'Notebook not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }
    
    const isOwner = notebook.user_id === user!.id;
    const isMember = !!memberResult.data;
    const isPublic = notebook.visibility === 'public';
    
    if (!isOwner && !isMember && !isPublic) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - not a member of this notebook and notebook is not public' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 5. Verify source
    if (sourceResult.error || !sourceResult.data) {
      return new Response(
        JSON.stringify({ error: 'Source not found in this notebook' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const source = sourceResult.data;
    if (source.processing_status !== 'completed' || !source.content) {
      return new Response(
        JSON.stringify({ error: 'Source is not yet processed. Please wait for processing to complete.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 6. Check existing flowchart
    const { data: existing } = await supabaseAdmin.from('flowcharts')
      .select('id, generation_status')
      .eq('source_id', source_id).eq('user_id', user!.id)
      .maybeSingle();

    if (existing) {
      if (existing.generation_status === 'generating') {
        return new Response(
          JSON.stringify({ flowchart_id: existing.id, status: 'generating', message: 'Generation already in progress' }),
          { status: 409, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
      if (existing.generation_status === 'completed' && !force) {
        return new Response(
          JSON.stringify({ flowchart_id: existing.id, status: 'exists', message: 'Flowchart already exists. Send force=true to regenerate.' }),
          { status: 409, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
    }

    // 7. INSERT or UPDATE flowchart row
    let flowchart;
    if (existing && (force || existing.generation_status === 'failed')) {
      // Reset existing record for regeneration
      const { data, error } = await supabaseAdmin.from('flowcharts')
        .update({ generation_status: 'generating', mermaid_code: '', summary: '', title: '', error_message: null })
        .eq('id', existing.id)
        .select().single();
      if (error) throw error;
      flowchart = data;
    } else {
      // Insert new flowchart
      const { data, error } = await supabaseAdmin.from('flowcharts')
        .insert({ notebook_id, source_id, user_id: user!.id, generation_status: 'generating' })
        .select().single();
      if (error) throw error;
      flowchart = data;
    }

    // 8. Fire-and-forget n8n webhook
    const webhookUrl = Deno.env.get('FLOWCHART_WEBHOOK_URL');
    if (!webhookUrl) {
      console.error('Missing FLOWCHART_WEBHOOK_URL environment variable');
      await supabaseAdmin.from('flowcharts')
        .update({ generation_status: 'failed', error_message: 'Webhook URL not configured' })
        .eq('id', flowchart.id);
      return new Response(
        JSON.stringify({ error: 'Flowchart generation webhook not configured' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const webhookHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const webhookAuth = Deno.env.get('NOTEBOOK_GENERATION_AUTH');
    if (webhookAuth) webhookHeaders['Authorization'] = webhookAuth;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify({
          flowchart_id: flowchart.id,
          source_id,
          notebook_id,
          source_text: source.content,
          source_title: source.title,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error('Webhook call failed:', webhookResponse.status, errorText);
        await supabaseAdmin.from('flowcharts')
          .update({ generation_status: 'failed', error_message: `Webhook error: ${webhookResponse.status}` })
          .eq('id', flowchart.id);
        return new Response(
          JSON.stringify({ error: 'Flowchart generation failed', retryable: true }),
          { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      console.error(
        isTimeout ? 'Webhook timed out after 30s' : 'Webhook network error:',
        fetchError
      );
      await supabaseAdmin.from('flowcharts')
        .update({
          generation_status: 'failed',
          error_message: isTimeout ? 'Generation timed out' : 'Network error reaching generation server',
        })
        .eq('id', flowchart.id);
      return new Response(
        JSON.stringify({
          error: isTimeout
            ? 'Flowchart generation timed out — please try again'
            : 'Flowchart generation failed — network error',
          retryable: true,
        }),
        {
          status: isTimeout ? 504 : 502,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    // 9. Return success
    return new Response(
      JSON.stringify({ flowchart_id: flowchart.id, status: 'generating' }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-flowchart function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
