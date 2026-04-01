import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Setup admin client to bypass RLS for factories
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Creates an orphaned user object for mocking purposes.
 * Note: Since Auth.User cannot be easily bypassed without GoTrue API,
 * this function generates a dummy UID and registers it locally for tables.
 */
export async function createMockUser() {
  const mockId = crypto.randomUUID();
  const mockEmail = `testuser_${Date.now()}@example.com`;
  
  // Create user in public.profiles (if present) or just return the ID
  // Note: For fully integrated auth tests, you should use the UI to signup/login, 
  // but for testing data relationships, returning a valid UUID is enough.
  return {
    id: mockId,
    email: mockEmail,
  };
}

/**
 * Directly seeds a Notebook into the database bypassing the UI.
 * Returns the created notebook object.
 */
export async function createMockNotebook(userId: string, title?: string, description?: string) {
  const { data, error } = await supabase
    .from('notebooks')
    .insert([
      {
        user_id: userId,
        title: title || `Factory Notebook ${Date.now()}`,
        description: description || 'Created by automated test factory'
      }
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create mock notebook: ${error.message}`);
  }

  // Also assign owner permissions in notebook_members automatically via the DB trigger,
  // or explicitly if the trigger is not present.
  
  return data;
}

/**
 * Seeds a Note associated with a specific Notebook.
 */
export async function createMockNote(notebookId: string, userId: string, title?: string, content?: string) {
  const { data, error } = await supabase
    .from('notes')
    .insert([
      {
        notebook_id: notebookId,
        user_id: userId,
        title: title || `Factory Note ${Date.now()}`,
        content: content || 'Factory test content'
      }
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create mock note: ${error.message}`);
  }

  return data;
}

/**
 * Clears all mock data created by a specific user to ensure test isolation.
 * Use this in `test.afterEach` blocks.
 */
export async function teardownMockUserData(userId: string) {
  // Cascading deletes should handle notes and sources 
  // if `notebooks.user_id` is foreign key with ON DELETE CASCADE.
  // Otherwise, delete explicitly:
  await supabase.from('notebooks').delete().eq('user_id', userId);
}
