/**
 * Supabase Client Initialization
 * This file initializes the Supabase client and makes it globally available
 */

// Check if Supabase is loaded
if (typeof supabase === 'undefined') {
    console.error('Supabase library not loaded. Please include the Supabase CDN script.');
}

// Initialize Supabase client
// IMPORTANT: Replace these with your actual Supabase project credentials
// For production, these values should be injected during build/deploy
// DO NOT commit actual credentials to git

// Check if window.supabaseConfig exists (can be set in a separate config.js file)
// Otherwise use placeholder values
const supabaseUrl = window.supabaseConfig?.url || 'YOUR_SUPABASE_PROJECT_URL';
const supabaseAnonKey = window.supabaseConfig?.anonKey || 'YOUR_SUPABASE_ANON_KEY';

// Create Supabase client
let supabaseClient = null;

try {
    if (supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_PROJECT_URL') {
        supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });

        // Make client globally available
        window.supabaseClient = supabaseClient;

        console.log('✅ Supabase client initialized successfully');

        // Check for existing session on load
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                console.log('✅ User session found:', session.user.email);

                // Fetch and store user role
                supabaseClient
                    .from('user_roles')
                    .select('role, can_view_all_students, can_edit_students, can_manage_branches, can_manage_coaches')
                    .eq('user_id', session.user.id)
                    .single()
                    .then(({ data: userRole, error }) => {
                        if (error && error.code !== 'PGRST116') {
                            console.error('Error fetching user role:', error);
                        } else if (userRole) {
                            sessionStorage.setItem('userRole', JSON.stringify(userRole));
                            sessionStorage.setItem('userEmail', session.user.email);
                        } else {
                            // No role assigned - default to viewer
                            sessionStorage.setItem('userRole', JSON.stringify({ role: 'viewer' }));
                            sessionStorage.setItem('userEmail', session.user.email);
                        }
                    });
            } else {
                console.log('ℹ️ No active session found');
            }
        });

        // Listen for auth state changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);

            if (event === 'SIGNED_IN' && session) {
                console.log('✅ User signed in:', session.user.email);
            } else if (event === 'SIGNED_OUT') {
                console.log('✅ User signed out');
                sessionStorage.removeItem('userRole');
                sessionStorage.removeItem('userEmail');
            } else if (event === 'TOKEN_REFRESHED') {
                console.log('✅ Token refreshed');
            } else if (event === 'USER_UPDATED') {
                console.log('✅ User updated');
            }
        });

    } else {
        console.warn('⚠️ Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
        console.warn('⚠️ For development, you can temporarily add credentials to supabase-client.js (see SUPABASE_SETUP_GUIDE.md)');
    }
} catch (error) {
    console.error('❌ Error initializing Supabase client:', error);
}

// Helper functions for authentication
window.supabaseAuth = {
    /**
     * Check if user is currently authenticated
     */
    isAuthenticated: async () => {
        if (!supabaseClient) return false;
        const { data: { session } } = await supabaseClient.auth.getSession();
        return !!session;
    },

    /**
     * Get current user
     */
    getCurrentUser: async () => {
        if (!supabaseClient) return null;
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    /**
     * Get current user role
     */
    getCurrentUserRole: () => {
        const roleData = sessionStorage.getItem('userRole');
        return roleData ? JSON.parse(roleData) : null;
    },

    /**
     * Check if current user has admin role
     */
    isAdmin: () => {
        const role = window.supabaseAuth.getCurrentUserRole();
        return role && role.role === 'admin';
    },

    /**
     * Check if current user has coach role
     */
    isCoach: () => {
        const role = window.supabaseAuth.getCurrentUserRole();
        return role && role.role === 'coach';
    },

    /**
     * Sign out current user
     */
    signOut: async () => {
        if (!supabaseClient) return { error: new Error('Supabase client not initialized') };
        const { error } = await supabaseClient.auth.signOut();
        if (!error) {
            sessionStorage.removeItem('userRole');
            sessionStorage.removeItem('userEmail');
        }
        return { error };
    },

    /**
     * Redirect to login if not authenticated
     */
    requireAuth: async () => {
        const isAuth = await window.supabaseAuth.isAuthenticated();
        if (!isAuth) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    /**
     * Redirect to home if not admin
     */
    requireAdmin: async () => {
        const isAuth = await window.supabaseAuth.requireAuth();
        if (!isAuth) return false;

        if (!window.supabaseAuth.isAdmin()) {
            alert('Access denied. Admin privileges required.');
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }
};

// Export for ES modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient, supabaseAuth: window.supabaseAuth };
}
