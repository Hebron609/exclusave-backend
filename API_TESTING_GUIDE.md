# 🧪 Complete API Communication Testing Guide

## Overview

This guide helps you test all API endpoints and services to ensure everything works end-to-end after environment variables are added to Vercel.

---

## ✅ Pre-Test Checklist

Before testing, verify:

- [ ] Environment variables added to Vercel (see [ADD_TO_VERCEL_NOW.md](./ADD_TO_VERCEL_NOW.md))
- [ ] Backend redeployed (Deployments → Redeploy)
- [ ] Vercel deployment status shows "Ready"
- [ ] Frontend also deployed

---

## 🔌 API Endpoint Tests

### Test 1: Backend Health Check

**Purpose**: Verify backend is running and accessible

```bash
curl -i https://exclusave-backend.vercel.app/api/ping
```

**Expected Response**:

```
HTTP/1.1 200 OK
{"status":"pong","timestamp":"2025-02-17T10:00:00Z"}
```

---

### Test 2: Paystack Initialize Endpoint

**Purpose**: Verify Paystack integration and credentials

```bash
curl -X POST https://exclusave-backend.vercel.app/api/paystack/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "amount": 5000,
    "callback_url": "https://exclusave-shop.vercel.app/checkout",
    "metadata": {
      "network": "MTN",
      "phone_number": "0591234567",
      "data_amount": "5",
      "productId": "mtn-5gb",
      "productName": "MTN 5GB",
      "size": "5GB"
    }
  }'
```

**Expected Response**:

```json
{
  "success": true,
  "reference": "xxxxxxxxxxxx",
  "access_code": "xxxxxxxxxxxx",
  "authorization_url": "https://checkout.paystack.com/xxxxxxxxxxxx",
  "publicKey": "pk_live_xxxxxxxxxxxxxxxx"
}
```

**What this verifies**:

- ✅ Paystack credentials (PAYSTACK_LIVE_SECRET_KEY, PAYSTACK_LIVE_PUBLIC_KEY) are correct
- ✅ Server can communicate with Paystack API
- ✅ Request/response format is correct

---

### Test 3: Paystack Verify Endpoint (Simulation)

**Purpose**: Test payment verification flow (without real payment)

**Note**: This requires completing an actual Paystack payment. Follow these steps:

1. **Start test payment flow**:

   ```bash
   # Use the reference from Test 2
   REFERENCE="xxxxxxxxxxxx"
   ```

2. **Complete payment on Paystack checkout page**:
   - Use test card: `4111 1111 1111 1111`
   - Expiry: `12/25`
   - CVV: `123`
   - Any OTP when prompted

3. **After successful payment**, verify endpoint is called:
   ```bash
   curl -X POST https://exclusave-backend.vercel.app/api/paystack/verify \
     -H "Content-Type: application/json" \
     -d '{"reference": "YOUR_REFERENCE_FROM_ABOVE"}'
   ```

**Expected Response**:

```json
{
  "success": true,
  "paystack": {
    "reference": "xxx",
    "amount": 5000,
    "status": "success",
    "customer": {
      "email": "customer@example.com"
    }
  },
  "order": {
    "order_id": "api_order_123456",
    "status": "processing"
  },
  "dataApi": {
    "status": "success",
    "message": "Data delivered",
    "remaining_balance": "4.95GB"
  }
}
```

**What this verifies**:

- ✅ Paystack verification works correctly
- ✅ Idempotency check is functioning (replay attack protection)
- ✅ InstantData API integration works
- ✅ Data is delivered to phone
- ✅ Response includes order ID and status

---

## 📧 Email Service Testing

### Test 4: Email Delivery Verification

After completing Test 3 payment:

1. **Check customer inbox** - You should receive an email within 2 minutes

**Email should contain**:

- ✅ Subject: "✅ Data Order Successful" (or "❌ Data Order Failed" if issue)
- ✅ Order details (reference, network, phone, data amount, amount paid)
- ✅ Order ID from InstantData
- ✅ Status: "PROCESSING" or "COMPLETED"
- ✅ Delivery time estimate
- ✅ Remaining balance on account

**If email doesn't arrive**:

1. **Check spam/promotions folder** - Gmail/Outlook sometimes filter automation emails

2. **Check Vercel logs for errors**:

   ```
   Vercel Dashboard → Logs → Search for "EmailService"
   ```

3. **Verify SendGrid configuration**:

   ```bash
   curl -X GET "https://api.sendgrid.com/v3/mail/settings/footer" \
     -H "Authorization: Bearer YOUR_SENDGRID_API_KEY" \
     -H "Content-Type: application/json"
   ```

4. **Test SendGrid directly**:
   ```bash
   curl -X POST "https://api.sendgrid.com/v3/mail/send" \
     -H "Authorization: Bearer YOUR_SENDGRID_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "personalizations": [{
         "to": [{"email": "your@email.com"}],
         "subject": "SendGrid Test"
       }],
       "from": {"email": "exclusave.info1010@gmail.com"},
       "content": [{
         "type": "text/plain",
         "value": "This is a test email."
       }]
     }'
   ```

---

## 🗄️ Firebase Integration Testing

### Test 5: Transaction Storage in Firestore

After payment processing:

1. **Open Firebase Console**: https://console.firebase.google.com/
2. **Select project**: `exclusave-store`
3. **Go to Firestore**: `Firestore Database`
4. **Navigate to**: `transactions` collection
5. **Look for your reference**: Should see document with your payment reference

**Expected document structure**:

```json
{
  "reference": "xxxxxxxxxxxx",
  "email": "customer@example.com",
  "amount": 5000,
  "paystack": {
    /* full Paystack response */
  },
  "order": {
    /* InstantData order info */
  },
  "timestamp": "(server timestamp)",
  "status": "success",
  "network": "MTN",
  "phone_number": "0591234567",
  "data_amount": "5"
}
```

**Security verification**:

- [ ] In Firestore Rules - only backend service account can write transactions
- [ ] Firebase rules showing correct restrictions

---

## 📱 InstantData Integration Testing

### Test 6: Data Delivery Verification

1. **Check actual phone balance** after paying
   - Dial on customer's phone: `*156#` (MTN), `*123#` (AirtelTigo), `*110#` (Telecel)
   - Check if data balance increased

2. **Expected result**:
   - Data package appears on phone within 1-3 minutes
   - Balance is deducted from InstantData account
   - Order ID recorded in Firebase

**If data doesn't arrive**:

- Check InstantData dashboard for failed orders
- Verify phone number format is correct (e.g., `0591234567`)
- Ensure network name matches available packages (MTN, AirtelTigo, Telecel)

---

## 🔐 Security Verification Tests

### Test 7: Replay Attack Protection

Test that same payment reference can't be processed twice:

```bash
# First call (should succeed)
curl -X POST https://exclusave-backend.vercel.app/api/paystack/verify \
  -H "Content-Type: application/json" \
  -d '{"reference": "test_reference_123"}'

# Second call with same reference (should return cached result, not reprocess)
curl -X POST https://exclusave-backend.vercel.app/api/paystack/verify \
  -H "Content-Type: application/json" \
  -d '{"reference": "test_reference_123"}'
```

**Expected Result**:

- Both calls return the same cached response
- Backend logs show: "Returning cached transaction result"
- No duplicate data delivery or email

---

### Test 8: Firebase Security Rules

Verify that unauthorized users can't modify critical data:

1. **Try to write to systemSettings** (must fail):

   ```javascript
   // From frontend (unauthenticated):
   db.collection("systemSettings").doc("pricing").set({
     data_price: 1.0, // Trying to manipulate price
   });
   // Expected: ❌ PERMISSION DENIED
   ```

2. **Try to read transactions** (should work for authenticated users):
   ```javascript
   // From authenticated user account:
   db.collection("transactions").get();
   // Expected: ✅ Returns user's transactions
   ```

---

## 🧩 Complete End-to-End Test Flow

### Full Simulation

1. **Step 1**: Customer visits https://exclusave-shop.vercel.app
2. **Step 2**: Selects data package (e.g., MTN 5GB)
3. **Step 3**: Enters phone: `0591234567`
4. **Step 4**: Clicks "Checkout"
   - Frontend calls `/api/paystack/initialize`
   - ✅ Paystack returns checkout link
5. **Step 5**: Redirected to Paystack payment page
6. **Step 6**: Completes payment with test card
7. **Step 7**: Returns to app with reference
8. **Step 8**: Frontend verifies payment
   - Calls `/api/paystack/verify`
   - Backend checks Paystack
   - Backend calls InstantData
   - Backend sends email
   - ✅ Returns success
9. **Step 9**: Customer receives:
   - ✅ Confirmation email (Check inbox)
   - ✅ Data on phone (Check balance)
   - ✅ Order saved in Firebase

---

## 📊 Testing Results Template

Use this to track your testing:

```
=== API Communication Test Results ===
Date: February 17, 2025
Backend Version: Latest

INFRASTRUCTURE TESTS
[ ] Test 1: Health Check (ping) - PASS / FAIL
[ ] Backend accessible - YES / NO
[ ] Response time: ___ ms

PAYMENT INTEGRATION
[ ] Test 2: Paystack Initialize - PASS / FAIL
  - Reference returned: YES / NO
  - Authorization URL valid: YES / NO

[ ] Test 3: Paystack Verify - PASS / FAIL
  - Payment verified: YES / NO
  - Idempotency working: YES / NO

EMAIL SERVICE
[ ] Test 4: Email Delivery - PASS / FAIL
  - Email received: YES / NO
  - Arrived in time: YES / NO (expected: 2 min)
  - Email content correct: YES / NO

DATABASE
[ ] Test 5: Firebase Storage - PASS / FAIL
  - Transaction in Firestore: YES / NO
  - Data structure correct: YES / NO

DATA DELIVERY
[ ] Test 6: InstantData Integration - PASS / FAIL
  - Data delivered to phone: YES / NO
  - Time to delivery: ___ min
  - Balance correct: YES / NO

SECURITY
[ ] Test 7: Replay Protection - PASS / FAIL
  - Idempotency working: YES / NO

[ ] Test 8: Firebase Rules - PASS / FAIL
  - Rules enforced: YES / NO
  - Unauthorized access blocked: YES / NO

OVERALL STATUS: ✅ PRODUCTION READY / ⚠️ NEEDS FIXES

Issues Found:
-
-
-

Notes:
```

---

## 🚀 After All Tests Pass

Once all tests pass:

1. ✅ Push any final changes to GitHub
2. ✅ Update version in package.json
3. ✅ Tag release in Git: `git tag -a v1.0.1 -m "All APIs tested and working"`
4. ✅ Monitor production for 24 hours
5. ✅ Document any issues found

---

## 🆘 Troubleshooting Matrix

| Issue                     | Possible Cause                         | Solution                                                   |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Test 2 fails (Initialize) | Paystack keys wrong                    | Check `PAYSTACK_LIVE_SECRET_KEY` in Vercel                 |
| Test 3 fails (Verify)     | PAYSTACK_LIVE_SECRET_KEY not in Vercel | Add to Vercel environment variables                        |
| Test 4 fails (No email)   | SendGrid not configured                | Add `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` to Vercel |
| Test 6 fails (No data)    | InstantData credentials wrong          | Verify `INSTANTDATA_API_KEY` in Vercel                     |
| Test 5 fails (Firebase)   | Service account not configured         | Verify `FIREBASE_SERVICE_ACCOUNT` JSON in Vercel           |
| All tests fail            | Environment not deployed               | Check Vercel deployment status                             |

---

## 📝 Next Steps

1. Add environment variables to Vercel (see [ADD_TO_VERCEL_NOW.md](./ADD_TO_VERCEL_NOW.md))
2. Redeploy backend
3. Run through API tests systematically
4. Document results
5. Deploy frontend if all tests pass

**Status**: 🚀 Ready for production testing
