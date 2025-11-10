# Deploying the AI Assist Edge Function

## Option A: Supabase CLI (Recommended)

### 1. Install Supabase CLI (if not already installed)
```bash
# Windows (PowerShell)
scoop install supabase

# Mac
brew install supabase/tap/supabase

# Or using npm
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link to Your Project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Your project ref is in your Supabase URL:
`https://YOUR_PROJECT_REF.supabase.co`

### 4. Set Environment Variable (Encryption Key)
```bash
# Add to your .env file or set in Supabase Dashboard
supabase secrets set API_KEY_ENCRYPTION_SECRET=test_encryption_key_123
```

### 5. Deploy the Function
```bash
supabase functions deploy ai-assist
```

---

## Option B: Supabase Dashboard (Manual)

### 1. Go to Edge Functions
1. Open https://supabase.com/dashboard
2. Select your project
3. Click **Edge Functions** (left sidebar)
4. Click **New Function**

### 2. Create Function
- **Name:** `ai-assist`
- **Code:** Copy entire contents of `supabase/functions/ai-assist/index.js`
- Click **Deploy**

### 3. Set Environment Variable
1. In Edge Functions, click your `ai-assist` function
2. Click **Settings** tab
3. Click **Add Secret**
4. Name: `API_KEY_ENCRYPTION_SECRET`
5. Value: `test_encryption_key_123`
6. Click **Save**

---

## Testing the Edge Function

### Get Your Function URL
After deployment, you'll get a URL like:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/ai-assist
```

### Test with curl (replace with your values):
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ai-assist \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "prompt": "Write a simple GLSL shader that creates a red circle"
  }'
```

### Get Your JWT Token (for testing):
In your browser console on your site:
```javascript
const session = await supabase.auth.getSession();
console.log(session.data.session.access_token);
```

---

## Expected Response

**Success:**
```json
{
  "success": true,
  "provider": "Groq",
  "model": "llama-3.3-70b-versatile",
  "data": {
    "choices": [{
      "message": {
        "content": "Here's a shader..."
      }
    }]
  }
}
```

**Error (no API key):**
```json
{
  "error": "No API key configured for Groq",
  "provider": "groq",
  "hint": "Please add your API key in Settings > AI Assist"
}
```

---

## Troubleshooting

### Error: "Missing authorization header"
- Make sure you're passing `Authorization: Bearer YOUR_JWT_TOKEN`

### Error: "No API key configured"
- Run the SQL queries from Step 4 in the previous instructions to add a test key

### Error: "Failed to decrypt API key"
- Make sure `API_KEY_ENCRYPTION_SECRET` matches what you used in `encrypt_api_key()`

### Error: "Provider not found"
- Make sure the migration ran successfully and providers are in `api_providers` table

---

## Next Steps

Once deployed and tested:
✅ Update client-side code to call this Edge Function instead of direct APIs

