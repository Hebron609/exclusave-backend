import "dotenv/config.js";

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import initializeHandler from "./api/paystack/initialize.js";
import verifyHandler from "./api/paystack/verify.js";
import webhookHandler from "./api/paystack/webhook.js";
import decisionHandler from "./api/vendors/decision.js";
import credentialsHandler from "./api/vendors/credentials.js";

const app = express();

// Security headers (helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://js.paystack.co",
          "https://checkout.paystack.com",
          "https://*.paystack.com",
          "https://apis.google.com",
          "https://www.googletagmanager.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.paystack.com",
          "https://www.googletagmanager.com",
        ],
        connectSrc: [
          "'self'",
          "https://exclusave-backend.vercel.app",
          "https://instantdatagh.com",
          "https://api.paystack.co",
          "https://js.paystack.co",
          "https://firestore.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://www.googletagmanager.com",
          "https://api.cloudinary.com",
        ],
        frameSrc: [
          "'self'",
          "https://checkout.paystack.com",
          "https://*.paystack.com",
          "https://applepay.cdn-apple.com",
          "https://checkout.gointerpay.net",
          "https://checkout.rch.io",
          "https://*.firebaseapp.com",
          "https://firebaseapp.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://checkout.paystack.com"],
      },
    },
  }),
);

// --- CORS CONFIGURATION (Fixes CORS for Paystack and all API routes) ---
// Allow frontend dev origin, required headers, credentials, and all methods
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5176",
      "https://www.exclusave.shop",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    exposedHeaders: ["x-csrf-token"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// Remove old manual CORS middleware if present (handled by cors package)

app.use(cookieParser());
app.use(express.json());

// --- CSRF PROTECTION ---
// Middleware order is critical:
// 1. express.json() parses JSON bodies
// 2. cookieParser() parses cookies
// 3. csurf() enables CSRF protection using cookies
//
// This ensures req.cookies and req.body are available for CSRF validation.
app.use(
  csurf({
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    },
    ignoreMethods: ["GET", "HEAD", "OPTIONS"],
  }),
);

// CSRF token endpoint for frontend to fetch token
app.get("/api/csrf-token", (req, res) => {
  try {
    const token = req.csrfToken();
    // Log for debugging
    console.log("CSRF token generated:", token);
    res.json({ csrfToken: token });
  } catch (err) {
    console.error("CSRF token endpoint error:", err);
    res.status(500).json({ error: "Failed to generate CSRF token" });
  }
});

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code !== "EBADCSRFTOKEN") return next(err);
  res.status(403).json({ error: "Invalid CSRF token" });
});

// (No manual CORS middleware needed; handled by cors package above)

// Mount the Vercel API handlers
app.all("/api/paystack/initialize", initializeHandler);
app.all("/api/paystack/verify", verifyHandler);
app.all("/api/paystack/webhook", webhookHandler);

// Vendor decision endpoint
app.all("/api/vendors/decision", decisionHandler);

// Vendor credentials endpoint
app.all("/api/vendors/credentials", credentialsHandler);

// Ping endpoint
app.all("/api/ping", (req, res) => {
  res.json({ ok: true, method: req.method });
});

// Root rewrite to /api/ping
app.get("/", (req, res) => {
  res.redirect("/api/ping");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});