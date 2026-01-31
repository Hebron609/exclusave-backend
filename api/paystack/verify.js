import axios from "axios";
import { originCheck, rateLimit } from "../_lib/security.js";

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

    // Trigger Data API if metadata is present
    let dataApiResponse = null;
    if (network && phone_number && data_amount) {
      try {
        dataApiResponse = await axios.post(
          "https://instantdatagh.com/api.php/orders",
          {
            network,
            phone_number,
            data_amount,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      } catch (dataErr) {
        console.error(
          "Data API error:",
          dataErr?.response?.data || dataErr?.message || dataErr,
        );
        // Don't fail the transaction if Data API fails, but include the error
        return res.status(500).json({
          success: false,
          message: "Transaction successful but Data API call failed",
          paystack: data,
          dataApiError:
            dataErr?.response?.data || String(dataErr?.message || dataErr),
        });
      }
    }

    // Extract order_id and status from Data API response
    const orderInfo = dataApiResponse?.data || {};
    const { order_id, status: dataStatus } = orderInfo;

    return res.json({
      success: true,
      paystack: data,
      order: {
        order_id,
        status: dataStatus,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Verify exception",
      detail: err?.response?.data || String(err?.message || err),
    });
  }
}
