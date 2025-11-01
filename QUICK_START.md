# 🚀 Bracket Blaze - Quick Start Deployment

**Time to Production: ~20 minutes**

---

## ✅ Pre-Deployment Checklist

- [x] GitHub repo synced: https://github.com/sukrutgametheory/bracket-blaze
- [x] Database schema with `bracket_blaze_` prefix
- [x] Vercel configuration ready
- [x] Auto-sync enabled
- [x] Build tested and passing

---

## 🎯 3-Step Deployment

### Step 1: Supabase Setup (5 minutes)

**1.1 Run Migrations**
- Go to: https://app.supabase.com → Your Project → SQL Editor
- Run: `supabase/migrations/20250101000002_add_prefix.sql`
- Run: `supabase/migrations/20250101000003_rls_policies_prefixed.sql`

**1.2 Get Credentials**
- Go to: Settings → API
- Copy:
  - Project URL: `https://xxxxx.supabase.co`
  - anon public key: `eyJhbGci...`
  - service_role secret key: `eyJhbGci...`

---

### Step 2: Deploy to Vercel (10 minutes)

**2.1 Import Repository**
- Go to: https://vercel.com/new
- Click: **Import Git Repository**
- Select: `sukrutgametheory/bracket-blaze`
- Click: **Import**

**2.2 Add Environment Variables**

Scroll to **Environment Variables** and add:

```
Key: NEXT_PUBLIC_SUPABASE_URL
Value: https://xxxxx.supabase.co
Environments: ✅ Production ✅ Preview ✅ Development

Key: NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: eyJhbGci... (your anon key)
Environments: ✅ Production ✅ Preview ✅ Development

Key: SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGci... (your service role key)
Environments: ✅ Production only!
```

**📖 Need help?** See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)

**2.3 Deploy**
- Click **Deploy**
- Wait 2-3 minutes
- Get your URL: `https://bracket-blaze.vercel.app`

---

### Step 3: Configure Supabase Auth (2 minutes)

**3.1 Add Redirect URLs**
- Go to: Supabase → Authentication → URL Configuration
- Add to **Redirect URLs**:
  ```
  https://bracket-blaze.vercel.app/*
  https://bracket-blaze-*.vercel.app/*
  ```

**3.2 Set Site URL**
- Set **Site URL**: `https://bracket-blaze.vercel.app`
- Click **Save**

---

## ✅ Verify Deployment

1. Visit: `https://bracket-blaze.vercel.app`
2. Go to: `/auth/signup`
3. Create account
4. Log in
5. Visit: `/tournaments`
6. **Success!** 🎉

---

## 🔄 Future Deployments

**It's automatic!** Just commit your code:

```bash
git add .
git commit -m "your changes"
# Auto-pushes to GitHub
# Vercel auto-deploys
# Live in ~2 minutes!
```

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [QUICK_START.md](./QUICK_START.md) | This file - quick deployment |
| [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) | Detailed env var setup |
| [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) | Complete deployment guide |
| [DEPLOYMENT_READY.md](./DEPLOYMENT_READY.md) | Deployment summary |
| [README.md](./README.md) | Main project documentation |
| [supabase/README.md](./supabase/README.md) | Database setup |

---

## 🆘 Troubleshooting

**Error: "Environment variable references Secret..."**
- ✅ Fixed! Use plain values, not @secret references
- See: [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)

**Error: "Cannot read properties of null"**
- Check environment variables are set correctly
- Redeploy after adding variables

**Error: "Database connection failed"**
- Verify Supabase credentials are correct
- Check migrations ran successfully

**Auth not working**
- Add Vercel URLs to Supabase redirect URLs
- Set Site URL in Supabase

---

## 🎊 You're Done!

Your tournament platform is now live at:
**https://bracket-blaze.vercel.app**

Every push to GitHub automatically deploys to production.

**Next**: Start building Phase 2 features! 🚀
