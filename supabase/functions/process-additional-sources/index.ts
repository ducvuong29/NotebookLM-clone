
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============ AUTHORIZATION CHECK ============
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user identity using their JWT
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.id)
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
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (notebook.user_id !== user.id) {
      console.error('User does not own this notebook:', { userId: user.id, ownerId: notebook.user_id })
      return new Response(
        JSON.stringify({ error: 'Forbidden - you do not own this notebook' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Process additional sources received ${type} request for notebook ${notebookId} by user ${user.id}`);

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

    console.log('Sending webhook payload:', JSON.stringify(webhookPayload, null, 2));

    // Send to webhook with authentication
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        ...corsHeaders
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook request failed:', response.status, errorText);
      throw new Error(`Webhook request failed: ${response.status} - ${errorText}`);
    }

    const webhookResponse = await response.text();
    console.log('Webhook response:', webhookResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `${type} data sent to webhook successfully`,
      webhookResponse 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
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
        ...corsHeaders 
      },
    });
  }
});
