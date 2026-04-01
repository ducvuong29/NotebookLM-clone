
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    const { type, notebookId, urls, title, content, timestamp, sourceIds } = await req.json();
    
    // Verify the user owns this notebook
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: notebook, error: notebookError } = await supabaseClient
      .from('notebooks')
      .select('id, user_id')
      .eq('id', notebookId)
      .single()

    if (notebookError || !notebook) {
      console.error('Notebook lookup error:', notebookError)
      return new Response(
        JSON.stringify({ error: 'Notebook not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Check that the user has write access (owner or editor)
    if (notebook.user_id !== user.id) {
      // Not the owner — check notebook_members for editor role
      const { data: memberCheck } = await supabaseClient
        .from('notebook_members')
        .select('role')
        .eq('notebook_id', notebookId)
        .eq('user_id', user.id)
        .maybeSingle();

      const isEditor = memberCheck?.role === 'editor';

      if (!isEditor) {
        console.error('User does not have write access:', { userId: user.id, ownerId: notebook.user_id, memberRole: memberCheck?.role })
        return new Response(
          JSON.stringify({ error: 'Forbidden - you do not have write access to this notebook' }),
          { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
    }


    // Get the webhook URL from Supabase secrets
    const webhookUrl = Deno.env.get('ADDITIONAL_SOURCES_WEBHOOK_URL');
    if (!webhookUrl) {
      throw new Error('ADDITIONAL_SOURCES_WEBHOOK_URL not configured');
    }

    // Get the auth token from Supabase secrets (same as generate-notebook-content)
    const authToken = Deno.env.get('NOTEBOOK_GENERATION_AUTH');
    if (!authToken) {
      throw new Error('NOTEBOOK_GENERATION_AUTH not configured');
    }

    // Prepare the webhook payload
    let webhookPayload;
    
    if (type === 'multiple-websites') {
      webhookPayload = {
        type: 'multiple-websites',
        notebookId,
        urls,
        sourceIds, // Array of source IDs corresponding to the URLs
        timestamp
      };
    } else if (type === 'copied-text') {
      webhookPayload = {
        type: 'copied-text',
        notebookId,
        title,
        content,
        sourceId: sourceIds?.[0], // Single source ID for copied text
        timestamp
      };
    } else {
      throw new Error(`Unsupported type: ${type}`);
    }


    // Send to webhook with authentication
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        'ngrok-skip-browser-warning': 'true',
        ...getCorsHeaders(req)
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook request failed:', response.status, errorText);
      throw new Error(`Webhook request failed: ${response.status} - ${errorText}`);
    }

    const webhookResponse = await response.text();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `${type} data sent to webhook successfully`,
      webhookResponse 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...getCorsHeaders(req) 
      },
    });

  } catch (error) {
    console.error('Process additional sources error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...getCorsHeaders(req) 
      },
    });
  }
});
