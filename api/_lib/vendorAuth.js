import admin from "firebase-admin";

function ensureAdminInitialized() {
  if (admin.apps.length) return;
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );

  if (!serviceAccount.project_id) {
    throw new Error("Firebase admin service account not configured");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function verifyVendorToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  ensureAdminInitialized();

  const decodedToken = await admin.auth().verifyIdToken(token);
  const uid = decodedToken.uid;
  const db = admin.firestore();

  let vendorId = decodedToken.vendorId || null;
  let vendorDoc = null;

  if (vendorId) {
    const snap = await db.collection("vendors").doc(vendorId).get();
    if (snap.exists && snap.data()?.ownerUid === uid) {
      vendorDoc = { id: snap.id, ...snap.data() };
      return { uid, vendorId, vendorDoc };
    }
  }

  const querySnap = await db
    .collection("vendors")
    .where("ownerUid", "==", uid)
    .limit(1)
    .get();

  if (querySnap.empty) {
    throw new Error("Vendor profile not found");
  }

  const doc = querySnap.docs[0];
  vendorId = doc.id;
  vendorDoc = { id: doc.id, ...doc.data() };

  return { uid, vendorId, vendorDoc };
}