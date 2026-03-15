import admin from "firebase-admin";
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
    ensureAdminInitialized();
    const payload = req.body || {};
    const requiredFields = ["shopName", "businessName", "email", "phone"];
    const missing = requiredFields.filter((field) => !payload[field]);
    if (missing.length) {
      return res
        .status(400)
        .json({ success: false, message: `Missing: ${missing.join(", ")}` });
    }

    // Prepare payment history entry if payment info is present
    const paymentHistory = [];
    if (payload.monthlyFeeStatus === "paid" && payload.lastFeePaidAt) {
      paymentHistory.push({
        date: payload.lastFeePaidAt,
        amount: payload.monthlyFeeAmount || 120,
        status: "paid",
        reference: payload.paymentReference || null,
      });
    }

    const vendorRef = await db.collection("vendors").add({
      ...payload,
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