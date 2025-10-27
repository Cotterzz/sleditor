// ============================================================================
// Backend - Supabase Authentication
// ============================================================================

import { state, logStatus } from './core.js';

let supabase = null;

export function init() {
    // TODO: Replace with your actual Supabase credentials
    // Get these from: Supabase Dashboard → Project Settings → API
    const SUPABASE_URL = 'https://vnsdnskppjwktvksxxvp.supabase.co';  
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuc2Ruc2twcGp3a3R2a3N4eHZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NTY3NzUsImV4cCI6MjA3NzAzMjc3NX0.aBQBLgDm0iDpuHZoN_SY-hNe_Z0oX4caFx4glI1Dm1M';  // Your anon/public key
    
    // Check if credentials are set
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
        console.warn('⚠️ Supabase credentials not configured in js/backend.js');
        console.warn('Get your credentials from: Supabase Dashboard → Project Settings → API');
        return;
    }
    
    // Initialize Supabase client
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✓ Supabase initialized');
    
    // Check for existing session (user might already be logged in)
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log('Existing session found:', session.user.email);
            onUserSignedIn(session.user);
        }
    });
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
            onUserSignedIn(session.user);
        } else if (event === 'SIGNED_OUT') {
            onUserSignedOut();
        }
    });
}

// Sign in with OAuth provider (GitHub, Google, etc.)
export async function signInWithOAuth(provider) {
    if (!supabase) {
        logStatus('✗ Supabase not initialized', 'error');
        return;
    }
    
    console.log('Signing in with', provider);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider, // 'github', 'google', 'facebook'
        options: {
            redirectTo: window.location.origin // Auto-detect local or production URL
        }
    });
    
    if (error) {
        logStatus(`✗ Sign in failed: ${error.message}`, 'error');
        console.error('Sign in error:', error);
    }
    // User will be redirected to OAuth provider
}

// Sign in with email/password
export async function signInWithEmail(email, password) {
    if (!supabase) {
        logStatus('✗ Supabase not initialized', 'error');
        return { success: false };
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        logStatus(`✗ Sign in failed: ${error.message}`, 'error');
        return { success: false, error };
    }
    
    logStatus('✓ Signed in successfully', 'success');
    return { success: true };
}

// Sign up with email/password
export async function signUpWithEmail(email, password) {
    if (!supabase) {
        logStatus('✗ Supabase not initialized', 'error');
        return { success: false };
    }
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            emailRedirectTo: window.location.origin
        }
    });
    
    if (error) {
        logStatus(`✗ Sign up failed: ${error.message}`, 'error');
        return { success: false, error };
    }
    
    logStatus('✓ Check your email to confirm your account', 'success');
    return { success: true };
}

// Sign out
export async function signOut() {
    if (!supabase) {
        logStatus('✗ Supabase not initialized', 'error');
        return;
    }
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
        logStatus('✗ Sign out failed', 'error');
        console.error(error);
    } else {
        logStatus('✓ Signed out', 'success');
    }
}

// Called when user signs in
function onUserSignedIn(user) {
    console.log('User signed in:', user);
    state.currentUser = user;
    
    // Extract user info (different providers have different metadata)
    const username = user.user_metadata?.full_name 
                  || user.user_metadata?.user_name 
                  || user.user_metadata?.name
                  || user.email?.split('@')[0]
                  || 'User';
    
    const avatarUrl = user.user_metadata?.avatar_url 
                   || user.user_metadata?.picture 
                   || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
    
    // Update UI - show user menu, hide sign in button
    document.getElementById('signInBtn').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('username').textContent = username;
    document.getElementById('userAvatar').src = avatarUrl;
    
    logStatus(`✓ Welcome, ${username}!`, 'success');
}

// Called when user signs out
function onUserSignedOut() {
    console.log('User signed out');
    state.currentUser = null;
    
    // Update UI - hide user menu, show sign in button
    document.getElementById('signInBtn').style.display = 'flex';
    document.getElementById('userMenu').style.display = 'none';
    
    logStatus('✓ Signed out', 'success');
}

// Getters
export function getSupabase() {
    return supabase;
}

export function isSignedIn() {
    return state.currentUser !== null;
}

export function getCurrentUser() {
    return state.currentUser;
}

