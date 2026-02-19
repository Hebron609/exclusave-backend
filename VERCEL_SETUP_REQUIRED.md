# 🚨 CRITICAL: Vercel Environment Variables - Action Required

## Problem Identified

**SendGrid and some other services are NOT sending emails because environment variables are missing from Vercel.**

This document lists exactly what needs to be configured in Vercel to make everything work.

---

## ✅ Current Status

| Service         | Status     | Issue                                                       |
| --------------- | ---------- | ----------------------------------------------------------- |
| **Paystack**    | ⚠️ Partial | Old keys rotated ✓, but verify both old & new are in Vercel |
| **SendGrid**    | ❌ MISSING | Missing `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`        |
| **InstantData** | ⚠️ Unknown | Need to verify credentials are correct                      |
| **Firebase**    | ✓ Works    | Service account configured and working                      |

---

## 🔧 How to Fix - Step by Step

### 1. Get Your Current Environment Variables

**From Paystack:**

- Go to https://dashboard.paystack.com/settings/developers
- Copy **LIVE** keys (not TEST keys)
  - Public Key: `pk_live_xxxxx`
  - Secret Key: `sk_live_xxxxx`

**From SendGrid:**

- Go to https://app.sendgrid.com/settings/api_keys
- Click "Create API Key" (Full Access)
- Copy the key: `SG.xxxxx`
- Your "From Email" should be a verified sender (usually `noreply@exclusave.com` or similar)

**From InstantData:**

- Go to https://instantdatagh.com/dashboard
- Copy your API Key

### 2. Add to Vercel Dashboard

**URL:** https://vercel.com/dashboard

**Steps:**

1. Click on your project: `exclusave-backend`
2. Go to **Settings** → **Environment Variables**
3. Add each variable listed below
4. Redeploy after adding (or they'll apply to next deployment)

### 3. Required Environment Variables for Vercel

```
PAYSTACK_LIVE_SECRET_KEY = sk_live_xxxxxxxxxxxxx
PAYSTACK_LIVE_PUBLIC_KEY = pk_live_xxxxxxxxxxxxx
SENDGRID_API_KEY = SG.xxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL = noreply@exclusave.com
INSTANTDATA_API_KEY = (your API key)
INSTANTDATA_API_URL = https://instantdatagh.com/api.php/orders
FIREBASE_SERVICE_ACCOUNT = (already configured)
NODE_ENV = production
CORS_ORIGIN = https://exclusave-shop.vercel.app
```

---

## 🔍 How to Verify It's Working

### Test 1: Check Vercel is using the variables

After deployment, check the Vercel Function Logs:

- Backend URL: `https://exclusave-backend.vercel.app`
- Should NOT see: `⚠️ SendGrid not configured, skipping email`

### Test 2: Make a Test Payment

1. Go to https://exclusave-shop.vercel.app
2. Buy data package with test phone
3. Check if email arrives in customer inbox

### Test 3: Check Backend Logs

```bash
# In Vercel dashboard
exclusave-backend → Deployments → Your latest → Logs
# Should see:
# ✅ Email sent to customer@example.com
# ✅ Transaction stored in Firestore
```

---

## 📝 Checklist

Use this to verify everything is in place:

- [ ] Logged into Vercel dashboard
- [ ] Navigated to exclusave-backend project
- [ ] Went to Settings → Environment Variables
- [ ] Added PAYSTACK_LIVE_SECRET_KEY
- [ ] Added PAYSTACK_LIVE_PUBLIC_KEY
- [ ] Added SENDGRID_API_KEY
- [ ] Added SENDGRID_FROM_EMAIL
- [ ] Added INSTANTDATA_API_KEY
- [ ] Verified FIREBASE_SERVICE_ACCOUNT exists
- [ ] Triggered manual redeploy or waited for next deployment
- [ ] Tested with a real transaction
- [ ] Received confirmation email
- [ ] Verified data was delivered to phone

---

## 🐛 Troubleshooting

### Emails still not sending?

**Check these in order:**

1. **Is variable set in Vercel?**

   ```
   Settings → Environment Variables → Search for "SENDGRID"
   ```

2. **Is the "From Email" verified in SendGrid?**
   - Go to https://app.sendgrid.com/settings/sender_auth/senders
   - Your `SENDGRID_FROM_EMAIL` must appear there

3. **Check Vercel function logs**

   ```
   Deployments → Latest → Logs
   Search for "EmailService" or "SendGrid"
   ```

4. **Test SendGrid directly**
   ```bash
   curl -X POST "https://api.sendgrid.com/v3/mail/send" \
     -H "Authorization: Bearer SG.xxxxx" \
     -H "Content-Type: application/json" \
     -d '{
       "personalizations": [{
         "to": [{"email": "your@email.com"}],
         "subject": "Test"
       }],
       "from": {"email": "noreply@exclusave.com"},
       "content": [{"type": "text/plain", "value": "Test"}]
     }'
   ```

### Still having issues?

- Check that SENDGRID_FROM_EMAIL matches a verified sender in SendGrid
- Verify API key is active (not revoked)
- Check for typos in environment variable names (case-sensitive!)

---

## ⚙️ What Happens When Variables Are Set

When all environment variables are correctly configured:

1. **Customer makes payment** → `POST /api/paystack/initialize`
2. **Paystack redirects back** → Verifies payment
3. **Backend checks all env vars** ✅
4. **For data products:**
   - Calls InstantData API → Delivers data to phone
5. **Sends confirmation emails:**
   - Customer gets order receipt
   - Admin gets notification
6. **Stores transaction in Firebase** → Firestore

---

## 🚀 Next Steps

1. **Copy your credentials** from each service
2. **Add to Vercel environment variables**
3. **Redeploy** (Settings → Deployments → Redeploy)
4. **Test with a real transaction**
5. **Verify email arrives**

**Everything should work after these steps!**
