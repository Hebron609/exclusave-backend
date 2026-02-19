# 🎯 ACTION REQUIRED: Add Environment Variables to Vercel

## Your Current Setup

✅ **Local Environment**: All credentials configured in `.env` file

- Paystack LIVE keys: CONFIGURED ✓
- SendGrid API Key: CONFIGURED ✓
- InstantData API Key: CONFIGURED ✓
- Firebase Service Account: CONFIGURED ✓

❌ **Vercel Production**: Environment variables NOT set

- Backend cannot access these credentials when deployed
- This is why SendGrid isn't sending emails!

---

## 🚀 IMMEDIATE FIX (5 minutes)

### Step 1: Copy These Environment Variables

```
PAYSTACK_LIVE_SECRET_KEY=<Get from Paystack Dashboard>
PAYSTACK_LIVE_PUBLIC_KEY=<Get from Paystack Dashboard>
SENDGRID_API_KEY=<Get from SendGrid Dashboard>
SENDGRID_FROM_EMAIL=exclusave.info1010@gmail.com
INSTANTDATA_API_KEY=<Get from InstantData Dashboard>
INSTANTDATA_API_URL=https://instantdatagh.com/api.php/orders
FIREBASE_SERVICE_ACCOUNT=<Your full Firebase JSON from .env file>
NODE_ENV=production
CORS_ORIGIN=https://exclusave.shop,https://www.exclusave.shop,https://exclusave-shop.vercel.app
```

### Step 2: Add to Vercel

1. **Go to**: https://vercel.com/dashboard
2. **Select project**: `exclusave-backend`
3. **Click**: Settings (top menu)
4. **Click**: Environment Variables (left sidebar)
5. **For each variable above:**
   - Click "Add New"
   - Name: (copy from list above)
   - Value: (copy from list above)
   - Production: ✓ (check this box)
   - Click "Add"

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Find your latest deployment
3. Click the three dots (...) menu
4. Click "Redeploy"
5. Wait for deployment to complete

### Step 4: Test

Make a test payment on https://exclusave-shop.vercel.app and verify:

- ✅ Checkout works
- ✅ Payment succeeds
- ✅ Email arrives in inbox within 2 minutes

---

## ⚠️ Important Security Notes

- **Do NOT commit `.env`** to GitHub (already done ✓)
- **These credentials in Vercel are encrypted** ✓
- **Keep API keys private** - never share them
- **If compromised**, rotate keys immediately:
  - Paystack: https://dashboard.paystack.com/settings/developers
  - SendGrid: https://app.sendgrid.com/settings/api_keys

---

## 🔍 Verification After Setup

After redeploy, check that it's working:

**Option 1: Check function logs**

```
Vercel Dashboard → exclusave-backend → Deployments → Latest
→ Scroll to Logs section
→ Should see: "✅ Email sent to customer@email.com"
```

**Option 2: Make test purchase**

```
1. Go to https://exclusave-shop.vercel.app
2. Add data package to cart
3. Complete checkout (use test card: 4111 1111 1111 1111)
4. Check email within 2 minutes
```

**Option 3: Check backend logs directly**

```bash
# Check if vars are visible in production
curl https://exclusave-backend.vercel.app/api/ping
# Should respond with 200 OK
```

---

## 📊 What Happens After Setup

```
Customer makes payment
    ↓
Backend receives verification
    ↓
Backend reads environment variables (NOW WORKS!)
    ↓
SendGrid sends confirmation email ✓
    ↓
Firebase stores transaction ✓
    ↓
InstantData delivers mobile data ✓
    ↓
Customer receives everything! 🎉
```

---

## ✅ Checklist to Complete

- [ ] Copied all environment variables above
- [ ] Logged into Vercel dashboard (vercel.com)
- [ ] Selected exclusave-backend project
- [ ] Went to Settings → Environment Variables
- [ ] Added PAYSTACK_LIVE_SECRET_KEY
- [ ] Added PAYSTACK_LIVE_PUBLIC_KEY
- [ ] Added SENDGRID_API_KEY
- [ ] Added SENDGRID_FROM_EMAIL
- [ ] Added INSTANTDATA_API_KEY
- [ ] Added INSTANTDATA_API_URL
- [ ] Added FIREBASE_SERVICE_ACCOUNT
- [ ] Confirmed all marked as "Production"
- [ ] Clicked Deployments → Redeploy
- [ ] Waited for deployment to complete
- [ ] Made test payment
- [ ] Confirmed email arrived

---

## ❓ FAQ

**Q: Why weren't these variables already in Vercel?**
A: During initial security audit, we focused on code changes. Environment variables must be manually added to Vercel dashboard - they're not auto-synced from .env files.

**Q: Will this break anything?**
A: No. These are the CORRECT credentials that should be in production.

**Q: How long to redeploy?**
A: Usually 30-60 seconds. Status shown in Deployments tab.

**Q: Will existing transactions work after this?**
A: No - emails will only send for NEW transactions after redeploy.

**Q: What if I get an error?**
A: Check the [VERCEL_SETUP_REQUIRED.md](./VERCEL_SETUP_REQUIRED.md) troubleshooting section.

---

## 🆘 Still Not Working?

1. **Check Vercel Dashboard for errors**
   - Deployments → Latest deployment → Logs
   - Search for "Error" or "ERROR"

2. **Verify SendGrid "From Email" is verified**
   - https://app.sendgrid.com/settings/sender_auth
   - Your `SENDGRID_FROM_EMAIL` must be in that list

3. **Check spam folder** for test emails

4. **Look for configuration warnings**
   - In backend logs: `⚠️ SendGrid not configured`
   - Means variables still not set in Vercel

---

**PRIORITY: Do this right away so emails start working!** 🚀
