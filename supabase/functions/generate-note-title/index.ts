
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, corsResponse } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // ============ AUTHORIZATION CHECK ============
    const { user, error: authError } = await authenticateRequest(req)
    if (authError) return authError

    // ============ END AUTHORIZATION CHECK ============

    const { content } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Content is required' }), 
        { 
          status: 400, 
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse content if it's a structured AI response
    let textContent = content;
    try {
      const parsed = JSON.parse(content);
      if (parsed.segments && parsed.segments.length > 0) {
        // Extract text from first few segments
        textContent = parsed.segments
          .slice(0, 3)
          .map((segment: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => segment.text)
          .join(' ');
      }
    } catch (e) {
      // Content is already plain text
    }

    // Truncate content to avoid token limits
    const truncatedContent = textContent.substring(0, 1000);

    // Call OpenAI API
    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `Generate a 5-word title for this content: ${truncatedContent}. Return only the title, nothing else. Keep it exactly 5 words or fewer.`
            }
          ],
          max_tokens: 20,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const generatedTitle = data.choices[0].message.content.trim();


    return new Response(
      JSON.stringify({ title: generatedTitle }), 
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-note-title function:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
