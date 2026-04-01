
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

    const { notebookId } = await req.json()
    
    if (!notebookId) {
      return new Response(
        JSON.stringify({ error: 'Notebook ID is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the user owns this notebook
    const { data: notebook, error: notebookError } = await supabase
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
      const { data: memberCheck } = await supabase
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

    // Update notebook status to indicate audio generation has started
    const { error: updateError } = await supabase
      .from('notebooks')
      .update({
        audio_overview_generation_status: 'generating'
      })
      .eq('id', notebookId)

    if (updateError) {
      console.error('Error updating notebook status:', updateError)
      throw updateError
    }

    // Get audio generation webhook URL and auth from secrets
    const audioGenerationWebhookUrl = Deno.env.get('AUDIO_GENERATION_WEBHOOK_URL')
    const webhookAuthHeader = Deno.env.get('NOTEBOOK_GENERATION_AUTH')

    if (!audioGenerationWebhookUrl || !webhookAuthHeader) {
      console.error('Missing audio generation webhook URL or auth')
      return new Response(
        JSON.stringify({ error: 'Audio generation service not configured' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }


    // Start the background task without awaiting
    EdgeRuntime.waitUntil(
      (async () => {
        try {
          // Call the external audio generation webhook
          const audioResponse = await fetch(audioGenerationWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': webhookAuthHeader,
            },
            body: JSON.stringify({
              notebook_id: notebookId,
              callback_url: `${supabaseUrl}/functions/v1/audio-generation-callback`
            })
          })

          if (!audioResponse.ok) {
            const errorText = await audioResponse.text()
            console.error('Audio generation webhook failed:', errorText)
            
            // Update status to failed
            await supabase
              .from('notebooks')
              .update({ audio_overview_generation_status: 'failed' })
              .eq('id', notebookId)
          } else {
          }
        } catch (error) {
          console.error('Background audio generation error:', error)
          
          // Update status to failed
          await supabase
            .from('notebooks')
            .update({ audio_overview_generation_status: 'failed' })
            .eq('id', notebookId)
        }
      })()
    )

    // Return immediately with success status
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audio generation started',
        status: 'generating'
      }),
      { 
        status: 200, 
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in generate-audio-overview:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to start audio generation' 
      }),
      { 
        status: 500, 
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
      }
    )
  }
})
