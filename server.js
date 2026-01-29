import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ limit: "1mb" }));

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
    const payload = req.body;
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
