# Testing the AI Assist Migration

## 1. Apply the Migration

If using Supabase CLI locally:
```bash
supabase migration up
```

If using Supabase Dashboard:
1. Go to SQL Editor
2. Copy/paste the entire `20250109000000_ai_assist_setup.sql` file
3. Run it

---

## 2. Verify Tables Created

Run this query:
```sql
SELECT 
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'api_providers',
        'ai_models', 
        'user_api_keys',
        'user_ai_preferences',
        'user_profiles'
    );
```

Should return 5 rows.

---

## 3. Check Initial Data

### Providers:
```sql
SELECT id, name, has_free_tier, is_active FROM api_providers;
```

Expected:
```
groq        | Groq            | true | true
gemini      | Google Gemini   | true | true
openrouter  | OpenRouter      | true | true
cohere      | Cohere          | true | true
huggingface | HuggingFace     | true | true
```

### Models:
```sql
SELECT id, display_name, is_recommended, sort_order 
FROM ai_models 
ORDER BY provider_id, sort_order;
```

Expected: 5 models (4 Groq + 1 Gemini)

---

## 4. Test User Profile Auto-Creation

When a user signs up, a profile should be auto-created.

Check if trigger exists:
```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

---

## 5. Test RLS Policies

```sql
-- Should show policies for each table
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN (
    'user_api_keys',
    'user_ai_preferences', 
    'user_profiles',
    'api_providers',
    'ai_models'
)
ORDER BY tablename, policyname;
```

---

## 6. Test Encryption Functions

```sql
-- Test encrypt
SELECT encrypt_api_key('test_key_123', 'my_secret_password');

-- Test decrypt (should return 'test_key_123')
SELECT decrypt_api_key(
    encrypt_api_key('test_key_123', 'my_secret_password'),
    'my_secret_password'
);
```

---

## 7. Insert Test User API Key

```sql
-- Replace YOUR_USER_ID with actual UUID from auth.users
INSERT INTO user_api_keys (user_id, provider_id, api_key_encrypted)
VALUES (
    'YOUR_USER_ID',
    'groq',
    encrypt_api_key('gsk_test_key_here', 'YOUR_ENCRYPTION_KEY')
);

-- Verify
SELECT 
    user_id, 
    provider_id, 
    is_enabled, 
    created_at
FROM user_api_keys;
```

---

## 8. Insert Test User Preferences

```sql
INSERT INTO user_ai_preferences (
    user_id, 
    default_provider, 
    default_model,
    model_shortcuts
)
VALUES (
    'YOUR_USER_ID',
    'groq',
    'groq:llama-3.3-70b',
    '{"1": "groq:llama-3.3-70b", "2": "groq:llama-3.1-8b", "3": "gemini:2.0-flash"}'::jsonb
);

-- Verify
SELECT * FROM user_ai_preferences;
```

---

## 9. Clean Up Test Data (Optional)

```sql
DELETE FROM user_api_keys WHERE user_id = 'YOUR_USER_ID';
DELETE FROM user_ai_preferences WHERE user_id = 'YOUR_USER_ID';
```

---

## Expected Results

✅ All tables created  
✅ 5 providers inserted  
✅ 5 models inserted  
✅ RLS policies active  
✅ Encryption functions work  
✅ Profile trigger works  

---

## Next Steps

Once verified:
1. ✅ Move existing Gemini/Groq API to Edge Function
2. ✅ Test Edge Function with hardcoded keys
3. ✅ Update Edge Function to use user keys from DB
4. ✅ Build UI for API key management

