/**
 * Complete cleanup - removes ALL reviews from Firestore
 * Run: node scripts/cleanup-reviews.js
 */

import "dotenv/config.js";
import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

function getDb() {
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

async function cleanupReviews() {
  const database = getDb();
  if (!database) {
    console.error("❌ Failed to connect to Firebase");
    process.exit(1);
  }

  try {
    console.log("🔥 Aggressively deleting ALL reviews from Firestore...");

    let totalDeleted = 0;
    let snapshot = await database.collection("reviews").get();

    while (snapshot.docs.length > 0) {
      console.log(`Found ${snapshot.docs.length} reviews, deleting...`);

      const batch = database.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += snapshot.docs.length;

      // Check if there are more
      snapshot = await database.collection("reviews").get();
    }

    console.log(`✅ Successfully deleted ${totalDeleted} reviews`);

    // Verify deletion
    const finalCount = await database.collection("reviews").count().get();
    console.log(`🔍 Final review count: ${finalCount.data().count}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error cleaning up reviews:", error);
    process.exit(1);
  }
}

cleanupReviews();
