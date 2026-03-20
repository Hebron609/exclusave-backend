import "dotenv/config.js";
import { initializeApp, cert } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

const serviceAccount = (() => {
  if (serviceAccountPath) {
    const fileContent = fs.readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(fileContent);
  }
  if (rawServiceAccount) {
    return JSON.parse(rawServiceAccount);
  }
  if (base64ServiceAccount) {
    const decoded = Buffer.from(base64ServiceAccount, "base64").toString(
      "utf8",
    );
    return JSON.parse(decoded);
  }
  return {};
})();

if (!serviceAccount.project_id) {
  console.error(
    "Firebase service account is not configured. Set FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_SERVICE_ACCOUNT_PATH.",
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function parseDescriptionChunks(description) {
  const normalized = normalizeWhitespace(description);
  const lineChunks = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks = [];

  lineChunks.forEach((line) => {
    const semicolonParts = line
      .split(/\s*;\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    semicolonParts.forEach((part) => {
      if (!part.includes(",")) {
        chunks.push(part);
        return;
      }

      const commaParts = part
        .split(/\s*,\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

      if (commaParts.length < 2) {
        chunks.push(part);
        return;
      }

      const labelParts = commaParts.filter((item) => isLabelValue(item)).length;
      const mostlyShortList = commaParts.every(
        (item) => item.length <= 45 && !/[.!?]$/.test(item),
      );

      if (labelParts >= 2 || (commaParts.length >= 3 && mostlyShortList)) {
        chunks.push(...commaParts);
      } else {
        chunks.push(part);
      }
    });
  });

  return chunks;
}

function isAlreadyStructured(description) {
  const value = String(description || "");
  return (
    /\*\*.+?\*\*/.test(value) ||
    /^\s*[-*]\s+/m.test(value) ||
    /^\s*\d+\.\s+/m.test(value)
  );
}

function isLabelValue(text) {
  return /^([^:]{2,60}):\s*(.+)$/.test(text);
}

function toStructuredDescription(rawDescription) {
  const cleaned = normalizeWhitespace(rawDescription);
  if (!cleaned) return "";
  if (isAlreadyStructured(cleaned)) return cleaned;

  const chunks = parseDescriptionChunks(cleaned);
  if (!chunks.length) return cleaned;
  if (chunks.length === 1) return chunks[0];

  let overview = "";
  const bullets = [];

  const first = chunks[0];
  if (!isLabelValue(first)) {
    overview = first;
  }

  const startIndex = overview ? 1 : 0;
  for (let i = startIndex; i < chunks.length; i += 1) {
    bullets.push(chunks[i]);
  }

  const bulletLines = bullets
    .map((item) => {
      const match = item.match(/^([^:]{2,60}):\s*(.+)$/);
      if (match) {
        const label = match[1].trim();
        const value = match[2].trim();
        return `- **${label}:** ${value}`;
      }
      return `- ${item}`;
    })
    .filter(Boolean);

  if (!overview && !bulletLines.length) return cleaned;
  if (!overview) return bulletLines.join("\n");
  if (!bulletLines.length) return overview;

  return `${overview}\n${bulletLines.join("\n")}`;
}

async function migrateDescriptions() {
  const snapshot = await db.collection("products").get();

  let scanned = 0;
  let changed = 0;
  let skippedEmpty = 0;
  let skippedStructured = 0;
  const updates = [];

  for (const document of snapshot.docs) {
    scanned += 1;
    const data = document.data() || {};
    const original = String(data.description || "").trim();

    if (!original) {
      skippedEmpty += 1;
      continue;
    }

    if (isAlreadyStructured(original)) {
      skippedStructured += 1;
      continue;
    }

    const migrated = toStructuredDescription(original);

    if (!migrated || migrated === original) {
      continue;
    }

    changed += 1;
    updates.push({
      ref: document.ref,
      id: document.id,
      before: original,
      after: migrated,
    });
  }

  console.log("Description migration scan complete.");
  console.log(`Scanned: ${scanned}`);
  console.log(`Eligible updates: ${changed}`);
  console.log(`Skipped empty: ${skippedEmpty}`);
  console.log(`Skipped already structured: ${skippedStructured}`);

  if (!updates.length) {
    console.log("No products require migration.");
    return;
  }

  console.log("\nSample changes (up to 5):");
  updates.slice(0, 5).forEach((u, idx) => {
    console.log(`\n${idx + 1}. Product ID: ${u.id}`);
    console.log(`Before: ${u.before}`);
    console.log(`After:  ${u.after}`);
  });

  if (!writeMode) {
    console.log("\nDry-run only. Re-run with --write to apply updates.");
    return;
  }

  let applied = 0;
  for (const u of updates) {
    await u.ref.set(
      {
        description: u.after,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    applied += 1;
  }

  console.log(`\nMigration complete. Updated ${applied} products.`);
}

migrateDescriptions().catch((error) => {
  console.error("Description migration failed:", error);
  process.exit(1);
});
