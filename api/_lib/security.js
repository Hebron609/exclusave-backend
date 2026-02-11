const DEFAULT_ALLOWED =
  process.env.CORS_ORIGIN ||
  "https://exclusave-backend.vercel.app,https://exclusave-shop.vercel.app,http://localhost:5173,http://localhost:5174";

const ALLOWED_ORIGINS = DEFAULT_ALLOWED.split(",").map((s) => s.trim());
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 100);
const RATE_LIMIT_BURST = Number(process.env.RATE_LIMIT_BURST || 20);

const buckets = new Map();

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) {
    return xf.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function originCheck(req, res) {
  const origin = req.headers.origin;
  const referer = req.headers.referer || "";

  // Development mode: allow localhost
  const isDevelopment =
    origin?.includes("localhost") || referer?.includes("localhost");

  if (isDevelopment) {
    // For development, be permissive
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // Production: whitelist check
    const ALLOWED = [
      "https://exclusave-backend.vercel.app",
      "https://exclusave-shop.vercel.app",
      process.env.CORS_ORIGIN || "",
    ].filter(Boolean);

    if (origin && ALLOWED.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else if (!origin) {
      // No origin (possibly backend-to-backend)
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else {
      // Origin not allowed
      res
        .status(403)
        .json({ success: false, message: "Origin not allowed: " + origin });
      return false;
    }
  }

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }

  return true;
}

export function rateLimit(req, res) {
  const now = Date.now();
  const ip = getClientIp(req);
  const entry = buckets.get(ip) || {
    tokens: RATE_LIMIT_MAX + RATE_LIMIT_BURST,
    last: now,
  };
  const elapsed = now - entry.last;
  const refill = (elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_MAX;
  entry.tokens = Math.min(
    entry.tokens + refill,
    RATE_LIMIT_MAX + RATE_LIMIT_BURST,
  );
  entry.last = now;
  if (entry.tokens < 1) {
    buckets.set(ip, entry);
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
    });
    return false;
  }
  entry.tokens -= 1;
  buckets.set(ip, entry);
  return true;
}

export function ok(res, body) {
  res.status(200).json(body);
}

export function bad(res, message, detail) {
  res.status(400).json({ success: false, message, detail });
}

export function serverError(res, message, detail) {
  res.status(500).json({ success: false, message, detail });
}
