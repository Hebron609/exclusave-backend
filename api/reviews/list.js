/**
 * GET /api/reviews/list
 * Fetches approved reviews for display on frontend
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
    const database = getDb();
    if (!database) {
      return res.status(200).json({
        success: true,
        reviews: [],
        count: 0,
        avgRating: 0,
        fallback: true,
        message: "Database not configured; returning empty reviews list",
      });
    }

    // Fetch approved reviews (without orderBy to avoid index requirement)
    const snapshot = await database
      .collection("reviews")
      .where("status", "==", "approved")
      .get();

    const reviews = snapshot.docs
      .filter((doc) => !doc.data().flagged) // Filter flagged reviews
      .map((doc) => ({
        id: doc.id,
        email: doc.data().email,
        name: doc.data().name,
        rating: doc.data().rating,
        text: doc.data().text,
        verified: doc.data().verified,
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        helpful: doc.data().helpful || 0,
      }))
      // Sort by createdAt descending in memory
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50); // Limit to 50

    // Calculate average rating
    const avgRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : 0;

    // Add CORS headers for frontend access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes

    return res.status(200).json({
      success: true,
      reviews,
      count: reviews.length,
      avgRating: parseFloat(avgRating),
    });
  } catch (error) {
    console.error("[ReviewList] ❌ Error:", error);
    return res.status(200).json({
      success: true,
      reviews: [],
      count: 0,
      avgRating: 0,
      fallback: true,
      message: "Failed to fetch reviews; returning empty list",
    });
  }
};
