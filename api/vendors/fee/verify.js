import axios from "axios";
import admin from "firebase-admin";
import { body, validationResult } from "express-validator";
import { verifyVendorToken } from "../../_lib/vendorAuth.js";

const APPROVAL_DAYS = 30;

export const validate = [body("reference").isString().trim().notEmpty()];

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
    const { vendorDoc, vendorId } = await verifyVendorToken(req);
    const { reference } = req.body || {};

    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Missing reference" });
    }

    const PAYSTACK_SECRET =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return res
        .status(500)
        .json({ success: false, message: "Paystack secret key missing" });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
    );

    if (!response.data?.status || response.data.data?.status !== "success") {
      return res
        .status(400)
        .json({ success: false, message: "Payment not successful" });
    }

    const metadata = response.data.data?.metadata || {};
    if (metadata.type !== "vendor_fee" || metadata.vendorId !== vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid fee payment" });
    }

    const now = admin.firestore.Timestamp.now();
    const nextDue = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + APPROVAL_DAYS * 24 * 60 * 60 * 1000),
    );

    await admin
      .firestore()
      .collection("vendors")
      .doc(vendorId)
      .set(
        {
          monthlyFeeStatus: "paid",
          lastFeePaidAt: now,
          nextFeeDueAt: nextDue,
          updatedAt: now,
          feeHistory: admin.firestore.FieldValue.arrayUnion({
            status: "paid",
            at: now,
            reference,
          }),
        },
        { merge: true },
      );

    return res.status(200).json({ success: true, vendorId, reference });
  } catch (error) {
    console.error("Vendor fee verify error:", error);
    const { serverError } = await import("../../_lib/security.js");
    return serverError(
      res,
      "Vendor fee verify error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}