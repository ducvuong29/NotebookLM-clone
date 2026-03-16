
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

    const { notebookId, filePath, sourceType } = await req.json()

    if (!notebookId || !sourceType) {
      return new Response(
        JSON.stringify({ error: 'notebookId and sourceType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user owns this notebook
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

    console.log('Processing request:', { notebookId, filePath, sourceType, userId: user.id });

    // Get environment variables
    const webServiceUrl = Deno.env.get('NOTEBOOK_GENERATION_URL')
    const webhookAuthHeader = Deno.env.get('NOTEBOOK_GENERATION_AUTH')

    if (!webServiceUrl || !webhookAuthHeader) {
      console.error('Missing environment variables:', {
        hasUrl: !!webServiceUrl,
        hasAuth: !!webhookAuthHeader
      })
      
      return new Response(
        JSON.stringify({ error: 'Web service configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update notebook status to 'generating'
    await supabaseClient
      .from('notebooks')
      .update({ generation_status: 'generating' })
      .eq('id', notebookId)

    console.log('Calling external web service...')

    // Prepare payload based on source type
    let payload: any = {
      sourceType: sourceType
    };

    if (filePath) {
      // For file sources (PDF, audio) or URLs (website, YouTube)
      payload.filePath = filePath;
    } else {
      // For text sources, we need to get the content from the database
      const { data: source } = await supabaseClient
        .from('sources')
        .select('content')
        .eq('notebook_id', notebookId)
        .single();
      
      if (source?.content) {
        payload.content = source.content.substring(0, 5000); // Limit content size
      }
    }

    console.log('Sending payload to web service:', payload);

    // Call external web service
    const response = await fetch(webServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': webhookAuthHeader,
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      console.error('Web service error:', response.status, response.statusText)
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      // Update status to failed
      await supabaseClient
        .from('notebooks')
        .update({ generation_status: 'failed' })
        .eq('id', notebookId)

      return new Response(
        JSON.stringify({ error: 'Failed to generate content from web service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const generatedData = await response.json()
    console.log('Generated data:', generatedData)

    // Parse the response format: object with output property
    let title, description, notebookIcon, backgroundColor, exampleQuestions;
    
    if (generatedData && generatedData.output) {
      const output = generatedData.output;
      title = output.title;
      description = output.summary;
      notebookIcon = output.notebook_icon;
      backgroundColor = output.background_color;
      exampleQuestions = output.example_questions || [];
    } else {
      console.error('Unexpected response format:', generatedData)
      
      await supabaseClient
        .from('notebooks')
        .update({ generation_status: 'failed' })
        .eq('id', notebookId)

      return new Response(
        JSON.stringify({ error: 'Invalid response format from web service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!title) {
      console.error('No title returned from web service')
      
      await supabaseClient
        .from('notebooks')
        .update({ generation_status: 'failed' })
        .eq('id', notebookId)

      return new Response(
        JSON.stringify({ error: 'No title in response from web service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update notebook with generated content including icon, color, and example questions
    const { error: updateError } = await supabaseClient
      .from('notebooks')
      .update({
        title: title,
        description: description || null,
        icon: notebookIcon || '📝',
        color: backgroundColor || 'bg-gray-100',
        example_questions: exampleQuestions || [],
        generation_status: 'completed'
      })
      .eq('id', notebookId)

    if (updateError) {
      console.error('Notebook update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update notebook' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully updated notebook with example questions:', exampleQuestions)

    return new Response(
      JSON.stringify({ 
        success: true, 
        title, 
        description,
        icon: notebookIcon,
        color: backgroundColor,
        exampleQuestions,
        message: 'Notebook content generated successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
