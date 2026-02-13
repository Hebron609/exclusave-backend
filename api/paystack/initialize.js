import axios from "axios";
import {
  originCheck,
  rateLimit,
  bad,
  serverError,
  ok,
} from "../_lib/security.js";

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    originCheck(req, res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;
  if (!originCheck(req, res)) return;
  try {
    const { email, amount, callback_url, metadata, channels } = req.body || {};
    if (!email || !amount) {
      return bad(res, "Missing email or amount");
    }
    const safeEmail = String(email).trim().toLowerCase();
    const amt = Number(amount);
    if (!safeEmail.includes("@") || !isFinite(amt) || amt <= 0) {
      return bad(res, "Invalid email or amount");
    }

    // Check InstantData balance BEFORE calling Paystack
    const INSTANTDATA_API_KEY = process.env.INSTANTDATA_API_KEY;
    const INSTANTDATA_API_URL = process.env.INSTANTDATA_API_URL;

    if (metadata && metadata.network && metadata.data_amount) {
      if (!INSTANTDATA_API_KEY || !INSTANTDATA_API_URL) {
        return serverError(res, "InstantData API not configured");
      }

      try {
        console.log("[Initialize] 🔍 Checking InstantData balance for:", {
          network: metadata.network,
          data_amount: metadata.data_amount,
        });

        const balanceCheckBody = {
          network: metadata.network,
          data_amount: metadata.data_amount,
          check_only: true, // Just check, don't deduct
        };

        const balanceResponse = await axios.post(
          INSTANTDATA_API_URL,
          balanceCheckBody,
          {
            headers: {
              "api-key": INSTANTDATA_API_KEY,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          },
        );

        console.log("[Initialize] InstantData response:", balanceResponse.data);

        // Check if balance is available
        if (
          !balanceResponse.data ||
          balanceResponse.data.status === "error" ||
          !balanceResponse.data.success
        ) {
          return bad(
            res,
            `Insufficient balance for ${metadata.network}: ${balanceResponse.data?.message || "Unknown error"}`,
          );
        }
      } catch (balanceErr) {
        console.error("[Initialize] ❌ InstantData balance check failed:", {
          message: balanceErr?.message,
          status: balanceErr?.response?.status,
          data: balanceErr?.response?.data,
        });
        return bad(
          res,
          `Cannot verify balance: ${balanceErr?.response?.data?.message || balanceErr?.message || "Service unavailable"}`,
        );
      }
    }

    const PAYSTACK_SECRET =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;
    const PAYSTACK_PUBLIC =
      process.env.PAYSTACK_LIVE_PUBLIC_KEY ||
      process.env.PAYSTACK_PUBLIC_KEY ||
      process.env.PAYSTACK_TEST_PUBLIC_KEY;

    if (!PAYSTACK_SECRET) {
      return serverError(res, "Server not configured with Paystack secret key");
    }

    const body = {
      email: safeEmail,
      amount: Math.round(amt), // Frontend already sends in pesewas
      currency: "GHS",
      ...(callback_url ? { callback_url: String(callback_url) } : {}),
      ...(metadata ? { metadata } : {}),
      channels:
        Array.isArray(channels) && channels.length > 0
          ? channels
          : ["mobile_money", "ussd"],
    };

    const r = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      body,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!r.data || !r.data.status) {
      return serverError(res, "Paystack init failed", r.data);
    }

    console.log("[Initialize] ✅ Paystack response:", {
      reference: r.data.data.reference,
      authorization_url: r.data.data.authorization_url,
      has_url: !!r.data.data.authorization_url,
    });

    return ok(res, {
      success: true,
      reference: r.data.data.reference,
      access_code: r.data.data.access_code,
      authorization_url: r.data.data.authorization_url,
      publicKey: PAYSTACK_PUBLIC,
    });
  } catch (err) {
    return serverError(
      res,
      "Initialize error",
      err?.response?.data || String(err?.message || err),
    );
  }
}
