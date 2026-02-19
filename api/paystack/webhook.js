import crypto from "crypto";
import axios from "axios";
import { serverError, ok } from "../_lib/security.js";
import {
  storeCompleteTransaction,
  updateSystemBalance,
  markTransactionFailed,
  isServiceActive,
  getDb,
} from "../_lib/firebaseBalance.js";
import { extractBalanceFromResponse } from "../_lib/balanceParser.js";
import {
  sendTransactionEmail,
  sendAdminNotification,
} from "../_lib/emailService.js";

export default async function handler(req, res) {
  // Set CORS headers for all requests
  const origin = req.headers.origin || "*";
  const allowedOrigins = [
    "https://exclusave.shop",
    "https://www.exclusave.shop",
    "https://exclusave-shop.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
  ];
  if (allowedOrigins.includes(origin) || origin === "*") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://exclusave.shop");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-paystack-signature",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
  try {
    const secret =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;
    if (!secret) {
      return serverError(res, "Server not configured with Paystack secret key");
    }

    const signature = req.headers["x-paystack-signature"];
    const raw =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const computed = crypto
      .createHmac("sha512", secret)
      .update(raw)
      .digest("hex");
    if (computed !== signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    const event =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const started = Date.now();
    let status = "ignored";

    if (event?.event === "charge.success") {
      status = "processed";
      const ref = event?.data?.reference;
      const metadata = event?.data?.metadata || {};
      const paidAt = event?.data?.paid_at; // Extract paid_at from event.data
      const amount = event?.data?.amount ? event?.data?.amount / 100 : 0; // Convert from kobo to GHS

      if (ref) {
        try {
          // Verify payment with Paystack
          await axios.get(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
            {
              headers: { Authorization: `Bearer ${secret}` },
            },
          );

          // Check if data product (MTN, AirtelTigo, Telecel)
          const isDataProduct = ["MTN", "AirtelTigo", "Telecel"].includes(
            metadata?.network,
          );

          if (
            isDataProduct &&
            metadata?.network &&
            metadata?.phone_number &&
            metadata?.data_amount
          ) {
            // Service is active check
            const active = await isServiceActive();
            if (!active) {
              console.warn(
                "[Webhook] ⚠️  Service is inactive, marking order as failed",
              );
              status = "service_inactive";
              await markTransactionFailed(ref, "Service temporarily inactive");
            } else {
              // Call InstantData API to provision data
              status = await processDataProvisioning(
                ref,
                metadata,
                paidAt,
                amount,
              );
            }
          } else {
            console.log("[Webhook] ℹ️  Non-data product order");
          }
        } catch (verifyErr) {
          status = "verify_failed";
          console.error(
            "[Webhook] ❌ Payment verification failed:",
            verifyErr.message,
          );
        }
      }
    }

    const durationMs = Date.now() - started;
    console.log(
      "[Webhook] event:",
      event?.event,
      "status:",
      status,
      "duration_ms:",
      durationMs,
    );

    return ok(res, { success: true, status });
  } catch (err) {
    // SECURITY: Only expose detailed errors in development
    const errorDetail =
      process.env.NODE_ENV === "development"
        ? err?.response?.data || String(err?.message || err)
        : undefined;
    return serverError(res, "Webhook error", errorDetail);
  }
}

/**
 * Process data provisioning with InstantData API
 */
async function processDataProvisioning(
  transactionId,
  metadata,
  paidAt = null,
  amount = 0,
) {
  let dataApiResponse = null;
  let customerEmail = null;

  try {
    // Check for duplicate transactions (prevent double processing)
    const database = getDb();
    if (database) {
      const existingDoc = await database
        .collection("transactions")
        .doc(transactionId)
        .get();
      if (existingDoc.exists) {
        console.log(
          `[Webhook] ⚠️  Transaction ${transactionId} already processed, skipping duplicate`,
        );
        return "duplicate_prevented";
      }
    }
    const INSTANTDATA_API_KEY = process.env.INSTANTDATA_API_KEY;
    const INSTANTDATA_API_URL = process.env.INSTANTDATA_API_URL;

    // Validate API configuration
    if (!INSTANTDATA_API_KEY || !INSTANTDATA_API_URL) {
      throw new Error("InstantData API not configured");
    }

    // Ensure customer_email is in metadata for transaction storage
    customerEmail = metadata?.customer_email || metadata?.email || "Guest";
    metadata.customer_email = customerEmail;

    console.log("[Webhook] 🚀 Calling InstantData API for:", {
      network: metadata.network,
      phone: metadata.phone_number,
      data_amount: metadata.data_amount,
    });

    // Call InstantData API with full order
    const response = await axios.post(
      INSTANTDATA_API_URL,
      {
        network: metadata.network,
        phone_number: metadata.phone_number,
        data_amount: metadata.data_amount,
      },
      {
        headers: {
          "x-api-key": INSTANTDATA_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    dataApiResponse = response.data;

    // Extract order_id from correct location (check both top-level and nested)
    const extractedOrderId = response.data.order_id || response.data.data?.order_id || null;
    
    console.log("[Webhook] 📊 InstantData response received:", {
      status: response.data.status,
      order_id: extractedOrderId,
      has_balance: !!response.data.data?.remaining_balance,
    });

    // ✅ Store COMPLETE transaction with ALL API data
    const paystackForStorage = {
      reference: transactionId,
      amount: amount || metadata.amount || 0,
      currency: "GHS",
      status: "success",
      paid_at: paidAt || new Date().toISOString(), // Use actual paid_at from Paystack
      metadata: metadata,
    };

    await storeCompleteTransaction(
      paystackForStorage,
      response.data, // Send entire InstantData response
      null,
    );

    // Send email confirmations
    if (customerEmail && customerEmail !== "Guest") {
      await sendTransactionEmail(
        customerEmail,
        { ...paystackForStorage, order: metadata },
        response.data,
        null,
      );
    }
    await sendAdminNotification(
      { ...paystackForStorage, order: metadata },
      response.data,
      null,
    );

    // Check if order was successful
    if (response.data.status === "success" && response.data.data) {
      // Extract new balance
      const newBalance = extractBalanceFromResponse(response.data.data);

      if (newBalance !== null) {
        // Update system balance
        await updateSystemBalance(newBalance);

        console.log(
          `[Webhook] ✅ Data provisioned successfully. New balance: GH₵${newBalance.toFixed(2)} | Order: ${response.data.order_id}`,
        );
        return "data_provisioned";
      } else {
        console.error("[Webhook] ❌ No balance in response");
        return "balance_extract_failed";
      }
    } else {
      // Order failed
      const errorMsg = response.data.message || "Unknown error";
      console.error("[Webhook] ❌ InstantData order failed:", errorMsg);

      // Store failed transaction
      await markTransactionFailed(transactionId, errorMsg);

      // Send error emails
      if (customerEmail) {
        await sendTransactionEmail(
          customerEmail,
          { ...paystackForStorage, order: metadata },
          dataApiResponse,
          errorMsg,
        );
      }
      await sendAdminNotification(
        { ...paystackForStorage, order: metadata },
        dataApiResponse,
        errorMsg,
      );

      return "instantdata_failed";
    }
  } catch (error) {
    console.error("[Webhook] ❌ Data provisioning error:", {
      message: error.message,
      status: error?.response?.status,
      data: error?.response?.data,
    });

    // Store transaction with error info
    await storeCompleteTransaction(
      {
        reference: transactionId,
        amount: amount || metadata.amount || 0,
        currency: "GHS",
        status: "failed",
        paid_at: paidAt || new Date().toISOString(),
        metadata: metadata,
      },
      dataApiResponse,
      error?.response?.data?.message || error.message,
    );

    return "provisioning_error";
  }
}
