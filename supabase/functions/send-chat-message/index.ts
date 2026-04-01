
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // ============ AUTHORIZATION CHECK ============
    const { user, error: authError } = await authenticateRequest(req)
    if (authError) return authError

    // ============ END AUTHORIZATION CHECK ============

    const { notebook_id, message } = await req.json();

    // Validate notebook_id is provided
    if (!notebook_id) {
      return new Response(
        JSON.stringify({ error: 'notebook_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate notebook_id is a valid UUID format (early exit per js-early-exit)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(notebook_id)) {
      return new Response(
        JSON.stringify({ error: 'notebook_id must be a valid UUID' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Use the verified user ID from JWT, NEVER from the request body (security!)
    const user_id = user!.id;

    // Construct composite session_id server-side (DA-6 architecture)
    // NEVER let the frontend construct this — prevents session_id spoofing
    const session_id = `${notebook_id}:${user_id}`;

    // Membership check: verify user has role in notebook via service-role query
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // PERF: Run all 3 auth queries in PARALLEL with Promise.all
    // Before: 3 sequential queries × ~200-400ms each = ~600-1200ms
    // After:  3 parallel queries = ~200-400ms total (max latency of single query)
    const [memberResult, ownerResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from('notebook_members')
        .select('role')
        .eq('notebook_id', notebook_id)
        .eq('user_id', user_id)
        .maybeSingle(),
      supabaseAdmin
        .from('notebooks')
        .select('user_id')
        .eq('id', notebook_id)
        .maybeSingle(),
      supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user_id)
        .maybeSingle(),
    ]);

    const memberCheck = memberResult.data;
    const ownerCheck = ownerResult.data;
    const profileCheck = profileResult.data;

    const isAdmin = profileCheck?.role === 'admin';
    const isOwner = ownerCheck?.user_id === user_id;
    const isMember = !!memberCheck;
    const memberRole = isAdmin ? 'admin' : (isOwner ? 'owner' : memberCheck?.role);

    if (!isAdmin && !isOwner && !isMember) {
      return new Response(
        JSON.stringify({ error: 'You do not have access to this notebook' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // All roles can chat: owner, editor, viewer
    // Chat is a read operation — asking AI about existing sources


    // Get the webhook URL and auth header from environment
    const webhookUrl = Deno.env.get('NOTEBOOK_CHAT_URL');
    const webhookAuthHeader = Deno.env.get('NOTEBOOK_GENERATION_AUTH');
    
    if (!webhookUrl) {
      throw new Error('NOTEBOOK_CHAT_URL environment variable not set');
    }

    if (!webhookAuthHeader) {
      throw new Error('NOTEBOOK_GENERATION_AUTH environment variable not set');
    }


    // Send message to n8n webhook with 25s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let webhookResponse: Response;
    try {
      webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': webhookAuthHeader,
        },
        body: JSON.stringify({
          session_id,  // Composite format: {notebookId}:{userId} — n8n uses this key for chat history
          notebook_id, // Pass explicit notebook_id so n8n can use it for Pinecone vector filtering
          message,
          user_id,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Webhook request timed out after 25s');
        return new Response(
          JSON.stringify({ error: true, code: 'TIMEOUT', message: 'Chat request timed out' }),
          { status: 504, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

    if (!webhookResponse.ok) {
      console.error(`Webhook responded with status: ${webhookResponse.status}`);
      const errorText = await webhookResponse.text();
      console.error('Webhook error response:', errorText);
      throw new Error(`Webhook responded with status: ${webhookResponse.status}`);
    }

    const webhookData = await webhookResponse.json();

    return new Response(
      JSON.stringify({ success: true, data: webhookData }),
      { 
        headers: { 
          ...getCorsHeaders(req),
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in send-chat-message:', error);
    
    const errMsg = error instanceof Error ? error.message : 'Failed to send message to webhook';
    
    return new Response(
      JSON.stringify({ 
        error: errMsg 
      }),
      { 
        status: 500,
        headers: { 
          ...getCorsHeaders(req),
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});
