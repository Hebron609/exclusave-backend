// update-featured-admin-products.js
// Run this script ONCE to migrate all existing admin products to 'featured' and remove shop linkage.
// Usage: node update-featured-admin-products.js

import { config as dotenvConfig } from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

dotenvConfig();

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  throw new Error("FIREBASE_SERVICE_ACCOUNT not found in .env");
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function migrateAdminProducts() {
  const productsRef = db.collection("products");
  // Fetch all products (batch if needed for large collections)
  const snapshot = await productsRef.get();

  if (snapshot.empty) {
    console.log("No products found.");
    return;
  }

  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Case-insensitive match for vendor_name containing 'exclusave admin' or 'exclusave admin' with any capitalization
    if (
      data.vendor_name &&
      typeof data.vendor_name === "string" &&
      data.vendor_name.toLowerCase().includes("exclusave admin")
    ) {
      await doc.ref.update({
        featured: true,
        vendor_id: FieldValue.delete(),
        vendor_name: FieldValue.delete(),
      });
      updated++;
      console.log(`Updated product: ${doc.id}`);
    }
  }
  console.log(`Migration complete. Updated ${updated} products.`);
}

migrateAdminProducts().catch(console.error);