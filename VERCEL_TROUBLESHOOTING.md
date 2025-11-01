# Vercel Deployment Troubleshooting

## Issue: "A commit author is required"

### Problem
When deploying to Vercel, you get the error:
```
Error: A commit author is required
```

### Root Cause
- Vercel's build environment runs Git commands during the build process
- Git requires user.name and user.email to be configured
- The build environment doesn't have your local Git configuration

### Solution ✅ (Already Applied)

The `vercel.json` file now includes Git configuration in the build command:

```json
{
  "buildCommand": "git config user.name 'Sukrut Gejji' && git config user.email 'sukrut@gametheory.com' && npm run build"
}
```

This ensures Git is configured before the build runs.

### How to Deploy Now

**Option 1: Wait for Auto-Deploy (Recommended)**
- Vercel detects the push to GitHub automatically
- Will deploy within 30-60 seconds
- Check: https://vercel.com/sukruts-projects-d6e04eae/bracket-blaze/deployments

**Option 2: Manual Redeploy**
1. Go to: https://vercel.com/sukruts-projects-d6e04eae/bracket-blaze/deployments
2. Find the latest deployment
3. Click the `⋯` menu
4. Click **Redeploy**
5. Vercel will pull latest code and build

**Option 3: Trigger Fresh Deployment**
1. Make any small change (or use the Vercel dashboard)
2. Push to GitHub
3. Vercel auto-deploys

---

## Other Common Vercel Errors

### "Environment variable not found"

**Solution**: Add environment variables in Vercel dashboard
1. Settings → Environment Variables
2. Add all three Supabase variables
3. See: [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)

### "Module not found" during build

**Solution**:
- Check `package.json` has all dependencies
- Run `npm install` locally to verify
- Commit `package-lock.json` if updated

### "Build exceeded time limit"

**Solution**:
- Usually resolves on retry
- Check for infinite loops in code
- Optimize heavy computations

### "Deployment failed" with no specific error

**Solution**:
1. Check build logs in Vercel dashboard
2. Run `npm run build` locally to reproduce
3. Fix any TypeScript or linting errors
4. Push fix to GitHub

---

## Current Status

✅ **Git Author Error**: FIXED in commit 89d6e7e
✅ **Configuration**: vercel.json updated
✅ **Synced to GitHub**: Ready for deployment

---

## Verify Successful Deployment

Once deployed, check:

1. **Deployment Status**: Should show "Ready" with green checkmark
2. **Visit URL**: https://bracket-blaze.vercel.app (or your assigned URL)
3. **Test Auth**: Go to `/auth/signup` and create account
4. **Check Logs**: Look for any runtime errors in Functions tab

---

## Need More Help?

- **Vercel Logs**: Deployments → Click deployment → View logs
- **Build Logs**: Shows compilation errors
- **Function Logs**: Shows runtime errors
- **Vercel Docs**: https://vercel.com/docs/troubleshooting

---

Last Updated: After fixing Git author configuration (commit 89d6e7e)
