import "dotenv/config.js";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import fs from "fs";

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

const serviceAccount = (() => {
  if (serviceAccountPath) {
    const fileContent = fs.readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(fileContent);
  }
  if (rawServiceAccount) {
    return JSON.parse(rawServiceAccount);
  }
  if (base64ServiceAccount) {
    const decoded = Buffer.from(base64ServiceAccount, "base64").toString(
      "utf8",
    );
    return JSON.parse(decoded);
  }
  return {};
})();

if (!serviceAccount.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not configured");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

async function ensureAdminVendor() {
  const vendorRef = db.collection("vendors").doc();
  const payload = {
    shopName: "ExcluSave Admin",
    shopDescription: "Default vendor for existing products",
    businessName: "ExcluSave",
    email: "admin@exclusave.shop",
    phone: "",
    status: "approved",
    monthlyFeeStatus: "paid",
    monthlyFeeAmount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await vendorRef.set(payload, { merge: true });
  return vendorRef.id;
}

async function migrate() {
  const adminVendorId = await ensureAdminVendor();
  const snapshot = await db.collection("products").get();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.vendor_id) {
      await doc.ref.set(
        {
          vendor_id: adminVendorId,
          vendor_name: "ExcluSave Admin",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      updated += 1;
    }
  }

  console.log(`Migration complete. Updated ${updated} products.`);
  console.log(`Admin vendor ID: ${adminVendorId}`);
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
