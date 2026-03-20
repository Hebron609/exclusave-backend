/**
 * POST /api/support/contact
 * Sends support form messages to support inbox via SendGrid
 */

import { sendSupportContactEmail } from "../_lib/emailService.js";

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: "Name, email, and message are required",
    });
  }

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string"
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid input types",
    });
  }

  if (name.trim().length < 2 || name.trim().length > 80) {
    return res.status(400).json({
      success: false,
      error: "Name must be between 2 and 80 characters",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid email address",
    });
  }

  if (message.trim().length < 10 || message.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      error: "Message must be between 10 and 2000 characters",
    });
  }

  try {
    const sent = await sendSupportContactEmail({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    if (!sent) {
      return res.status(503).json({
        success: false,
        error: "Email service not available. Please try again shortly.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Support message sent successfully",
    });
  } catch (error) {
    console.error("[SupportContact] ❌ Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send support message",
    });
  }
};
