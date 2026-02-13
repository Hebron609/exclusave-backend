import axios from "axios";
import { originCheck, rateLimit } from "../_lib/security.js";
import {
  extractBalanceFromResponse,
  updateSystemBalance,
  updateTransactionBalance,
} from "../_lib/firebaseBalance.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;
  if (!originCheck(req, res)) return;
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

        // Track balance if successful
        if (
          dataApiResponse.data?.status === "success" &&
          dataApiResponse.data?.data
        ) {
          const newBalance = extractBalanceFromResponse(
            dataApiResponse.data.data
          );
          if (newBalance !== null) {
            await updateSystemBalance(newBalance);
            const cost = dataApiResponse.data.data.amount
              ? parseFloat(
                  String(dataApiResponse.data.data.amount).replace(/GH₵/g, "")
                )
              : 0;
            await updateTransactionBalance(
              reference,
              null,
              newBalance,
              dataApiResponse.data.data.order_id,
              cost
            );
            console.log(
              `[Verify] ✅ Balance updated: GH₵${newBalance.toFixed(2)}`
            );
          }
        }
      } catch (dataErr) {
        dataApiError =
          dataErr?.response?.data || dataErr?.message || String(dataErr);
        console.error("[Verify] ❌ Data API error:", dataApiError);

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
