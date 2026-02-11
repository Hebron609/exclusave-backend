# Exclusave Backend

Backend service for Exclusave shop handling Paystack payment verification and InstantData mobile data delivery.

## Architecture

The backend handles all critical operations:

- **Paystack Payment Verification**: Validates payments from Paystack
- **InstantData Data Delivery**: Delivers mobile data to customers for MTN/AirtelTigo/Telecel networks
- **CORS & Security**: Rate limiting and origin validation
- **Webhook Processing**: Handles Paystack webhook events

```
Frontend (Vue 3)
    ↓
[POST] /api/paystack/initialize → Paystack (Mobile Money)
                                    ↓
                                  Payment
                                    ↓
Paystack redirects back with reference
    ↓
[POST] /api/paystack/verify → Backend
    ├─→ Verify with Paystack
    ├─→ Extract metadata (network, phone, data_amount)
    ├─→ [POST] InstantData API (if data product)
    │   └─→ Deliver data to customer
    └─→ Return order_id + status
    ↓
Frontend saves transaction to Firebase
```

## Setup

### 1. Install Dependencies

```bash
cd exclusave-backend
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

- **Paystack** (from https://dashboard.paystack.com/settings/developers):
  - `PAYSTACK_LIVE_SECRET_KEY` - Production secret key
  - `PAYSTACK_LIVE_PUBLIC_KEY` - Production public key
  - `PAYSTACK_TEST_SECRET_KEY` - Test secret key (optional)

- **InstantData** (from https://instantdatagh.com):
  - `INSTANTDATA_API_KEY` - API key for data delivery
  - `INSTANTDATA_API_URL` - API endpoint (default: `https://instantdatagh.com/api.php/orders`)

- **Server**:
  - `PORT` - Server port (default: 3000)
  - `NODE_ENV` - Environment (development/production)
  - `CORS_ORIGIN` - Comma-separated allowed origins

### 3. Run Development Server

```bash
npm start
```

Server will run on `http://localhost:3000`

### 4. Deploy to Vercel

```bash
vercel deploy
```

Set environment variables in Vercel dashboard:

- Settings → Environment Variables
- Add all variables from `.env`

## API Endpoints

### POST `/api/paystack/initialize`

Initialize a payment transaction.

**Request**:

```json
{
  "email": "0591234567@example.com",
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
}
```

**Response**:

```json
{
  "success": true,
  "reference": "xxx",
  "access_code": "xxx",
  "authorization_url": "https://checkout.paystack.com/xxx",
  "publicKey": "pk_live_xxx"
}
```

### POST `/api/paystack/verify`

Verify payment and deliver data (if applicable).

**Request**:

```json
{
  "reference": "paystack_reference_xxx"
}
```

**Response** (success):

```json
{
  "success": true,
  "paystack": {
    /* Paystack transaction details */
  },
  "order": {
    "order_id": "api_order_123456",
    "status": "processing"
  },
  "dataApi": {
    /* InstantData response */
  }
}
```

**Response** (data delivery failed):

```json
{
  "success": true,
  "paystack": {
    /* Paystack details */
  },
  "order": {
    "order_id": "reference_xxx",
    "status": "pending_manual_processing"
  },
  "dataApiError": "error details"
}
```

### POST `/api/paystack/webhook`

Paystack webhook endpoint (set in Paystack dashboard).

Configure in Paystack:

- Settings → API Keys & Webhooks
- Webhook URL: `https://your-domain.com/api/paystack/webhook`
- Events: `charge.success`

## Security

### CORS

Origins are whitelist-validated. Set `CORS_ORIGIN` environment variable:

```
CORS_ORIGIN=https://exclusave-shop.vercel.app,https://another-domain.com
```

### Rate Limiting

Prevents abuse with token bucket algorithm:

- `RATE_LIMIT_WINDOW_MS` - Time window (default: 60000ms)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `RATE_LIMIT_BURST` - Burst capacity (default: 20)

### Request Headers

All requests must include:

- `Content-Type: application/json`
- `Origin` or `Referer` header (for CORS)

## Monitoring

### Logs

The backend logs important events:

- Payment verification: `[Verify] ✅ Payment verified successfully`
- Data API calls: `[Verify] 🚀 Calling InstantData API`
- Errors: `[Verify] ❌ Data API error`
- Webhook events: `[Webhook] event: charge.success status: processed`

### Firebase Admin Dashboard

Check transactions saved by frontend:

- Go to Firebase Console → Firestore Database
- Collection: `transactions`
- Each transaction includes:
  - `orderId` - Paystack reference or InstantData order_id
  - `status` - "completed" or "processing" or "pending_manual_processing"
  - `paystack` - Full Paystack response
  - `dataApi` - Full InstantData response (if applicable)
  - `dataApiError` - Error details (if delivery failed)

## Troubleshooting

### Payment doesn't initialize

- Check `PAYSTACK_SECRET_KEY` is set and correct
- Verify `CORS_ORIGIN` includes your frontend domain
- Check browser console for CORS errors

### Data not delivered after payment

- Check `INSTANTDATA_API_KEY` is set and correct
- Verify network is MTN/AirtelTigo/Telecel
- Check backend logs for API error details
- For MTN: Verify phone format is `0XXXXXXXXX` (10 digits)
- For data_amount: Should be numeric string like "1", "2", "5"

### Webhook not processing

- Verify webhook URL in Paystack dashboard is correct
- Check webhook signature validation in logs
- Ensure `PAYSTACK_SECRET_KEY` is same as in Paystack dashboard

### Rate limiting issues

- Adjust `RATE_LIMIT_MAX` and `RATE_LIMIT_BURST` in `.env`
- Check client IP with `x-forwarded-for` header

## Development

### Run locally

```bash
npm start
```

### Test with Vercel locally

```bash
npm install -g vercel
vercel dev
```

### View logs on Vercel

```bash
vercel logs
```

## Next Steps

1. ✅ Update frontend `.env` to point to backend
2. ✅ Remove `VITE_INSTANTDATA_API_KEY` from frontend (not needed)
3. ✅ Test payment flow end-to-end
4. ✅ Monitor Firebase transactions
5. Configure Paystack webhook (if auto-processing needed)
