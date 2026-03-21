import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  originCheck,
  rateLimit,
  bad,
  serverError,
  ok,
} from "../_lib/security.js";
import logger from "../_lib/logger.js";

export default async function handler(req, res) {
  // Set CORS headers using unified logic
  if (!originCheck(req, res)) return;

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Check if service is active before proceeding
  const { isServiceActive } = await import("../_lib/firebaseBalance.js");
  const serviceActive = await isServiceActive();
  if (!serviceActive) {
    return res.status(503).json({
      success: false,
      message:
        "Sorry, our service is currently unavailable as it has been temporarily disabled by the administrator. No payments can be initialized at this time. Please check back soon or contact support if you have questions.",
    });
  }

  // Log incoming request for debugging
  logger.info("[Paystack MoMo Init] Incoming request", {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers,
  });

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;
  try {
    const { email, amount, callback_url, metadata, channels, couponCode } =
      req.body || {};
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
      logger.error(
        "[Paystack MoMo Init] Missing Paystack secret key in environment",
      );
      return serverError(res, "Server not configured with Paystack secret key");
    }

    const metadataInput =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {};
    const isVendorDashboardFee = Boolean(metadataInput?.vendorUid);

    const isVendorApplicationFee =
      metadataInput?.type === "vendor_application_fee";
    const configuredVendorFeeGhs = Number(
      process.env.VENDOR_MONTHLY_FEE_GHS || 120,
    );
    const configuredDiscountPercent = Number(
      process.env.VENDOR_COUPON_DISCOUNT_PERCENT || 20,
    );
    const configuredCouponCode = String(
      process.env.VENDOR_COUPON_CODE || "MCDONALD",
    )
      .trim()
      .toUpperCase();

    let finalAmount = Math.round(amt);
    let metadataToSend = metadataInput;

    if (isVendorApplicationFee) {
      const baseAmountPesewas = Math.round(configuredVendorFeeGhs * 100);
      const normalizedCouponCode = String(couponCode || "")
        .trim()
        .toUpperCase();

      finalAmount = baseAmountPesewas;

      if (normalizedCouponCode) {
        if (normalizedCouponCode !== configuredCouponCode) {
          return bad(res, "Invalid coupon code");
        }

        finalAmount = Math.max(
          100,
          Math.round(baseAmountPesewas * (1 - configuredDiscountPercent / 100)),
        );
      }

      metadataToSend = {
        ...metadataInput,
        type: "vendor_application_fee",
        baseAmountPesewas,
        chargedAmountPesewas: finalAmount,
        ...(normalizedCouponCode
          ? {
              coupon: {
                code: normalizedCouponCode,
                percent: configuredDiscountPercent,
              },
            }
          : {}),
      };
    }

    const requestedChannels =
      Array.isArray(channels) && channels.length > 0
        ? channels
        : ["mobile_money", "ussd"];

    const body = {
      email: safeEmail,
      amount: finalAmount,
      currency: "GHS",
      ...(callback_url ? { callback_url: String(callback_url) } : {}),
      ...(metadataToSend ? { metadata: metadataToSend } : {}),
      channels: isVendorDashboardFee ? ["mobile_money"] : requestedChannels,
    };

    let r;
    try {
      r = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        body,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (err) {
      logger.error("[Paystack MoMo Init] Paystack API error", {
        error: err?.response?.data || err,
      });
      return serverError(
        res,
        "Paystack API error",
        process.env.NODE_ENV === "development"
          ? err?.response?.data
          : undefined,
      );
    }
    if (!r.data || !r.data.status) {
      return serverError(res, "Paystack init failed", r.data);
    }

    logger.info("[Paystack MoMo Init] ✅ Paystack response:", {
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
      amount: finalAmount,
      ...(isVendorApplicationFee ? { metadata: metadataToSend } : {}),
    });
  } catch (err) {
    logger.error("[Paystack MoMo Init] Unhandled error", { error: err });
    const errorDetail =
      process.env.NODE_ENV === "development"
        ? err?.response?.data || String(err?.message || err)
        : undefined;
    return serverError(res, "Initialize error", errorDetail);
  }
}
