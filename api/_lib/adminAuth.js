/**
 * Admin Authentication Middleware
 * Verifies Firebase token and checks admin status in Firestore
 *
 * SECURITY: All admin endpoints must use this middleware
 */

import * as admin from "firebase-admin";

/**
 * Verify Firebase token and check if user is admin
 * @throws {Error} If token invalid or user not admin
 * @returns {string} User's UID
 */
export async function verifyAdminToken(req) {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // Check if user has admin document in Firestore
    const db = admin.firestore();
    const adminDoc = await db.collection("admins").doc(uid).get();

    if (!adminDoc.exists) {
      throw new Error("User not found in admins collection");
    }

    const adminData = adminDoc.data();
    if (adminData?.isAdmin !== true) {
      throw new Error("User is not an admin");
    }

    // Token is valid and user is admin
    return uid;
  } catch (error) {
    if (error.code === "auth/id-token-expired") {
      throw new Error("Token expired");
    }
    if (error.code === "auth/invalid-id-token") {
      throw new Error("Invalid token");
    }
    throw error;
  }
}

/**
 * Middleware to protect admin routes
 * Usage: app.post("/api/admin/...", adminAuthMiddleware, handler)
 */
export async function adminAuthMiddleware(req, res, next) {
  try {
    const adminUid = await verifyAdminToken(req);
    // Attach admin UID to request for use in handler
    req.adminUid = adminUid;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: " + error.message,
    });
  }
}

/**
 * Example usage in handler:
 *
 * export default async function handler(req, res) {
 *   if (req.method !== "POST") {
 *     return res.status(405).json({ success: false });
 *   }
 *
 *   try {
 *     // Verify admin
 *     const adminUid = await verifyAdminToken(req);
 *
 *     // Now perform admin action
 *     // Example: update system config
 *     const db = require("firebase-admin").firestore();
 *     await db.collection("systemSettings").doc("config").set({
 *       updatedBy: adminUid,
 *       updatedAt: new Date(),
 *     }, { merge: true });
 *
 *     return res.status(200).json({ success: true });
 *   } catch (error) {
 *     return res.status(403).json({
 *       success: false,
 *       message: "Forbidden"
 *     });
 *   }
 * }
 */
