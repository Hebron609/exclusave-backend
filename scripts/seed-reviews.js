/**
 * Seed script to populate reviews with Ghanaian names
 * Run: node scripts/seed-reviews.js
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

const dummyReviews = [
  {
    email: "daniel.boateng@gmail.com",
    name: "Daniel Boateng",
    rating: 5,
    text: "Buying data here is very straightforward. I pick the bundle, pay, and it reflects quickly. No stress, no back-and-forth, just smooth checkout every time.",
    verified: true,
    status: "approved",
    createdAt: new Date(Date.now() - 86400000 * 4),
    helpful: 11,
    flagged: false,
  },
  {
    email: "grace.asante@outlook.com",
    name: "Grace Asante",
    rating: 4,
    text: "I like how easy it is to find products on the site. The categories are clear and search works well, so I do not waste time scrolling for too long.",
    verified: true,
    status: "approved",
    createdAt: new Date(Date.now() - 86400000 * 3),
    helpful: 7,
    flagged: false,
  },
  {
    email: "michael.adjei@yahoo.com",
    name: "Michael Adjei",
    rating: 5,
    text: "Customer support is honestly fast and reliable. I had an activation question and got help almost immediately. The agent followed up until it was sorted.",
    verified: true,
    status: "approved",
    createdAt: new Date(Date.now() - 86400000 * 2),
    helpful: 9,
    flagged: false,
  },
  {
    email: "patricia.amoah@yahoo.com",
    name: "Patricia Amoah",
    rating: 4,
    text: "Prices here are affordable compared to many malls and supermarkets. I have saved money on everyday items and the quality has still been good.",
    verified: true,
    status: "approved",
    createdAt: new Date(Date.now() - 86400000),
    helpful: 8,
    flagged: false,
  },
];

async function seedReviews() {
  const database = getDb();
  if (!database) {
    console.error("❌ Failed to connect to Firebase");
    process.exit(1);
  }

  try {
    console.log("🌱 Seeding new Ghanaian reviews...");
    for (const review of dummyReviews) {
      await database.collection("reviews").add({
        ...review,
        createdAt: review.createdAt,
        updatedAt: new Date(),
      });
      console.log(`  ✓ Added review from ${review.name}`);
    }

    console.log(
      "✅ Seeding complete! All reviews are approved and ready to display.",
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding reviews:", error);
    process.exit(1);
  }
}

seedReviews();
