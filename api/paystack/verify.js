import axios from "axios";
import { originCheck, rateLimit } from "../_lib/security.js";
import {
  storeCompleteTransaction,
  updateSystemBalance,
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
    "https://exclusave-shop.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
  ];
  if (allowedOrigins.includes(origin) || origin === "*") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://exclusave-shop.vercel.app",
    );
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
  if (!rateLimit(req, res)) return;
  try {
    const { reference } = req.body || {};
    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Missing reference" });
    }

    const PAYSTACK_SECRET =
      process.env.PAYSTACK_LIVE_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_TEST_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server not configured with Paystack secret key",
      });
    }

    const r = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      },
    );

    if (!r.data || !r.data.status) {
      return res.status(400).json({
        success: false,
        message: "Verification failed",
        detail: r.data,
      });
    }

    const data = r.data.data;
    if (data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Transaction not successful",
        paystack: data,
      });
    }

    // Extract metadata from Paystack response
    const metadata = data.metadata || {};
    const { network, phone_number, data_amount } = metadata;

    // Ensure customer_email is in metadata for transaction storage
    const customerEmail =
      metadata?.customer_email ||
      metadata?.email ||
      data?.customer?.email ||
      "Guest";
    metadata.customer_email = customerEmail;

    // Trigger Data API if metadata is present (MTN, AirtelTigo, Telecel only)
    let dataApiResponse = null;
    let dataApiError = null;

    const isDataProduct = ["MTN", "AirtelTigo", "Telecel"].includes(network);

    if (isDataProduct && network && phone_number && data_amount) {
      try {
        const INSTANTDATA_API_KEY = process.env.INSTANTDATA_API_KEY;
        const INSTANTDATA_API_URL =
          process.env.INSTANTDATA_API_URL ||
          "https://instantdatagh.com/api.php/orders";

        if (!INSTANTDATA_API_KEY) {
          throw new Error("InstantData API key not configured");
        }

        console.log("[Verify] 🚀 Calling InstantData API:", {
          url: INSTANTDATA_API_URL,
          network,
          phone_number,
          data_amount,
        });

        dataApiResponse = await axios.post(
          INSTANTDATA_API_URL,
          {
            network,
            phone_number,
            data_amount,
          },
          {
            headers: {
              "x-api-key": INSTANTDATA_API_KEY,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          },
        );

        console.log(
          "[Verify] ✅ InstantData API Success:",
          dataApiResponse.data,
        );

        // ✅ Store COMPLETE transaction with ALL API data
        const paystackForStorage = {
          reference: reference,
          amount: data.amount / 100, // Paystack returns in cents
          currency: data.currency || "GHS",
          status: data.status,
          paid_at: data.paid_at,
          metadata: metadata,
        };

        await storeCompleteTransaction(
          paystackForStorage,
          dataApiResponse.data, // Full InstantData response
          null,
        );

        // Send email confirmations
        if (customerEmail) {
          await sendTransactionEmail(
            customerEmail,
            { ...paystackForStorage, order: metadata },
            dataApiResponse.data,
            null,
          );
        }
        await sendAdminNotification(
          { ...paystackForStorage, order: metadata },
          dataApiResponse.data,
          null,
        );

        // Track balance if successful
        if (
          dataApiResponse.data?.status === "success" &&
          dataApiResponse.data?.data
        ) {
          const newBalance = extractBalanceFromResponse(
            dataApiResponse.data.data,
          );
          if (newBalance !== null) {
            await updateSystemBalance(newBalance);
            console.log(
              `[Verify] ✅ Balance updated: GH₵${newBalance.toFixed(2)} | Order: ${dataApiResponse.data.order_id}`,
            );
          }
        }
      } catch (dataErr) {
        dataApiError =
          dataErr?.response?.data || dataErr?.message || String(dataErr);
        console.error("[Verify] ❌ Data API error:", dataApiError);

        // Store transaction with error info
        const paystackForStorage = {
          reference: reference,
          amount: data.amount / 100,
          currency: data.currency || "GHS",
          status: data.status,
          paid_at: data.paid_at,
          metadata: metadata,
        };

        await storeCompleteTransaction(
          paystackForStorage,
          null,
          typeof dataApiError === "string"
            ? dataApiError
            : JSON.stringify(dataApiError),
        );

        // Send error emails
        if (customerEmail) {
          await sendTransactionEmail(
            customerEmail,
            { ...paystackForStorage, order: metadata },
            null,
            typeof dataApiError === "string"
              ? dataApiError
              : JSON.stringify(dataApiError),
          );
        }
        await sendAdminNotification(
          { ...paystackForStorage, order: metadata },
          null,
          typeof dataApiError === "string"
            ? dataApiError
            : JSON.stringify(dataApiError),
        );

        // For data products, mark as pending manual processing
        return res.status(200).json({
          success: true,
          paystack: data,
          dataApiError: dataApiError,
          message:
            "Payment verified but data delivery pending. Please contact support.",
          order: {
            order_id: data.reference,
            status: "pending_manual_processing",
          },
        });
      }
    }

    // Extract order_id and status from Data API response (or use Paystack reference)
    const instantDataResponse = dataApiResponse?.data || {};
    const orderInfo = instantDataResponse.data || {};
    const orderId = orderInfo.order_id || data.reference;
    const orderStatus = isDataProduct
      ? orderInfo.status || "processing"
      : "completed";

    return res.json({
      success: true,
      paystack: data,
      order: {
        order_id: orderId,
        status: orderStatus,
      },
      dataApi: dataApiResponse?.data || null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Verify exception",
      detail: err?.response?.data || String(err?.message || err),
    });
  }
}
