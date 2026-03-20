/**
 * PUT /api/admin/review-status
 * Updates the status of a review (approve/reject)
 * Handles both Firestore and fallback (local memory) reviews
 */

import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

function getDb() {
  if (db) return db;
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
    );
    if (!serviceAccount.project_id) {
      console.error("[Firebase] Service account not configured");
      return null;
    }

    let app;
    try {
      app = getApp();
    } catch (err) {
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    }

    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error("[Firebase] Failed to initialize:", error.message);
    return null;
  }
}

export default async (req, res) => {
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id, status } = req.body;

  // Validate input
  if (!id || !status) {
    return res.status(400).json({ error: "Missing id or status" });
  }

  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    // Check if it's a local/fallback review
    if (id.startsWith("local-") || id.startsWith("fallback-")) {
      // Update in memory
      if (!globalThis.fallbackReviews) {
        globalThis.fallbackReviews = [];
      }

      const reviewIndex = globalThis.fallbackReviews.findIndex(
        (r) => r.id === id,
      );
      if (reviewIndex === -1) {
        return res.status(404).json({ error: "Review not found" });
      }

      globalThis.fallbackReviews[reviewIndex].status = status;
      globalThis.fallbackReviews[reviewIndex].updatedAt =
        new Date().toISOString();

      console.log(
        `[ReviewStatus] ✅ Fallback review ${id} updated to ${status}`,
      );

      return res.status(200).json({
        success: true,
        message: `Review marked as ${status}`,
      });
    }

    // For Firestore reviews, update the database
    const database = getDb();
    if (database) {
      await database.collection("reviews").doc(id).update({
        status,
        updatedAt: new Date(),
      });

      console.log(
        `[ReviewStatus] ✅ Firestore review ${id} updated to ${status}`,
      );

      return res.status(200).json({
        success: true,
        message: `Review marked as ${status}`,
      });
    }

    return res
      .status(400)
      .json({ error: "Database not configured and review is not local" });
  } catch (error) {
    console.error("[ReviewStatus] ❌ Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update review status",
      message: error.message,
    });
  }
};
