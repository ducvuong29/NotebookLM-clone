
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ============ AUTHORIZATION CHECK ============
    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a Supabase client with the user's JWT to verify identity
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Verify the user is authenticated
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

    const { sourceId, filePath, sourceType } = await req.json()

    if (!sourceId || !filePath || !sourceType) {
      return new Response(
        JSON.stringify({ error: 'sourceId, filePath, and sourceType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user owns this source
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: source, error: sourceError } = await supabaseClient
      .from('sources')
      .select('id, notebook_id, notebooks!inner(user_id)')
      .eq('id', sourceId)
      .single()

    if (sourceError || !source) {
      console.error('Source lookup error:', sourceError)
      return new Response(
        JSON.stringify({ error: 'Source not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check that the user owns the notebook this source belongs to
    if (source.notebooks.user_id !== user.id) {
      console.error('User does not own this source:', { userId: user.id, ownerId: source.notebooks.user_id })
      return new Response(
        JSON.stringify({ error: 'Forbidden - you do not own this resource' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Processing document:', { source_id: sourceId, file_path: filePath, source_type: sourceType, user_id: user.id });

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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Calling external webhook:', webhookUrl);

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

    console.log('Webhook payload:', payload);

    // Call external webhook with proper headers
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (webhookAuthHeader) {
      webhookHeaders['Authorization'] = webhookAuthHeader
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook call failed:', response.status, errorText);

      // Update source status to failed
      await supabaseClient
        .from('sources')
        .update({ processing_status: 'failed' })
        .eq('id', sourceId)

      return new Response(
        JSON.stringify({ error: 'Document processing failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log('Webhook response:', result);

    return new Response(
      JSON.stringify({ success: true, message: 'Document processing initiated', result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-document function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
