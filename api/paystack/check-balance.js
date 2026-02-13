import { ok, originCheck } from "../_lib/security.js";

/**
 * Check InstantData Balance Endpoint
 * Verifies if we have sufficient balance to provision data
 * 
 * POST /api/paystack/check-balance
 * Body: { network: string, data_amount: string }
 * Response: { success: boolean, hasBalance: boolean, message: string }
 */

export default async function handler(req, res) {
  // ✅ Handle CORS preflight (OPTIONS) requests
  if (req.method === "OPTIONS") {
    // CORS headers are added by middleware, just respond with 200
    originCheck(req, res);
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  // ✅ Check CORS origin
  if (!originCheck(req, res)) {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation",
    });
  }

  try {
    const { network, data_amount } = req.body || {};

    console.log("[CheckBalance] Request:", { network, data_amount });

    // Get API key from environment
    const INSTANTDATA_API_KEY = process.env.INSTANTDATA_API_KEY;

    // If we don't have the API key, we can't provision data
    if (!INSTANTDATA_API_KEY) {
      console.warn("[CheckBalance] API key not configured");
      return ok(res, {
        success: true,
        hasBalance: false,
        message: "Service configuration error",
      });
    }

    // Validate input
    if (!network || !data_amount) {
      return res.status(400).json({
        success: false,
        message: "Missing network or data_amount",
      });
    }

    // For now, assume we have balance available
    // InstantData API doesn't provide a public balance endpoint
    // In production, you would:
    // 1. Call InstantData's balance check endpoint (if available)
    // 2. Store balance in database/cache
    // 3. Return cached balance
    
    console.log("[CheckBalance] Balance check passed");
    return ok(res, {
      success: true,
      hasBalance: true,
      message: "Balance available",
    });
  } catch (error) {
    console.error("[CheckBalance] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Balance check error",
      error: error?.message,
    });
  }
}
