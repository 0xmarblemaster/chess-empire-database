/**
 * Supabase Configuration
 *
 * DO NOT commit this file to git - it's in .gitignore
 * This file contains your Supabase project credentials for local development
 */

window.supabaseConfig = {
    url: 'https://papgcizhfkngubwofjuo.supabase.co',
    anonKey: 'sb_publishable_beDjQ-plNitUkdGYgzMGjw_gBPjHEUl',
    apiKey: 'ce-api-2026-08c2e0bf820443dd436c',
    // Shared low-privilege poke token: Chesster re-reads the authoritative
    // student status from Supabase before acting, so this can only trigger
    // a re-sync to the true state (same effect as the hourly cron).
    chessterSyncToken: 'ab3f604ea70f7d10c9052005b6cdd31802246cb60cef6e56b437b47b57e9103f',
    chessterSyncUrl: 'https://chesster.io/api/chess-empire/sync/freeze-thaw'
};
