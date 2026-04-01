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

    const { notebookId } = await req.json()

    if (!notebookId) {
      throw new Error('Notebook ID is required')
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the current notebook and verify ownership
    const { data: notebook, error: fetchError } = await supabase
      .from('notebooks')
      .select('audio_overview_url, user_id')
      .eq('id', notebookId)
      .single()

    if (fetchError) {
      console.error('Error fetching notebook:', fetchError)
      throw new Error('Failed to fetch notebook')
    }

    // Verify the user has access to this notebook (owner, editor, or viewer)
    if (notebook.user_id !== user.id) {
      // Not the owner — check notebook_members for any role
      const { data: memberCheck } = await supabase
        .from('notebook_members')
        .select('role')
        .eq('notebook_id', notebookId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberCheck) {
        console.error('User does not have access:', { userId: user.id, ownerId: notebook.user_id })
        return new Response(
          JSON.stringify({ error: 'Forbidden - you do not have access to this notebook' }),
          { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!notebook.audio_overview_url) {
      throw new Error('No audio overview URL found')
    }

    // Extract the file path from the existing URL
    // Assuming the URL format is similar to: .../storage/v1/object/sign/bucket/path
    const urlParts = notebook.audio_overview_url.split('/')
    const bucketIndex = urlParts.findIndex(part => part === 'audio')
    
    if (bucketIndex === -1) {
      throw new Error('Invalid audio URL format')
    }

    // Reconstruct the file path from the URL
    const filePath = urlParts.slice(bucketIndex + 1).join('/')


    // Generate a new signed URL with 24 hours expiration
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from('audio')
      .createSignedUrl(filePath, 86400) // 24 hours in seconds

    if (signError) {
      console.error('Error creating signed URL:', signError)
      throw new Error('Failed to create signed URL')
    }

    // Calculate new expiry time (24 hours from now)
    const newExpiryTime = new Date()
    newExpiryTime.setHours(newExpiryTime.getHours() + 24)

    // Update the notebook with the new signed URL and expiry time
    const { error: updateError } = await supabase
      .from('notebooks')
      .update({
        audio_overview_url: signedUrlData.signedUrl,
        audio_url_expires_at: newExpiryTime.toISOString()
      })
      .eq('id', notebookId)

    if (updateError) {
      console.error('Error updating notebook:', updateError)
      throw new Error('Failed to update notebook with new URL')
    }


    return new Response(
      JSON.stringify({ 
        success: true,
        audioUrl: signedUrlData.signedUrl,
        expiresAt: newExpiryTime.toISOString()
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in refresh-audio-url function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to refresh audio URL'
      }),
      {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }
})
