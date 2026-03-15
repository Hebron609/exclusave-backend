import admin from "firebase-admin";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import { verifyAdminToken } from "../_lib/adminAuth.js";

const generateTempPassword = () =>
  crypto
    .randomBytes(6)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);

export const validate = [body("vendorId").isString().trim().notEmpty()];

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
    await verifyAdminToken(req);

    const { vendorId } = req.body || {};
    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "vendorId is required" });
    }

    const db = admin.firestore();
    const vendorRef = db.collection("vendors").doc(vendorId);
    const vendorSnap = await vendorRef.get();

    if (!vendorSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    const vendorData = vendorSnap.data() || {};
    const loginEmail = vendorData.email;
    if (!loginEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Vendor email is required" });
    }

    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(loginEmail);
    } catch (error) {
      authUser = null;
    }

    const tempPassword = generateTempPassword();

    if (authUser) {
      await admin.auth().updateUser(authUser.uid, { password: tempPassword });
    } else {
      authUser = await admin.auth().createUser({
        email: loginEmail,
        password: tempPassword,
      });
    }

    const existingClaims = authUser.customClaims || {};
    await admin.auth().setCustomUserClaims(authUser.uid, {
      ...existingClaims,
      vendor: true,
      vendorId: vendorId,
    });

    const now = admin.firestore.Timestamp.now();
    await vendorRef.set(
      {
        ownerUid: authUser.uid,
        loginEmail,
        loginIssuedAt: now,
        credentialsIssuedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    console.log("[VendorCredentials] ✅ Credentials created", {
      vendorId,
      loginEmail,
      ownerUid: authUser.uid,
    });

    return res.status(200).json({
      success: true,
      email: loginEmail,
      tempPassword,
    });
  } catch (error) {
    console.error("Vendor credentials error:", error);
    const { serverError } = await import("../_lib/security.js");
    return serverError(
      res,
      "Vendor credentials error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}