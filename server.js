import express from "express";
import axios from "axios";

const app = express();
// Capture raw body for ALL requests
app.use(express.raw({ type: "*/*", limit: "2mb" }));

function parseBody(req) {
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const raw = req.body ? req.body.toString("utf8") : "";

  // If it's JSON already
  if (contentType.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return { _raw: raw }; }
  }

  // If it's form-urlencoded or text
  // Some CRMs send: {"a":1,"b":2}=
  const trimmed = raw.trim();

  // Try "key=value" style
  const eqIndex = trimmed.indexOf("=");
  const candidate = eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed;

  // Try parse candidate as JSON
  if (candidate.startsWith("{") || candidate.startsWith("[")) {
    try { return JSON.parse(candidate); } catch { /* fallthrough */ }
  }

  // Fallback: try parse whole raw
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  }

  return { _raw: raw, _contentType: contentType };
}
// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// MetForm webhook receiver
app.post("/webhooks/metform-contact", async (req, res) => {
  try {
    // Security (token in query OR header)
    const tokenFromQuery = req.query.token;
    const tokenFromHeader = req.header("x-webhook-secret");
    const expected = process.env.WEBHOOK_SECRET;

    if (expected && tokenFromQuery !== expected && tokenFromHeader !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // Raw MetForm payload
    const payload = parseBody(req);
    console.log("MetForm payload:", JSON.stringify(payload, null, 2));

    // TODO: Adjust these keys after you see real payload keys in logs
    const name =
      payload.name ||
      payload.full_name ||
      payload["Full Name"] ||
      "";
    const email =
      payload.email ||
      payload["Email"] ||
      "";
    const phone =
      payload.phone ||
      payload.mobile ||
      payload["Phone"] ||
      "";
    const message =
      payload.message ||
      payload.comments ||
      payload["Message"] ||
      "";

    if (!email || !message) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields (email/message)",
        received_keys: Object.keys(payload || {})
      });
    }

    // CRM payload (you will align this with your CRM fields)
    const crmPayload = {
      name,
      email,
      phone,
      message,
      source: "website_contact_us"
    };

    // Send to CRM
    const crmUrl = `${process.env.CRM_BASE_URL}${process.env.CRM_CREATE_LEAD_PATH}`;
    const crmResp = await axios.post(crmUrl, crmPayload, {
      headers: {
        Authorization: `Bearer ${process.env.CRM_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    console.log("CRM response status:", crmResp.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Bridge error:", err.response?.data || err.message);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/webhooks/crm-events", (req, res) => {
  const event = parseBody(req);

  console.log("CRM content-type:", req.headers["content-type"]);
  console.log("CRM webhook event PARSED:", JSON.stringify(event, null, 2));

  return res.status(200).json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
