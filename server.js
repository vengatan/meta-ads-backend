import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", (req, res) => {
  res.send("Meta Ads API is running");
});

app.get("/insights", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const accountId = req.query.account_id;

    if (!accountId) {
      return res.status(400).json({ error: "Missing account_id" });
    }

    const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=campaign_name,adset_name,spend,impressions,clicks,ctr,cpc&date_preset=last_7d&access_token=${token}`;

    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
