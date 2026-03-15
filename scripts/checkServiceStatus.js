// Usage: node checkServiceStatus.js
import "dotenv/config";
// Make sure you have your Firebase service account JSON and set FIREBASE_SERVICE_ACCOUNT env variable

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

if (!serviceAccount.project_id) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT env variable or project_id");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const doc = await db
    .collection("systemSettings")
    .doc("instantDataConfig")
    .get();
  if (!doc.exists) {
    console.log("instantDataConfig document does not exist.");
    return;
  }
  const data = doc.data();
  console.log("instantDataConfig:", data);
  if ("isServiceActive" in data) {
    console.log("isServiceActive:", data.isServiceActive);
  } else {
    console.log("isServiceActive field not set.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
