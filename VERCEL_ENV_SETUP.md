# Setting Up Environment Variables in Vercel

This quick guide shows you exactly how to add your Supabase credentials to Vercel.

## Step 1: Get Your Supabase Credentials

1. Go to your Supabase project: https://app.supabase.com
2. Click on **Settings** (gear icon in left sidebar)
3. Click **API**
4. You'll see:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **Project API keys**:
     - `anon` `public` key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
     - `service_role` `secret` key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Copy these - you'll need them in the next step!**

---

## Step 2: Add Environment Variables in Vercel

### During Initial Deployment:

When you're setting up the project for the first time:

1. After selecting your GitHub repo on Vercel
2. Scroll down to **Environment Variables** section
3. Add these three variables:

| Key | Value | Example |
|-----|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Project URL | `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon public key | `eyJhbGci...` (long string) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service_role secret key | `eyJhbGci...` (long string) |

**For each variable:**
1. Click **Add** or the `+` button
2. Enter the **Key** (exactly as shown above)
3. Paste the **Value** from Supabase
4. Select which environments:
   - `NEXT_PUBLIC_SUPABASE_URL`: Check ✅ Production, Preview, Development
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Check ✅ Production, Preview, Development
   - `SUPABASE_SERVICE_ROLE_KEY`: Check ✅ **Production ONLY** (for security!)

5. Click **Add** to save each one

Then click **Deploy**!

---

### After Deployment (Adding/Updating Variables):

If you've already deployed and need to add or change variables:

1. Go to your project dashboard: https://vercel.com/dashboard
2. Select your `bracket-blaze` project
3. Click **Settings** tab at the top
4. Click **Environment Variables** in the left sidebar
5. Click **Add New**
6. Enter:
   - **Key**: e.g., `NEXT_PUBLIC_SUPABASE_URL`
   - **Value**: Your Supabase URL
   - **Environment**: Select Production/Preview/Development as needed
7. Click **Save**
8. Repeat for all three variables

**Important**: After adding/changing environment variables, you need to **redeploy**:
- Go to **Deployments** tab
- Click the `⋯` menu on the latest deployment
- Click **Redeploy**

---

## Step 3: Verify Variables Are Set

After deployment:

1. Go to **Settings → Environment Variables**
2. You should see:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```

3. Check the **Environments** column shows the right selections

---

## Environment Security Best Practices

### ✅ DO:
- Use `NEXT_PUBLIC_` prefix for variables that need to be in the browser
- Keep `SUPABASE_SERVICE_ROLE_KEY` in Production ONLY
- Never commit `.env.local` to Git (already in `.gitignore`)

### ❌ DON'T:
- Don't share service role key publicly
- Don't use service role key in Preview/Development
- Don't commit secrets to GitHub

---

## Troubleshooting

### "Environment variable not found" error

**Solution**: Make sure you spelled the variable names EXACTLY:
- `NEXT_PUBLIC_SUPABASE_URL` (not `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not `SUPABASE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_PRIVATE_KEY`)

### Variables not working after adding

**Solution**: Redeploy!
1. Go to **Deployments** tab
2. Find latest deployment
3. Click `⋯` → **Redeploy**

### Can't find where to add variables

**Solution**:
- During setup: Scroll down the deployment page
- After deployed: Settings → Environment Variables

---

## Quick Reference

**Three variables needed:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Production only!
```

**Where to get them:**
Supabase Dashboard → Settings → API

**Where to add them:**
Vercel Dashboard → Your Project → Settings → Environment Variables

---

## Screenshot Walkthrough

### In Vercel (During Deployment):

```
┌─────────────────────────────────────────────┐
│  Environment Variables                      │
├─────────────────────────────────────────────┤
│                                             │
│  Key: NEXT_PUBLIC_SUPABASE_URL             │
│  Value: https://xxxxx.supabase.co          │
│  ☑ Production ☑ Preview ☑ Development      │
│                                    [Add]    │
├─────────────────────────────────────────────┤
│  Key: NEXT_PUBLIC_SUPABASE_ANON_KEY        │
│  Value: eyJhbGci...                        │
│  ☑ Production ☑ Preview ☑ Development      │
│                                    [Add]    │
├─────────────────────────────────────────────┤
│  Key: SUPABASE_SERVICE_ROLE_KEY            │
│  Value: eyJhbGci...                        │
│  ☑ Production ☐ Preview ☐ Development      │
│                                    [Add]    │
└─────────────────────────────────────────────┘
```

---

That's it! Once these are set, Vercel will use them automatically during build and runtime.

🎉 **Your app will now connect to Supabase successfully!**
