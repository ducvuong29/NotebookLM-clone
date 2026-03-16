// This script patches the Supabase URL to use the correct endpoint
(function() {
  // Function to check if direct Supabase access is available
  function checkDirectAccess() {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          resolve(xhr.status !== 0 && xhr.status < 500);
        }
      };
      xhr.open('GET', 'http://localhost:8000/auth/v1/health', true);
      xhr.timeout = 2000; // 2 seconds timeout
      xhr.send();
    });
  }
  
  // Function to patch the Supabase client with the provided URL
  function patchSupabaseClient(supabaseUrl) {
    if (window.supabase && window.supabase.createClient) {
      const originalCreateClient = window.supabase.createClient;
      window.supabase.createClient = function(url, key, options) {
        console.log('Patching Supabase client, replacing URL:', url, '->', supabaseUrl);
        return originalCreateClient(supabaseUrl, key, options);
      };
      console.log('Supabase client patched successfully with URL:', supabaseUrl);
      return true;
    }
    return false;
  }
  
  // Determine the best Supabase URL to use
  async function setupSupabaseUrl() {
    // Try direct access first
    const directAccessWorks = await checkDirectAccess();
    
    // Choose the appropriate URL
    let supabaseUrl;
    if (directAccessWorks) {
      supabaseUrl = 'http://localhost:8000';
      console.log('Direct Supabase access available, using:', supabaseUrl);
    } else {
      supabaseUrl = window.location.origin + '/supabase';
      console.log('Using proxied Supabase access:', supabaseUrl);
    }
    
    // Store the URL globally
    window.RUNTIME_SUPABASE_URL = supabaseUrl;
    
    // Try to patch immediately
    if (!patchSupabaseClient(supabaseUrl)) {
      // If not available yet, try again on window load
      window.addEventListener('load', function() {
        patchSupabaseClient(supabaseUrl);
      });
      
      // Also try periodically
      let attempts = 0;
      const interval = setInterval(function() {
        if (patchSupabaseClient(supabaseUrl) || attempts > 50) {
          clearInterval(interval);
        }
        attempts++;
      }, 100);
    }
  }
  
  // Start the setup process
  setupSupabaseUrl();
})();
