/**
 * SendGrid Email Service
 * Sends transaction confirmations and status updates
 */

import axios from "axios";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

/**
 * Send transaction confirmation email to customer
 */
export async function sendTransactionEmail(
  customerEmail,
  transactionData,
  instantDataResponse,
  error = null,
) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn(
      "[EmailService] ⚠️  SendGrid not configured, skipping email",
    );
    return false;
  }

  if (!customerEmail) {
    console.warn("[EmailService] ⚠️  No customer email provided");
    return false;
  }

  try {
    const subject = error
      ? "❌ Data Order Failed"
      : "✅ Data Order Successful";

    const statusColor = error ? "#dc2626" : "#059669";
    const statusText = error ? "FAILED" : "PROCESSING";

    const orderInfo = instantDataResponse?.data || {};

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: ${statusColor}; margin-bottom: 20px;">${subject}</h2>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Reference:</td>
              <td style="padding: 10px 0; color: #111827;">${transactionData?.reference || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Network:</td>
              <td style="padding: 10px 0; color: #111827;">${transactionData?.order?.network || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Phone:</td>
              <td style="padding: 10px 0; color: #111827;">${transactionData?.order?.phone_number || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Data Amount:</td>
              <td style="padding: 10px 0; color: #111827;">${transactionData?.order?.data_amount || "N/A"}GB</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Amount Paid:</td>
              <td style="padding: 10px 0; color: #111827;">GH₵${(transactionData?.paystack?.amount || 0).toFixed(2)}</td>
            </tr>
            ${
              instantDataResponse?.order_id
                ? `
              <tr style="border-bottom: 1px solid #d1d5db;">
                <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Order ID:</td>
                <td style="padding: 10px 0; color: #111827; font-weight: 600;">${instantDataResponse.order_id}</td>
              </tr>
            `
                : ""
            }
            ${
              orderInfo.status
                ? `
              <tr style="border-bottom: 1px solid #d1d5db;">
                <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Status:</td>
                <td style="padding: 10px 0; color: #111827;">${orderInfo.status}</td>
              </tr>
            `
                : ""
            }
            ${
              orderInfo.expected_delivery
                ? `
              <tr style="border-bottom: 1px solid #d1d5db;">
                <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Delivery Time:</td>
                <td style="padding: 10px 0; color: #111827;">${orderInfo.expected_delivery}</td>
              </tr>
            `
                : ""
            }
            ${
              orderInfo.remaining_balance
                ? `
              <tr>
                <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Remaining Balance:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: 600;">${orderInfo.remaining_balance}</td>
              </tr>
            `
                : ""
            }
          </table>
        </div>

        ${
          error
            ? `
          <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
            <h3 style="margin: 0 0 10px 0; color: #991b1b;">Error Details</h3>
            <p style="margin: 0; color: #7f1d1d;">${error}</p>
          </div>
        `
            : ""
        }

        ${
          orderInfo.note
            ? `
          <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #1e40af;">${orderInfo.note}</p>
          </div>
        `
            : ""
        }

        <div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            This is an automated email from Exclusave Shop. If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `;

    const payload = {
      personalizations: [
        {
          to: [{ email: customerEmail }],
          subject: subject,
        },
      ],
      from: { email: SENDGRID_FROM_EMAIL, name: "Exclusave Shop" },
      content: [
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    };

    await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[EmailService] ✅ Email sent to ${customerEmail}`);
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send email:", error.message);
    return false;
  }
}

/**
 * Send admin notification about transaction
 */
export async function sendAdminNotification(
  transactionData,
  instantDataResponse,
  error = null,
) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn(
      "[EmailService] ⚠️  SendGrid not configured, skipping admin email",
    );
    return false;
  }

  try {
    const subject = error
      ? "⚠️ Data Order Failed - Manual Review Needed"
      : "📊 New Data Order Completed";

    const orderInfo = instantDataResponse?.data || {};

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="margin-bottom: 20px;">${subject}</h2>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">Complete Transaction Data</h3>
          
          <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">
${JSON.stringify(
  {
    paystack: transactionData?.paystack || {},
    order: transactionData?.order || {},
    instantData: instantDataResponse || {},
    error: error || null,
  },
  null,
  2,
)}
          </pre>
        </div>

        <p style="color: #6b7280; font-size: 12px;">
          Log in to your admin dashboard to view full details and take action if needed.
        </p>
      </div>
    `;

    const payload = {
      personalizations: [
        {
          to: [{ email: SENDGRID_FROM_EMAIL }],
          subject: subject,
        },
      ],
      from: { email: SENDGRID_FROM_EMAIL, name: "Exclusave Shop Admin" },
      content: [
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    };

    await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[EmailService] ✅ Admin notification sent`);
    return true;
  } catch (error) {
    console.error(
      "[EmailService] ❌ Failed to send admin notification:",
      error.message,
    );
    return false;
  }
}
