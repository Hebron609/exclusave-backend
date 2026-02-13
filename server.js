import "dotenv/config.js";
import express from "express";
import initializeHandler from "./api/paystack/initialize.js";
import verifyHandler from "./api/paystack/verify.js";
import webhookHandler from "./api/paystack/webhook.js";
import checkBalanceHandler from "./api/paystack/check-balance.js";

const app = express();
app.use(express.json());

// CORS Middleware (global)
app.use((req, res, next) => {
  const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "https://exclusave-shop.vercel.app",
    "https://exclusave-backend.vercel.app",
    process.env.CORS_ORIGIN || "",
  ].filter(Boolean);

  const origin = req.headers.origin || req.headers.referer;

  // Check if origin is allowed
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) =>
      origin &&
      (origin.includes(allowed) || allowed.includes(origin.split("/")[2])),
  );

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

// Mount the Vercel API handlers
app.all("/api/paystack/initialize", initializeHandler);
app.all("/api/paystack/verify", verifyHandler);
app.all("/api/paystack/webhook", webhookHandler);
app.all("/api/paystack/check-balance", checkBalanceHandler);

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
