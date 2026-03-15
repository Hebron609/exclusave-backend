import cookie from "cookie";
import csurf from "csurf";

// Create a CSRF middleware instance (cookie-based)
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  },
  ignoreMethods: ["GET", "HEAD", "OPTIONS"],
});

// Helper to run middleware in Vercel serverless
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  // Set CORS headers for Vercel serverless
  const allowedOrigins = [
    "https://www.exclusave.shop",
    "http://localhost:5173",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,x-csrf-token",
    );
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  // Parse cookies for csurf
  req.cookies = cookie.parse(req.headers.cookie || "");
  // Run CSRF middleware
  try {
    await runMiddleware(req, res, csrfProtection);
    const token = req.csrfToken();
    res.status(200).json({ csrfToken: token });
  } catch (err) {
    console.error("CSRF token endpoint error:", err);
    res.status(500).json({ error: "Failed to generate CSRF token" });
  }
}