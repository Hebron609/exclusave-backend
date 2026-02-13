/**
 * Firebase Balance Tracking Service
 * Handles all Firestore operations for balance management
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

/**
 * Initialize Firestore
 */
function getDb() {
  if (db) return db;

  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT || "{}"
    );

    if (!serviceAccount.project_id) {
      console.error("[Firebase] Service account not configured");
      return null;
    }

    const app = initializeApp({
      credential: cert(serviceAccount),
    });

    db = getFirestore(app);
    console.log("[Firebase] ✅ Connected to Firestore");
    return db;
  } catch (error) {
    console.error("[Firebase] ❌ Failed to initialize:", error.message);
    return null;
  }
}

/**
 * Update system balance after successful transaction
 */
export async function updateSystemBalance(newBalance) {
  const database = getDb();
  if (!database) return false;

  try {
    await database
      .collection("systemSettings")
      .doc("instantDataConfig")
      .update({
        currentBalance: newBalance,
        lastUpdated: new Date(),
      });

    console.log(`[Firestore] ✅ Balance updated to GH₵${newBalance.toFixed(2)}`);
    return true;
  } catch (error) {
    console.error("[Firestore] ❌ Failed to update balance:", error.message);
    return false;
  }
}

/**
 * Get current system balance
 */
export async function getCurrentBalance() {
  const database = getDb();
  if (!database) return 0;

  try {
    const doc = await database
      .collection("systemSettings")
      .doc("instantDataConfig")
      .get();

    if (!doc.exists) {
      console.warn("[Firestore] Config document not found, returning 0");
      return 0;
    }

    return doc.data()?.currentBalance || 0;
  } catch (error) {
    console.error("[Firestore] ❌ Failed to get balance:", error.message);
    return 0;
  }
}

/**
 * Update transaction with balance tracking info
 */
export async function updateTransactionBalance(
  transactionId,
  balanceBeforeOrder,
  balanceAfterOrder,
  instantDataOrderId,
  instantDataCost
) {
  const database = getDb();
  if (!database) return false;

  try {
    await database
      .collection("transactions")
      .doc(transactionId)
      .update({
        balanceBeforeOrder,
        balanceAfterOrder,
        instantDataOrderId,
        instantDataCost,
        instantDataStatus: "completed",
        updatedAt: new Date(),
      });

    console.log(
      `[Firestore] ✅ Transaction ${transactionId} balance recorded`
    );
    return true;
  } catch (error) {
    console.error(
      "[Firestore] ❌ Failed to update transaction:",
      error.message
    );
    return false;
  }
}

/**
 * Mark transaction as failed
 */
export async function markTransactionFailed(transactionId, errorReason) {
  const database = getDb();
  if (!database) return false;

  try {
    await database
      .collection("transactions")
      .doc(transactionId)
      .update({
        instantDataStatus: "failed",
        errorDetails: errorReason,
        updatedAt: new Date(),
      });

    console.log(`[Firestore] ✅ Transaction ${transactionId} marked as failed`);
    return true;
  } catch (error) {
    console.error(
      "[Firestore] ❌ Failed to mark transaction failed:",
      error.message
    );
    return false;
  }
}

/**
 * Get pricing for a specific data package
 */
export async function getPackagePricing(network, dataAmount) {
  const database = getDb();
  if (!database) return null;

  try {
    const query = await database
      .collection("dataPackagePricing")
      .where("network", "==", network)
      .where("dataAmount", "==", String(dataAmount))
      .where("isActive", "==", true)
      .get();

    if (query.empty) {
      console.warn(`[Firestore] No pricing found for ${network} ${dataAmount}GB`);
      return null;
    }

    return query.docs[0].data();
  } catch (error) {
    console.error("[Firestore] ❌ Failed to get pricing:", error.message);
    return null;
  }
}

/**
 * Check if service is active
 */
export async function isServiceActive() {
  const database = getDb();
  if (!database) return false;

  try {
    const doc = await database
      .collection("systemSettings")
      .doc("instantDataConfig")
      .get();

    return doc.exists ? doc.data()?.isServiceActive !== false : false;
  } catch (error) {
    console.error("[Firestore] ❌ Failed to check service status:", error.message);
    return false;
  }
}
