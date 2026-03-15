// migrateTimestamps.js
// Script to convert string timestamps to Firestore Timestamp objects in transactions

import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

if (!serviceAccount.project_id) {
  console.error("[Firebase] Service account not configured");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrateTimestamps() {
  const snapshot = await db.collection("transactions").get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Only update if timestamp is a string
    if (data.timestamp && typeof data.timestamp === "string") {
      try {
        const ts = new Date(data.timestamp);
        if (!isNaN(ts.getTime())) {
          await doc.ref.update({ timestamp: Timestamp.fromDate(ts) });
          updated++;
          console.log(`Updated ${doc.id}: ${data.timestamp} -> Timestamp`);
        }
      } catch (err) {
        console.error(`Failed to update ${doc.id}:`, err.message);
      }
    }
  }
  console.log(`\nMigration complete. Updated ${updated} documents.`);
}

migrateTimestamps().then(() => process.exit(0));
