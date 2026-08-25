import express from "express";
import metaHandler from "./api/meta.js";
import pingHandler from "./api/ping.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/", (req, res) => {
  req.query = { ...(req.query || {}), op: "health" };
  return metaHandler(req, res);
});

app.all("/api/meta", metaHandler);
app.all("/api/ping", pingHandler);

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`meta-ads-backend listening on ${port}`));
}
