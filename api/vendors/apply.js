import admin from "firebase-admin";
import axios from "axios";
import { body, validationResult } from "express-validator";
import {
  sendVendorApplicationReceivedEmail,
  sendNewShopAlertEmail,
} from "../_lib/emailService.js";

let db;

function ensureAdminInitialized() {
  // Return existing db if already initialized
  if (db) return;
  if (admin.apps && admin.apps.length > 0) {
    db = admin.firestore();
    return;
  }

  try {
    console.log("Initializing Firebase Admin...");

    // Log environment variables to debug
    console.log(
      "FIREBASE_PROJECT_ID:",
      process.env.FIREBASE_PROJECT_ID ? "set" : "NOT SET",
    );
    console.log(
      "FIREBASE_PRIVATE_KEY:",
      process.env.FIREBASE_PRIVATE_KEY ? "set" : "NOT SET",
    );
    console.log("FIREBASE_CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL);

    // Construct service account object from env variables
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    console.log("Service account keys:", Object.keys(serviceAccount));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    db = admin.firestore();
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    throw error;
  }
}

export const validate = [
  body("shopName").isString().trim().notEmpty(),
  body("businessName").isString().trim().notEmpty(),
  body("email").isEmail().normalizeEmail(),
  body("phone").isString().trim().notEmpty(),
];

export default async function handler(req, res) {
  if (req.method === "POST") {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
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
    ensureAdminInitialized();
    const payload = req.body || {};
    const requiredFields = ["shopName", "businessName", "email", "phone"];
    const missing = requiredFields.filter((field) => !payload[field]);
    if (missing.length) {
      return res
        .status(400)
        .json({ success: false, message: `Missing: ${missing.join(", ")}` });
    }

    const normalizedPayload = { ...payload };

    if (normalizedPayload.monthlyFeeStatus === "paid") {
      if (!normalizedPayload.paymentReference) {
        return res.status(400).json({
          success: false,
          message: "Missing payment reference for paid vendor application",
        });
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

      const verifyResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(normalizedPayload.paymentReference)}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        },
      );

      if (
        !verifyResponse.data?.status ||
        verifyResponse.data?.data?.status !== "success"
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor payment not successful" });
      }

      const paystackTx = verifyResponse.data.data;
      if (paystackTx?.metadata?.type !== "vendor_application_fee") {
        return res.status(400).json({
          success: false,
          message: "Invalid payment type for vendor application",
        });
      }

      const paystackEmail = String(paystackTx?.customer?.email || "")
        .trim()
        .toLowerCase();
      const formEmail = String(normalizedPayload.email || "")
        .trim()
        .toLowerCase();
      if (paystackEmail && formEmail && paystackEmail !== formEmail) {
        return res.status(400).json({
          success: false,
          message: "Payment email does not match application email",
        });
      }

      normalizedPayload.monthlyFeeAmount = Number(paystackTx.amount || 0) / 100;
      normalizedPayload.lastFeePaidAt =
        paystackTx.paid_at || normalizedPayload.lastFeePaidAt || null;
      normalizedPayload.paymentReference = paystackTx.reference;
      normalizedPayload.appliedCouponCode =
        paystackTx?.metadata?.coupon?.code || null;
      normalizedPayload.appliedDiscountPercent = Number(
        paystackTx?.metadata?.coupon?.percent || 0,
      );
    }

    // Prepare payment history entry if payment info is present
    const paymentHistory = [];
    if (
      normalizedPayload.monthlyFeeStatus === "paid" &&
      normalizedPayload.lastFeePaidAt
    ) {
      paymentHistory.push({
        date: normalizedPayload.lastFeePaidAt,
        amount: normalizedPayload.monthlyFeeAmount || 120,
        status: "paid",
        reference: normalizedPayload.paymentReference || null,
      });
    }

    const vendorRef = await db.collection("vendors").add({
      ...normalizedPayload,
      status: "pending",
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      paymentHistory,
    });

    await sendVendorApplicationReceivedEmail(
      payload.email,
      payload.businessName,
      payload.shopName,
    );

    const adminSnapshots = await db.collection("admins").get();
    const adminEmails = adminSnapshots.docs
      .map((doc) => doc.data()?.email)
      .filter(Boolean);

    await sendNewShopAlertEmail(adminEmails, {
      shopName: payload.shopName,
      email: payload.email,
      phone: payload.phone,
      status: "pending",
    });

    return res.status(200).json({ success: true, vendorId: vendorRef.id });
  } catch (error) {
    console.error("Vendor apply error:", error);
    const { serverError } = await import("../_lib/security.js");
    return serverError(
      res,
      "Vendor application error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}
