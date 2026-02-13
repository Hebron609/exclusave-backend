import crypto from "crypto";
import axios from "axios";
import { serverError, ok } from "../_lib/security.js";
import {
  extractBalanceFromResponse,
  updateSystemBalance,
  updateTransactionBalance,
  markTransactionFailed,
  isServiceActive,
} from "../_lib/firebaseBalance.js";

export default async function handler(req, res) {
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
                "[Webhook] ⚠️  Service is inactive, marking order as failed"
              );
              status = "service_inactive";
              await markTransactionFailed(ref, "Service temporarily inactive");
            } else {
              // Call InstantData API to provision data
              status = await processDataProvisioning(ref, metadata);
            }
          } else {
            console.log("[Webhook] ℹ️  Non-data product order");
          }
        } catch (verifyErr) {
          status = "verify_failed";
          console.error("[Webhook] ❌ Payment verification failed:", verifyErr.message);
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
    return serverError(
      res,
      "Webhook error",
      err?.response?.data || String(err?.message || err),
    );
  }
}

/**
 * Process data provisioning with InstantData API
 */
async function processDataProvisioning(transactionId, metadata) {
  try {
    const INSTANTDATA_API_KEY = process.env.INSTANTDATA_API_KEY;
    const INSTANTDATA_API_URL = process.env.INSTANTDATA_API_URL;

    if (!INSTANTDATA_API_KEY || !INSTANTDATA_API_URL) {
      throw new Error("InstantData API not configured");
    }

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

    console.log("[Webhook] 📊 InstantData response:", {
      status: response.data.status,
      order_id: response.data.data?.order_id,
      has_balance: !!response.data.data?.remaining_balance,
    });

    // Check if order was successful
    if (response.data.status === "success" && response.data.data) {
      // Extract new balance
      const newBalance = extractBalanceFromResponse(response.data.data);

      if (newBalance !== null) {
        // Update system balance
        await updateSystemBalance(newBalance);

        // Update transaction with balance info
        const cost = response.data.data.amount
          ? parseFloat(String(response.data.data.amount).replace(/GH₵/g, ""))
          : 0;

        await updateTransactionBalance(
          transactionId,
          null, // Will be handled separately
          newBalance,
          response.data.data.order_id,
          cost,
        );

        console.log(
          `[Webhook] ✅ Data provisioned successfully. New balance: GH₵${newBalance.toFixed(2)}`
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
      await markTransactionFailed(transactionId, errorMsg);
      return "instantdata_failed";
    }
  } catch (error) {
    console.error("[Webhook] ❌ Data provisioning error:", {
      message: error.message,
      status: error?.response?.status,
      data: error?.response?.data,
    });

    // Mark transaction as failed
    await markTransactionFailed(
      transactionId,
      error?.response?.data?.message || error.message,
    );

    return "provisioning_error";
  }
}

