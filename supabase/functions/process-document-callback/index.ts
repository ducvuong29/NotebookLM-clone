
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const payload = await req.json()
    
    const { source_id, content, summary, title, status, error: processingError } = payload
    
    if (!source_id) {
      return new Response(
        JSON.stringify({ error: 'source_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    if (status === 'completed') {
      // Build update data dynamically
      const updateData: Record<string, unknown> = {
        processing_status: 'completed',
      }
      if (content) updateData.content = content
      if (summary) updateData.summary = summary
      if (title) updateData.display_name = title

      const { error: updateError } = await supabaseClient
        .from('sources')
        .update(updateData)
        .eq('id', source_id)

      if (updateError) {
        console.error('Error updating source:', updateError)
        throw updateError
      }

    } else {
      // Update source with failed status
      const { error: updateError } = await supabaseClient
        .from('sources')
        .update({
          processing_status: 'failed',
        })
        .eq('id', source_id)

      if (updateError) {
        console.error('Error updating source status to failed:', updateError)
        throw updateError
      }

    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in process-document-callback:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to process callback' 
      }),
      { 
        status: 500, 
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
      }
    )
  }
})
