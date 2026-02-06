import express from "express";
import initializeHandler from "./api/paystack/initialize.js";
import verifyHandler from "./api/paystack/verify.js";
import webhookHandler from "./api/paystack/webhook.js";

const app = express();
app.use(express.json());

// Mount the Vercel API handlers
app.all("/api/paystack/initialize", initializeHandler);
app.all("/api/paystack/verify", verifyHandler);
app.all("/api/paystack/webhook", webhookHandler);

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
