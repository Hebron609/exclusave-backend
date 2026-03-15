import axios from "axios";
import { body, validationResult } from "express-validator";
import { verifyVendorToken } from "../../_lib/vendorAuth.js";

export const validate = [body("callback_url").optional().isURL()];

export default async function handler(req, res) {
  if (req.method === "POST") {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid input",
          errors: errors.array(),
        });
    }
  }
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  try {
    const { vendorDoc } = await verifyVendorToken(req);

    if (vendorDoc.status !== "approved") {
      return res
        .status(403)
        .json({ success: false, message: "Vendor not approved" });
    }

    const amountGhs = Number(vendorDoc.monthlyFeeAmount || 80);
    const amount = Math.round(amountGhs * 100);

    const PAYSTACK_SECRET =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return res
        .status(500)
        .json({ success: false, message: "Paystack secret key missing" });
    }

    const callbackUrl =
      req.body?.callback_url ||
      "https://exclusave-shop.vercel.app/vendor/dashboard.html?fee=success";

    const body = {
      email: vendorDoc.email,
      amount,
      currency: "GHS",
      callback_url: callbackUrl,
      channels: ["mobile_money"],
      metadata: {
        type: "vendor_fee",
        vendorId: vendorDoc.id,
        ownerUid: vendorDoc.ownerUid,
      },
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      body,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.data?.status) {
      return res
        .status(500)
        .json({ success: false, message: "Paystack init failed" });
    }

    return res.status(200).json({
      success: true,
      reference: response.data.data.reference,
      authorization_url: response.data.data.authorization_url,
    });
  } catch (error) {
    console.error("Vendor fee init error:", error);
    const { serverError } = await import("../../_lib/security.js");
    return serverError(
      res,
      "Vendor fee init error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}