
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

    const { session_id, message } = await req.json();
    
    // Use the verified user ID, not the one from the request body (security!)
    const user_id = user!.id;
    
    console.log('Received message:', { session_id, message, user_id });

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
          session_id,
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

