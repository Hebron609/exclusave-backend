import crypto from "crypto";
import axios from "axios";
import { serverError, ok } from "../_lib/security.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }
  try {
    const secret =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;
    if (!secret) {
      return serverError(res, "Server not configured with Paystack secret key");
    }

    const signature = req.headers["x-paystack-signature"];
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const computed = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    if (computed !== signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const started = Date.now();
    let status = "ignored";

    if (event?.event === "charge.success") {
      status = "processed";
      const ref = event?.data?.reference;
      if (ref) {
        try {
          await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
        } catch {
          status = "verify_failed";
        }
      }
      // TODO: persist order to database here (idempotent by reference)
    }

    const durationMs = Date.now() - started;
    console.log("[Webhook] event:", event?.event, "status:", status, "ms:", durationMs);

    return ok(res, { success: true });
  } catch (err) {
    return serverError(res, "Webhook error", err?.response?.data || String(err?.message || err));
  }
}
