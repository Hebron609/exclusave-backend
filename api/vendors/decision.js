import admin from "firebase-admin";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import { verifyAdminToken } from "../_lib/adminAuth.js";
import {
  sendVendorDecisionEmail,
  sendNewShopAlertEmail,
} from "../_lib/emailService.js";

const APPROVAL_DAYS = 30;

const generateTempPassword = () =>
  crypto
    .randomBytes(6)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);

export const validate = [
  body("vendorId").isString().trim().notEmpty(),
  body("status").isIn(["approved", "rejected"]),
  body("note").optional().isString(),
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
    await verifyAdminToken(req);

    const { vendorId, status, note } = req.body || {};
    if (!vendorId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "vendorId and status are required" });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
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
    const now = admin.firestore.Timestamp.now();

    const updatePayload = {
      status,
      decisionNote: note || "",
      decisionAt: now,
      updatedAt: now,
    };

    let tempPassword = "";

    if (status === "approved") {
      let authUser = null;

      if (vendorData.ownerUid) {
        try {
          authUser = await admin.auth().getUser(vendorData.ownerUid);
        } catch (error) {
          authUser = null;
        }
      }

      if (!authUser && vendorData.email) {
        try {
          authUser = await admin.auth().getUserByEmail(vendorData.email);
        } catch (error) {
          authUser = null;
        }
      }

      if (!authUser && vendorData.email) {
        tempPassword = generateTempPassword();
        authUser = await admin.auth().createUser({
          email: vendorData.email,
          password: tempPassword,
        });
      }

      if (authUser && !authUser.email && vendorData.email) {
        tempPassword = generateTempPassword();
        await admin.auth().updateUser(authUser.uid, {
          email: vendorData.email,
          password: tempPassword,
        });
      }

      if (authUser?.uid) {
        const existingClaims = authUser.customClaims || {};
        await admin.auth().setCustomUserClaims(authUser.uid, {
          ...existingClaims,
          vendor: true,
          vendorId: vendorId,
        });

        updatePayload.ownerUid = authUser.uid;
        updatePayload.loginIssuedAt = now;
        updatePayload.loginEmail = vendorData.email || authUser.email || "";
      }

      updatePayload.approvedAt = now;
      updatePayload.monthlyFeeStatus = vendorData.monthlyFeeStatus || "unpaid";
      updatePayload.nextFeeDueAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + APPROVAL_DAYS * 24 * 60 * 60 * 1000),
      );
    } else {
      updatePayload.nextFeeDueAt = null;
    }

    await vendorRef.set(updatePayload, { merge: true });

    console.log("[VendorDecision] ✅ Decision saved", {
      vendorId,
      status,
      loginEmail: updatePayload.loginEmail || vendorData.email || "",
      loginIssued: Boolean(updatePayload.loginIssuedAt),
      tempPasswordIssued: Boolean(tempPassword),
    });

    await sendVendorDecisionEmail(
      vendorData.email,
      vendorData.shopName,
      status,
      note,
      updatePayload.loginEmail || vendorData.email || "",
      status === "approved" ? tempPassword : "",
    );

    if (status === "approved") {
      const adminSnapshots = await db.collection("admins").get();
      const adminEmails = adminSnapshots.docs
        .map((doc) => doc.data()?.email)
        .filter(Boolean);

      await sendNewShopAlertEmail(adminEmails, {
        shopName: vendorData.shopName,
        email: vendorData.email,
        phone: vendorData.phone,
        status: "approved",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Vendor decision error:", error);
    const { serverError } = await import("../_lib/security.js");
    return serverError(
      res,
      "Vendor decision error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}