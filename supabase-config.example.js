/**
 * Supabase Configuration Template
 *
 * Copy this file to 'supabase-config.js' and replace with your actual credentials
 * DO NOT commit supabase-config.js to git - it's in .gitignore
 */

window.supabaseConfig = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key-here',

    // Event-driven freeze/thaw to Chesster (optional). When a student's status
    // is flipped active<->frozen, the admin app POSTs to Chesster so the change
    // applies immediately instead of waiting for the hourly reconcile cron.
    // Set chessterSyncToken to the shared CE_SYNC_SERVICE_TOKEN secret to enable;
    // leave it out to disable (the cron remains the safety net). Never commit a
    // real token — supabase-config.js is the deploy-time config file.
    // chessterSyncToken: 'shared-ce-sync-service-token',
    // chessterSyncUrl: 'https://chesster.io/api/chess-empire/sync/freeze-thaw',
};
