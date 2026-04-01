import { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Mocks the AI Chat endpoint to prevent sending requests to n8n during UI tests,
 * saving tokens and time. It intercepts the HTTP call, responds with 200 OK, and
 * directly inserts a mock AI response into `n8n_chat_histories` so the frontend
 * Realtime listener can pick it up.
 */
export async function mockAIChatEndpoint(page: Page) {
  await page.route('**/functions/v1/send-chat-message', async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    
    const notebookId = postData?.notebook_id || postData?.notebookId;
    const messagePart = postData?.message;

    // Extract user ID from the JWT token in the Authorization header
    // The frontend sends: Authorization: Bearer <jwt>
    let userId: string | null = null;
    const authHeader = request.headers()['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    if (token) {
      try {
        // Decode the JWT payload (base64url) to get the user's sub claim
        const payloadBase64 = token.split('.')[1];
        const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
        const payload = JSON.parse(payloadJson);
        userId = payload.sub;
      } catch (e) {
        console.log('Mock: Could not decode JWT, falling back to notebookId as session_id');
      }
    }

    // Simulate a slight network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (notebookId && messagePart) {
      // Construct compositeSessionId matching the frontend pattern: notebookId:userId
      const sessionId = userId ? `${notebookId}:${userId}` : notebookId;
      
      // The frontend useChatMessages hook expects this structure for parsing 
      const mockMessage = {
        type: 'ai',
        content: `[MOCK AI] MOCK RESPONSE: You said "${messagePart}".`
      };

      // Insert directly to DB using Service Role to trigger Realtime on frontend
      const { data, error } = await supabase.from('n8n_chat_histories').insert([
        {
          session_id: sessionId,
          message: mockMessage
        }
      ]);
      console.log('Mock chat insert:', { sessionId, error });
    }

    // Fulfill the original request successfully
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, mocked: true })
    });
  });
}

/**
 * Mocks the process-document endpoint used when uploading files/urls/texts,
 * so we don't call the real AI logic during simple E2E UI testing.
 */
export async function mockProcessDocumentEndpoint(page: Page) {
  // Catch process-document, process-additional-sources and generate-notebook-content
  await page.route('**/functions/v1/*', async (route) => {
    const request = route.request();
    // Only mock if it's process-document, process-additional-sources or generate-notebook-content
    if (!request.url().includes('process-document') && 
        !request.url().includes('process-additional-sources') &&
        !request.url().includes('generate-notebook-content')) {
      return route.fallback();
    }
    
    console.log('Mock processing endpoint:', request.url());
    const postData = request.postDataJSON();
    const documentId = postData?.document_id || postData?.documentId;
    const sourceIds = postData?.sourceIds || [];
    console.log('Mock intercept parsed:', { documentId, sourceIds });
    
    if (documentId) {
      console.log('Mock updating source:', documentId);
      const { data, error } = await supabase.from('sources').update({ processing_status: 'completed' }).eq('id', documentId).select();
      console.log('Mock update result:', data, error);
    }
    
    if (sourceIds.length > 0) {
      for (const id of sourceIds) {
          console.log('Mock updating source:', id);
          const { data, error } = await supabase.from('sources').update({ processing_status: 'completed' }).eq('id', id).select();
          console.log('Mock update result:', data, error);
      }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, mocked: true })
    });
  });
}
