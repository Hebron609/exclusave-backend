import admin from "firebase-admin";
import { body, validationResult } from "express-validator";
import { sendVendorFeeReminderEmail } from "../../_lib/emailService.js";

function ensureAdminInitialized() {
  if (admin.apps.length) return;
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );

  if (!serviceAccount.project_id) {
    throw new Error("Firebase admin service account not configured");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const validate = [
  body("daysAhead").optional().isInt({ min: 1, max: 60 }),
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

    const daysAhead = Number(req.body?.daysAhead || 3);
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const snapshot = await admin
      .firestore()
      .collection("vendors")
      .where("status", "==", "approved")
      .where("nextFeeDueAt", "<=", admin.firestore.Timestamp.fromDate(cutoff))
      .get();

    const results = [];

    for (const doc of snapshot.docs) {
      const vendor = doc.data();
      if (!vendor.email) continue;
      await sendVendorFeeReminderEmail(
        vendor.email,
        vendor.businessName || vendor.shopName,
        vendor.nextFeeDueAt?.toDate?.().toLocaleDateString(),
      );
      results.push(doc.id);
    }

    return res.status(200).json({ success: true, reminded: results.length });
  } catch (error) {
    console.error("Fee reminder error:", error);
    const { serverError } = await import("../../_lib/security.js");
    return serverError(
      res,
      "Fee reminder error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}