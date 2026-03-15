// Script to sync approved vendors to shops collection in Firestore
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "exclusave-store",
});

const db = getFirestore();

async function syncVendorsToShops() {
  const vendorsSnap = await db
    .collection("vendors")
    .where("status", "==", "approved")
    .get();
  const batch = db.batch();
  vendorsSnap.forEach((doc) => {
    const vendor = doc.data();
    const shopDocRef = db.collection("shops").doc(doc.id);
    // Map relevant fields
    const shopData = {
      shopName: vendor.shopName || vendor.businessName || "",
      shopDescription: vendor.shopDescription || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      status: vendor.status || "",
      ownerUid: vendor.ownerUid || "",
      createdAt: vendor.createdAt || null,
      updatedAt: vendor.updatedAt || null,
      approvedAt: vendor.approvedAt || null,
      monthlyFeeAmount: vendor.monthlyFeeAmount || 0,
      monthlyFeeStatus: vendor.monthlyFeeStatus || "",
      nextFeeDueAt: vendor.nextFeeDueAt || null,
      accountHolderName: vendor.accountHolderName || "",
      accountNumber: vendor.accountNumber || "",
      bankName: vendor.bankName || "",
      registrationNumber: vendor.registrationNumber || "",
      taxId: vendor.taxId || "",
      businessLicenseUrl: vendor.businessLicenseUrl || null,
      taxCertificateUrl: vendor.taxCertificateUrl || null,
      adminNotes: vendor.adminNotes || "",
      decisionNote: vendor.decisionNote || "",
      loginEmail: vendor.loginEmail || "",
      loginIssuedAt: vendor.loginIssuedAt || null,
      credentialsIssuedAt: vendor.credentialsIssuedAt || null,
    };
    batch.set(shopDocRef, shopData, { merge: true });
  });
  await batch.commit();
  console.log("Synced approved vendors to shops collection.");
}

syncVendorsToShops().catch(console.error);
