/**
 * GET /api/admin/reviews
 * Fetches all reviews (pending, approved, rejected) for admin moderation
 * Includes fallback reviews stored in memory when Firebase isn't configured
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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const reviews = [];

    // Try to fetch from Firestore first
    const database = getDb();
    if (database) {
      try {
        const snapshot = await database
          .collection("reviews")
          .orderBy("createdAt", "desc")
          .get();

        const firestoreReviews = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt:
            doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
          updatedAt:
            doc.data().updatedAt?.toDate?.() || new Date(doc.data().updatedAt),
        }));

        reviews.push(...firestoreReviews);
      } catch (error) {
        console.warn(
          "[AdminReviews] Failed to fetch from Firestore:",
          error.message,
        );
      }
    }

    // Also include any fallback reviews stored in memory
    if (
      globalThis.fallbackReviews &&
      Array.isArray(globalThis.fallbackReviews)
    ) {
      // Add fallback reviews that aren't already in Firestore results
      const firestoreIds = reviews.map((r) => r.id);
      const fallbackReviews = globalThis.fallbackReviews
        .filter((r) => !firestoreIds.includes(r.id))
        .map((r) => ({
          ...r,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }));

      reviews.push(...fallbackReviews);
    }

    // Sort all reviews by createdAt descending
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Add CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    return res.status(200).json({
      success: true,
      reviews,
      count: reviews.length,
      fallback: !database,
    });
  } catch (error) {
    console.error("[AdminReviews] ❌ Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch reviews",
      message: error.message,
    });
  }
};
