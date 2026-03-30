
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders, corsResponse } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    // ============ AUTHORIZATION CHECK ============
    const { user, error: authError } = await authenticateRequest(req)
    if (authError) return authError

    console.log('Authenticated user:', user!.id)
    // ============ END AUTHORIZATION CHECK ============

    const { notebook_id, message } = await req.json();

    // Validate notebook_id is provided
    if (!notebook_id) {
      return new Response(
        JSON.stringify({ error: 'notebook_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate notebook_id is a valid UUID format (early exit per js-early-exit)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(notebook_id)) {
      return new Response(
        JSON.stringify({ error: 'notebook_id must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Note: We check notebook_members directly instead of using get_notebook_role()
    // because service_role bypasses RLS making auth.uid() null.
    const { data: memberCheck, error: memberError } = await supabaseAdmin
      .from('notebook_members')
      .select('role')
      .eq('notebook_id', notebook_id)
      .eq('user_id', user_id)
      .eq('status', 'accepted')
      .maybeSingle();

    // Also check if user is the notebook owner
    const { data: ownerCheck } = await supabaseAdmin
      .from('notebooks')
      .select('user_id')
      .eq('id', notebook_id)
      .maybeSingle();

    // Check if the user is a global admin
    const { data: profileCheck } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .maybeSingle();

    const isAdmin = profileCheck?.role === 'admin';
    const isOwner = ownerCheck?.user_id === user_id;
    const isMember = !!memberCheck;
    const memberRole = isAdmin ? 'admin' : (isOwner ? 'owner' : memberCheck?.role);

    if (!isAdmin && !isOwner && !isMember) {
      return new Response(
        JSON.stringify({ error: 'You do not have access to this notebook' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify role allows chatting (owner, editor — not viewer)
    if (memberRole === 'viewer') {
      return new Response(
        JSON.stringify({ error: 'Viewers cannot send chat messages' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Received message:', { session_id, message, user_id, role: memberRole });

    // Get the webhook URL and auth header from environment
    const webhookUrl = Deno.env.get('NOTEBOOK_CHAT_URL');
    const webhookAuthHeader = Deno.env.get('NOTEBOOK_GENERATION_AUTH');
    
    if (!webhookUrl) {
      throw new Error('NOTEBOOK_CHAT_URL environment variable not set');
    }

    if (!webhookAuthHeader) {
      throw new Error('NOTEBOOK_GENERATION_AUTH environment variable not set');
    }

    console.log('Sending to webhook with auth header');

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
          session_id,  // Composite format: {notebookId}:{userId} — n8n uses this key
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
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    console.log('Webhook response:', webhookData);

    return new Response(
      JSON.stringify({ success: true, data: webhookData }),
      { 
        headers: { 
          ...corsHeaders,
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
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});
