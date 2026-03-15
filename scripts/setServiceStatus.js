// Usage: node setServiceStatus.js true|false
import "dotenv/config";
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
  const arg = process.argv[2];
  if (arg !== "true" && arg !== "false") {
    console.error("Usage: node setServiceStatus.js true|false");
    process.exit(1);
  }
  const isServiceActive = arg === "true";
  await db
    .collection("systemSettings")
    .doc("instantDataConfig")
    .set({ isServiceActive }, { merge: true });
  console.log(`isServiceActive set to ${isServiceActive}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
