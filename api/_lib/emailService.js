/**
 * SendGrid Email Service
 * Sends transaction confirmations and status updates
 */

import axios from "axios";
import validator from "validator";

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
    console.warn("[EmailService] ⚠️  SendGrid not configured, skipping email");
    return false;
  }

  if (!customerEmail) {
    console.warn("[EmailService] ⚠️  No customer email provided");
    return false;
  }

  try {
    const subject = error ? "❌ Data Order Failed" : "✅ Data Order Successful";
    const statusColor = error ? "#dc2626" : "#059669";
    const statusText = error ? "FAILED" : "PROCESSING";
    const orderInfo = instantDataResponse?.data || {};
    // Sanitize all dynamic fields
    const safeSubject = validator.escape(subject);
    const safeReference = validator.escape(
      String(transactionData?.reference || "N/A"),
    );
    const safeNetwork = validator.escape(
      String(transactionData?.order?.network || "N/A"),
    );
    const safePhone = validator.escape(
      String(transactionData?.order?.phone_number || "N/A"),
    );
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: ${statusColor}; margin-bottom: 20px;">${safeSubject}</h2>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Reference:</td>
              <td style="padding: 10px 0; color: #111827;">${safeReference}</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Network:</td>
              <td style="padding: 10px 0; color: #111827;">${safeNetwork}</td>
            </tr>
            <tr style="border-bottom: 1px solid #d1d5db;">
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">Phone:</td>
              <td style="padding: 10px 0; color: #111827;">${safePhone}</td>
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

    const emailResponse = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[EmailService] ✅ Email sent to ${customerEmail} (Status: ${emailResponse.status})`,
    );
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send email:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      from_email: SENDGRID_FROM_EMAIL,
      to_email: customerEmail,
    });
    console.error("[EmailService] 💡 Troubleshooting tips:");
    console.error("  1. Verify SendGrid API key is valid (starts with 'SG.')");
    console.error("  2. Verify sender email in SendGrid dashboard");
    console.error("  3. Check domain authentication if using custom domain");
    console.error("  4. Check SendGrid account status (not suspended)");
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

    const adminResponse = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[EmailService] ✅ Admin notification sent (Status: ${adminResponse.status})`,
    );
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send admin notification:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}

/**
 * Send vendor application decision email
 */
export async function sendVendorDecisionEmail(
  vendorEmail,
  vendorName,
  status,
  note = "",
  loginEmail = "",
  tempPassword = "",
) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn("[EmailService] ⚠️  SendGrid not configured, skipping email");
    return false;
  }

  if (!vendorEmail) {
    console.warn("[EmailService] ⚠️  No vendor email provided");
    return false;
  }

  const isApproved = status === "approved";
  const subject = isApproved
    ? "✅ Your ExcluSave vendor application was approved"
    : "❌ Your ExcluSave vendor application was declined";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusText = isApproved ? "APPROVED" : "REJECTED";
  // Sanitize all dynamic fields
  const safeSubject = validator.escape(subject);
  const safeVendorName = validator.escape(String(vendorName || "Vendor"));
  const safeStatusText = validator.escape(statusText);
  const safeNote = note ? validator.escape(String(note)) : "";
  const safeLoginEmail = loginEmail ? validator.escape(String(loginEmail)) : "";
  const safeTempPassword = tempPassword
    ? validator.escape(String(tempPassword))
    : "";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: ${statusColor}; margin-bottom: 12px;">${safeSubject}</h2>
      <p style="margin: 0 0 12px 0; color: #111827;">
        Hello ${safeVendorName}, your application status is <strong>${safeStatusText}</strong>.
      </p>
      ${
        safeNote
          ? `<div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <p style="margin: 0; color: #374151;">${safeNote}</p>
            </div>`
          : ""
      }
      ${
        isApproved
          ? `<p style="margin: 0 0 12px 0; color: #111827;">You can now sign in to your vendor dashboard and start adding products.</p>
             <p style="margin: 0 0 8px 0; color: #111827;"><strong>Login URL:</strong> https://exclusave-shop.vercel.app/vendor/login.html</p>
             ${
               safeLoginEmail
                 ? `<p style="margin: 0 0 8px 0; color: #111827;"><strong>Email:</strong> ${safeLoginEmail}</p>`
                 : ""
             }
             ${
               safeTempPassword
                 ? `<p style="margin: 0 0 8px 0; color: #111827;"><strong>Temporary password:</strong> ${safeTempPassword}</p>
                    <p style="margin: 0; color: #6b7280;">Please change your password after your first login.</p>`
                 : ""
             }`
          : `<p style="margin: 0; color: #6b7280;">If you have questions, reply to this email or contact support.</p>`
      }
    </div>
  `;

  const payload = {
    personalizations: [
      {
        to: [{ email: vendorEmail }],
        subject: subject,
      },
    ],
    from: { email: SENDGRID_FROM_EMAIL, name: "ExcluSave" },
    content: [
      {
        type: "text/html",
        value: htmlContent,
      },
    ],
  };

  try {
    const response = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `[EmailService] ✅ Vendor decision email sent to ${vendorEmail} (Status: ${response.status})`,
    );
    console.log("[EmailService] 📌 Vendor decision context:", {
      vendorEmail,
      vendorName,
      status,
      hasNote: Boolean(note),
      loginEmail: loginEmail || "",
      tempPasswordIssued: Boolean(tempPassword),
    });
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send vendor decision email:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}

/**
 * Send vendor application received email
 */
export async function sendVendorApplicationReceivedEmail(
  vendorEmail,
  vendorName,
  shopName,
) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn("[EmailService] ⚠️  SendGrid not configured, skipping email");
    return false;
  }

  if (!vendorEmail) {
    console.warn("[EmailService] ⚠️  No vendor email provided");
    return false;
  }

  const subject = "✅ We received your vendor application";
  // Sanitize all dynamic fields
  const safeVendorName = validator.escape(String(vendorName || "Vendor"));
  const safeShopName = validator.escape(String(shopName || "your shop"));
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #111827; margin-bottom: 12px;">Thanks for applying, ${safeVendorName}!</h2>
      <p style="margin: 0 0 12px 0; color: #374151;">We received your application for <strong>${safeShopName}</strong>.</p>
      <p style="margin: 0 0 12px 0; color: #6b7280;">Our team will review it within 24-48 hours and notify you by email.</p>
      <p style="margin: 0; color: #6b7280;">If you have questions, reply to this email.</p>
    </div>
  `;

  const payload = {
    personalizations: [
      {
        to: [{ email: vendorEmail }],
        subject: subject,
      },
    ],
    from: { email: SENDGRID_FROM_EMAIL, name: "ExcluSave" },
    content: [
      {
        type: "text/html",
        value: htmlContent,
      },
    ],
  };

  try {
    const response = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `[EmailService] ✅ Application received email sent to ${vendorEmail} (Status: ${response.status})`,
    );
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send application email:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}

/**
 * Send new shop alert to admins
 */
export async function sendNewShopAlertEmail(adminEmails, vendorData = {}) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn("[EmailService] ⚠️  SendGrid not configured, skipping email");
    return false;
  }

  const recipients = Array.isArray(adminEmails) ? adminEmails : [];
  if (!recipients.length) {
    console.warn("[EmailService] ⚠️  No admin emails provided");
    return false;
  }

  const subject = "🏪 New shop approved on ExcluSave";
  // Sanitize all dynamic fields
  const safeShopName = validator.escape(
    String(vendorData.shopName || "A vendor"),
  );
  const safeEmail = validator.escape(String(vendorData.email || "-"));
  const safePhone = validator.escape(String(vendorData.phone || "-"));
  const safeStatus = validator.escape(String(vendorData.status || "approved"));
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #111827; margin-bottom: 12px;">New Shop Approved</h2>
      <p style="margin: 0 0 12px 0; color: #374151;"><strong>${safeShopName}</strong> has been approved.</p>
      <ul style="color: #6b7280; padding-left: 20px;">
        <li>Vendor email: ${safeEmail}</li>
        <li>Phone: ${safePhone}</li>
        <li>Status: ${safeStatus}</li>
      </ul>
    </div>
  `;

  const payload = {
    personalizations: [
      {
        to: recipients.map((email) => ({ email })),
        subject: subject,
      },
    ],
    from: { email: SENDGRID_FROM_EMAIL, name: "ExcluSave" },
    content: [
      {
        type: "text/html",
        value: htmlContent,
      },
    ],
  };

  try {
    const response = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `[EmailService] ✅ New shop alert sent to ${recipients.length} admins (Status: ${response.status})`,
    );
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send new shop alert:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}

/**
 * Send vendor fee reminder email
 */
export async function sendVendorFeeReminderEmail(
  vendorEmail,
  vendorName,
  dueDate,
) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.warn("[EmailService] ⚠️  SendGrid not configured, skipping email");
    return false;
  }

  if (!vendorEmail) {
    console.warn("[EmailService] ⚠️  No vendor email provided");
    return false;
  }

  const subject = "⏰ Monthly shop fee reminder";
  // Sanitize all dynamic fields
  const safeVendorName = validator.escape(String(vendorName || "Vendor"));
  const safeDueDate = validator.escape(String(dueDate || "soon"));
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #111827; margin-bottom: 12px;">Monthly fee reminder</h2>
      <p style="margin: 0 0 12px 0; color: #374151;">Hello ${safeVendorName}, your shop fee is due on <strong>${safeDueDate}</strong>.</p>
      <p style="margin: 0; color: #6b7280;">Please log in to your vendor dashboard to complete payment.</p>
    </div>
  `;

  const payload = {
    personalizations: [
      {
        to: [{ email: vendorEmail }],
        subject: subject,
      },
    ],
    from: { email: SENDGRID_FROM_EMAIL, name: "ExcluSave" },
    content: [
      {
        type: "text/html",
        value: htmlContent,
      },
    ],
  };

  try {
    const response = await axios.post(SENDGRID_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `[EmailService] ✅ Fee reminder email sent to ${vendorEmail} (Status: ${response.status})`,
    );
    return true;
  } catch (error) {
    console.error("[EmailService] ❌ Failed to send fee reminder email:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}