import * as admin from "firebase-admin";
import { body, validationResult } from "express-validator";
import { verifyAdminToken } from "../_lib/adminAuth.js";
import logger from "../_lib/logger.js";

export const validate = [body("uid").optional().isString().trim().notEmpty()];

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
    const adminUid = await verifyAdminToken(req);
    const { uid } = req.body || {};

    const targetUid = uid || adminUid;
    const user = await admin.auth().getUser(targetUid);
    const existingClaims = user.customClaims || {};

    await admin.auth().setCustomUserClaims(targetUid, {
      ...existingClaims,
      admin: true,
    });

    logger.info("[AdminClaims] Admin claim set", {
      targetUid,
      by: adminUid,
    });

    return res.status(200).json({ success: true, uid: targetUid });
  } catch (error) {
    logger.error("Admin claims error", {
      error: error.message,
      stack: error.stack,
    });
    const { serverError } = await import("../_lib/security.js");
    return serverError(
      res,
      "Admin claims error",
      process.env.NODE_ENV === "development" ? error.message : undefined,
    );
  }
}