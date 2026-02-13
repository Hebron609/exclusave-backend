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
      process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
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
 * Uses .set() with merge to create document if it doesn't exist
 */
export async function updateSystemBalance(newBalance) {
  const database = getDb();
  if (!database) return false;

  try {
    await database.collection("systemSettings").doc("instantDataConfig").set(
      {
        currentBalance: newBalance,
        lastUpdated: new Date().toISOString(),
        lastUpdateTimestamp: new Date(),
      },
      { merge: true }, // Creates document if doesn't exist
    );

    console.log(
      `[Firestore] ✅ Balance updated to GH₵${newBalance.toFixed(2)}`,
    );
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
 * Store complete transaction with FULL API data from Paystack and InstantData
 * This is the primary function for recording all transaction data
 */
export async function storeCompleteTransaction(
  paystackData,
  instantDataResponse,
  error = null,
) {
  const database = getDb();
  if (!database) return false;

  try {
    const reference = paystackData.reference;

    // Extract correct order_id from InstantData (top-level, not from processing_info)
    const dataOrderId = instantDataResponse?.data?.order_id || null;
    const dataStatus = instantDataResponse?.status || "pending";

    // Extract customer email from metadata
    const customerEmail =
      paystackData.metadata?.customer_email ||
      paystackData.metadata?.email ||
      paystackData.customer?.email ||
      "Guest";

    // Extract customer name from metadata
    const customerName = paystackData.metadata?.customer_name || "Guest";

    // Get all relevant data from both APIs
    const transactionData = {
      // --- TOP-LEVEL FIELDS FOR DASHBOARD COMPATIBILITY ---
      // Simple fields for easy querying and display
      reference: paystackData.reference,
      orderId: dataOrderId || paystackData.reference, // Order ID for display
      amount: paystackData.amount,
      user: customerEmail,
      userName: customerName,
      network: paystackData.metadata?.network || null,
      productName: paystackData.metadata?.productName || null,
      productId: paystackData.metadata?.productId || null,
      size: paystackData.metadata?.size || null,
      phone: paystackData.metadata?.phone_number || null,

      // Paystack transaction info
      paystack: {
        reference: paystackData.reference,
        amount: paystackData.amount,
        currency: paystackData.currency || "GHS",
        status: paystackData.status,
        paid_at: paystackData.paid_at,
        metadata: paystackData.metadata || {},
      },

      // Order metadata (customer info and product)
      order: {
        network: paystackData.metadata?.network || null,
        phone_number: paystackData.metadata?.phone_number || null,
        data_amount: paystackData.metadata?.data_amount || null,
        productName: paystackData.metadata?.productName || null,
        productId: paystackData.metadata?.productId || null,
        size: paystackData.metadata?.size || null,
      },

      // Customer info
      customer: {
        email: customerEmail,
        name: customerName,
        phone:
          paystackData.metadata?.phone_number ||
          paystackData.customer?.phone ||
          null,
      },

      // InstantData API response - COMPLETE
      instantData: instantDataResponse
        ? {
            status: instantDataResponse.status,
            message: instantDataResponse.message || null,
            order_id: dataOrderId, // ✅ CORRECT order_id from top level
            data: instantDataResponse.data
              ? {
                  order_id: instantDataResponse.data.order_id, // The processing order ID (for reference)
                  network: instantDataResponse.data.network || null,
                  phone_number: instantDataResponse.data.phone_number || null,
                  data_amount: instantDataResponse.data.data_amount || null,
                  amount: instantDataResponse.data.amount || null,
                  remaining_balance:
                    instantDataResponse.data.remaining_balance || null,
                  status: instantDataResponse.data.status || null,
                  note: instantDataResponse.data.note || null,
                  expected_delivery:
                    instantDataResponse.data.expected_delivery || null,
                  queue_position:
                    instantDataResponse.data.queue_position || null,
                  status_updates:
                    instantDataResponse.data.status_updates || null,
                  timestamp: instantDataResponse.data.timestamp || null,
                  processing_info:
                    instantDataResponse.data.processing_info || {},
                }
              : null,
          }
        : null,

      // ✅ Dashboard alias: same as instantData for backwards compatibility
      dataApi: instantDataResponse
        ? {
            status: instantDataResponse.status,
            message: instantDataResponse.message || null,
            order_id: dataOrderId,
            data: instantDataResponse.data
              ? {
                  order_id: instantDataResponse.data.order_id,
                  network: instantDataResponse.data.network || null,
                  phone_number: instantDataResponse.data.phone_number || null,
                  data_amount: instantDataResponse.data.data_amount || null,
                  amount: instantDataResponse.data.amount || null,
                  remaining_balance:
                    instantDataResponse.data.remaining_balance || null,
                  status: instantDataResponse.data.status || null,
                  note: instantDataResponse.data.note || null,
                }
              : null,
          }
        : null,

      // Error info (if API call failed)
      error: error ? { message: error, timestamp: new Date() } : null,

      // Balance tracking
      balanceInfo: instantDataResponse?.data?.remaining_balance
        ? {
            remaining_balance: instantDataResponse.data.remaining_balance,
            extracted_amount: instantDataResponse.data.remaining_balance
              ? parseFloat(
                  String(instantDataResponse.data.remaining_balance).replace(
                    /GH₵/g,
                    "",
                  ),
                )
              : 0,
            updated_at: new Date(),
          }
        : null,

      // Processing status
      status: dataStatus === "success" ? "completed" : "failed",
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      formattedDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };

    // Create or update document
    await database
      .collection("transactions")
      .doc(reference)
      .set(transactionData, { merge: true });

    console.log(
      `[Firestore] ✅ Complete transaction stored: ${reference} | Order: ${dataOrderId}`,
    );
    return true;
  } catch (error) {
    console.error("[Firestore] ❌ Failed to store transaction:", error.message);
    return false;
  }
}

/**
 * Update transaction with balance tracking info (LEGACY - kept for compatibility)
 */
export async function updateTransactionBalance(
  transactionId,
  balanceBeforeOrder,
  balanceAfterOrder,
  instantDataOrderId,
  instantDataCost,
) {
  const database = getDb();
  if (!database) return false;

  try {
    await database.collection("transactions").doc(transactionId).update({
      balanceBeforeOrder,
      balanceAfterOrder,
      instantDataOrderId,
      instantDataCost,
      instantDataStatus: "completed",
      updatedAt: new Date(),
    });

    console.log(`[Firestore] ✅ Transaction ${transactionId} balance recorded`);
    return true;
  } catch (error) {
    console.error(
      "[Firestore] ❌ Failed to update transaction:",
      error.message,
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
    await database.collection("transactions").doc(transactionId).update({
      instantDataStatus: "failed",
      errorDetails: errorReason,
      updatedAt: new Date(),
    });

    console.log(`[Firestore] ✅ Transaction ${transactionId} marked as failed`);
    return true;
  } catch (error) {
    console.error(
      "[Firestore] ❌ Failed to mark transaction failed:",
      error.message,
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
      console.warn(
        `[Firestore] No pricing found for ${network} ${dataAmount}GB`,
      );
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
    console.error(
      "[Firestore] ❌ Failed to check service status:",
      error.message,
    );
    return false;
  }
}
