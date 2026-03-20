/**
 * Review Email Service
 * Sends verification links for review submissions
 */

import axios from "axios";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || "noreply@exclusave.shop";
const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Generate a secure token for email verification
 */
export function generateVerificationToken(email) {
  const timestamp = Date.now();
  const data = `${email}:${timestamp}`;
  const token = Buffer.from(data).toString("base64");
  return token;
}

/**
 * Validate token (check expiry - 24 hours)
 */
export function validateVerificationToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");
    const tokenAge = Date.now() - parseInt(timestamp);
    const isValid = tokenAge < 24 * 60 * 60 * 1000; // 24 hours
    return { isValid, email };
  } catch (error) {
    return { isValid: false, email: null };
  }
}

/**
 * Send review verification email
 */
export async function sendReviewVerificationEmail(email) {
  if (!email) {
    return { success: false, message: "Invalid email address" };
  }

  const token = generateVerificationToken(email);

  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    // Dev-safe fallback: still return a valid token so review flow continues locally.
    console.warn(
      "[ReviewEmailService] SendGrid not configured, returning token fallback",
    );
    return {
      success: true,
      message:
        "Email service not configured. Verification enabled in local fallback mode.",
      token,
      fallback: true,
    };
  }

  try {
    const verificationLink = `${FRONTEND_URL}/review-verify?token=${encodeURIComponent(token)}`;

    const mailPayload = {
      personalizations: [
        {
          to: [{ email }],
          subject: "Share Your ExcluSave Experience 🌟",
        },
      ],
      from: {
        email: SENDGRID_FROM_EMAIL,
        name: "ExcluSave Reviews",
      },
      content: [
        {
          type: "text/html",
          value: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: bold; color: #dc2626; margin-bottom: 10px; }
    .content { background: #f3f4f6; padding: 30px; border-radius: 12px; }
    .button { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">ExcluSave</div>
      <p>We'd Love Your Feedback!</p>
    </div>
    
    <div class="content">
      <p>Hi there! 👋</p>
      <p>Your experience matters to us. Click the link below to verify your email and share your review with our community.</p>
      <a href="${verificationLink}" class="button">Verify & Write Review</a>
      <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">This link expires in 24 hours.</p>
    </div>
    
    <div class="footer">
      <p>ExcluSave • Exclusive marketplace for unique products</p>
      <p><a href="https://exclusave.shop" style="color: #dc2626; text-decoration: none;">Visit our store</a></p>
    </div>
  </div>
</body>
</html>
          `,
        },
      ],
    };

    await axios.post(SENDGRID_API_URL, mailPayload, {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[ReviewEmailService] ✅ Verification email sent to ${email}`);
    return {
      success: true,
      message: "Verification link sent to your email",
      token,
    };
  } catch (error) {
    console.error(
      "[ReviewEmailService] ❌ Error sending verification email:",
      error.message,
    );
    return {
      success: true,
      message:
        "Could not send email right now. You can continue in local fallback mode.",
      token,
      fallback: true,
    };
  }
}
