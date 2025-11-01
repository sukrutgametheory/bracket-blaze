# Deploying Bracket Blaze to Vercel

This guide will walk you through deploying your tournament management platform to Vercel with automatic deployments from GitHub.

## Prerequisites

- ✅ GitHub repository set up: https://github.com/sukrutgametheory/bracket-blaze
- ✅ Supabase project created
- ✅ Database migrations ready to run

## Deployment Steps

### 1. Set Up Supabase Database

Before deploying to Vercel, ensure your Supabase database is configured:

#### Run Migrations (Choose One Method)

**Option A: Supabase Dashboard (Recommended for First Time)**

1. Go to your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Run these migrations **in order**:
   - `supabase/migrations/20250101000002_add_prefix.sql` (with bracket_blaze_ prefix)
   - `supabase/migrations/20250101000003_rls_policies_prefixed.sql`

**Option B: Supabase CLI**

```bash
# Install Supabase CLI
npm install -g supabase

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

#### Get Your Supabase Credentials

From: https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api

You'll need:
- **Project URL**: `https://your-project.supabase.co`
- **Anon (public) key**: `eyJhbG...`
- **Service role key**: `eyJhbG...` (keep this secret!)

---

### 2. Deploy to Vercel from GitHub

#### Step 2.1: Connect GitHub Repository

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select: `sukrutgametheory/bracket-blaze`
4. Click **Import**

#### Step 2.2: Configure Project

Vercel will auto-detect Next.js. Confirm these settings:

- **Framework Preset**: Next.js
- **Root Directory**: `./`
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)
- **Install Command**: `npm install` (auto-detected)

#### Step 2.3: Add Environment Variables

**📖 Detailed Guide**: See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) for step-by-step screenshots and troubleshooting.

**Quick Summary:**

Scroll down to **Environment Variables** section and add these three:

| Name | Value | Environments |
|------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | ✅ Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | ✅ Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | ✅ Production ONLY |

**For each variable:**
1. Click **Add New** or `+`
2. Enter the **Key** exactly as shown
3. Paste the **Value** from Supabase
4. Check the appropriate environments
5. Click **Add**

**Important**:
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- The service role key should **only** be in Production (never Preview/Development)
- If you get errors about secrets not existing, make sure you're adding them as plain environment variables, not referencing @secrets

#### Step 2.4: Deploy

1. Click **Deploy**
2. Wait 2-3 minutes for the build
3. Vercel will provide you with a production URL: `https://bracket-blaze.vercel.app`

---

### 3. Configure Custom Domain (Optional)

1. In Vercel dashboard, go to **Settings → Domains**
2. Add your custom domain (e.g., `bracketblaze.com`)
3. Follow DNS configuration instructions
4. Vercel automatically handles SSL certificates

---

### 4. Set Up Automatic Deployments

**Already configured!** Every push to `main` will:
1. ✅ Trigger automatic Vercel deployment
2. ✅ Build and deploy to production
3. ✅ Run on the new code within minutes

**Preview Deployments:**
- Every pull request gets its own preview URL
- Test features before merging to `main`

---

### 5. Verify Deployment

After deployment succeeds:

1. **Visit your production URL**
2. **Test authentication**:
   - Go to `/auth/signup`
   - Create an account
   - Log in
3. **Test tournament list**:
   - Should see empty state or tournaments if you added test data
4. **Check console for errors**:
   - Open browser DevTools
   - No Supabase connection errors should appear

---

## Post-Deployment Configuration

### Add Redirect URLs to Supabase

1. Go to: https://app.supabase.com/project/YOUR_PROJECT_ID/auth/url-configuration
2. Add your Vercel URLs to **Redirect URLs**:
   ```
   https://bracket-blaze.vercel.app/*
   https://bracket-blaze-*.vercel.app/*  (for preview deployments)
   https://yourdomain.com/*              (if using custom domain)
   ```

3. Add to **Site URL**: `https://bracket-blaze.vercel.app`

### Enable Email Authentication

1. Go to: https://app.supabase.com/project/YOUR_PROJECT_ID/auth/providers
2. Ensure **Email** provider is enabled
3. Configure email templates if desired

---

## Development Workflow

### Local Development
```bash
# Work locally
npm run dev

# Make changes, commit
git commit -m "feat: your feature"

# Automatically pushes to GitHub (post-commit hook)
# Vercel automatically deploys from GitHub
```

### Production Deployment Flow

```
Your Local Machine
       ↓
  git commit
       ↓
  Auto-push to GitHub (hook)
       ↓
  GitHub main branch
       ↓
  Vercel Auto-Deploy
       ↓
  Production Live! 🎉
```

---

## Vercel Dashboard Features

Access your dashboard: https://vercel.com/dashboard

### Key Features:
- **Deployments**: See all builds and logs
- **Analytics**: Page views, performance metrics
- **Logs**: Runtime and build logs
- **Environment Variables**: Manage secrets
- **Domains**: Custom domain management
- **Integrations**: GitHub, monitoring tools

---

## Monitoring & Logs

### Build Logs
- Go to **Deployments** tab
- Click on any deployment
- View **Build Logs** for compilation issues

### Runtime Logs
- Go to **Deployments** → Select deployment
- Click **Functions** tab
- View real-time logs from your API routes

### Environment Variable Updates
1. Go to **Settings → Environment Variables**
2. Edit the variable
3. Click **Save**
4. Redeploy for changes to take effect

---

## Troubleshooting

### Build Fails

**Check:**
- Build logs in Vercel dashboard
- All dependencies in `package.json`
- TypeScript errors (`npm run build` locally)

**Common Issues:**
- Missing environment variables
- TypeScript type errors
- Import path issues

### Runtime Errors

**Check:**
- Supabase credentials are correct
- RLS policies allow the operation
- Network tab in browser DevTools

**Common Issues:**
- Wrong environment variables
- RLS blocking queries
- Missing database migrations

### Supabase Connection Issues

**Verify:**
1. Environment variables are set correctly
2. Supabase project is active
3. Redirect URLs are configured
4. Database migrations have been run

---

## Rollback a Deployment

If something goes wrong:

1. Go to **Deployments** tab
2. Find a previous working deployment
3. Click **⋯ → Promote to Production**
4. Instant rollback!

---

## Security Best Practices

✅ **Never commit** `.env.local` to Git (already in `.gitignore`)
✅ **Use Vercel environment variables** for all secrets
✅ **Service role key** only in Production environment
✅ **Enable RLS** on all Supabase tables (already done)
✅ **Validate inputs** with Zod schemas (already implemented)

---

## Scaling & Performance

Vercel automatically:
- ✅ Scales based on traffic
- ✅ Caches static assets globally (CDN)
- ✅ Optimizes images
- ✅ Edge functions for low latency

**No additional configuration needed!**

---

## Cost Expectations

**Vercel Free Tier:**
- ✅ Unlimited personal projects
- ✅ 100GB bandwidth/month
- ✅ Automatic SSL
- ✅ Preview deployments

**Supabase Free Tier:**
- ✅ 500MB database
- ✅ 1GB file storage
- ✅ 2GB bandwidth
- ✅ 50,000 monthly active users

**Perfect for MVP and testing!**

---

## Next Steps After Deployment

1. ✅ Share your production URL with beta testers
2. ✅ Monitor for errors in Vercel dashboard
3. ✅ Set up Google Analytics (optional)
4. ✅ Configure custom domain
5. ✅ Continue building Phase 2 features

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **GitHub Repo**: https://github.com/sukrutgametheory/bracket-blaze

---

🎉 **You're all set!** Your tournament platform is now live and automatically deploys with every push to GitHub.
