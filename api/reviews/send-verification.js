/**
 * POST /api/reviews/send-verification
 * Sends verification email to user before they can submit a review
 */

import { sendReviewVerificationEmail } from "../_lib/reviewEmailService.js";

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Valid email is required" });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    const result = await sendReviewVerificationEmail(email.toLowerCase());

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        email: email.toLowerCase(),
        token: result.token || null,
        fallback: Boolean(result.fallback),
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("[ReviewSendVerification] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification email",
    });
  }
};
