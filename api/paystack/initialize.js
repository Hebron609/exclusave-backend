import axios from "axios";
import {
  originCheck,
  rateLimit,
  bad,
  serverError,
  ok,
} from "../_lib/security.js";

export default async function handler(req, res) {
  // Set CORS headers for all requests
  const origin = req.headers.origin || "*";
  const allowedOrigins = ["https://exclusave-shop.vercel.app", "http://localhost:5173", "http://localhost:5174"];
  if (allowedOrigins.includes(origin) || origin === "*") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://exclusave-shop.vercel.app");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;
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
