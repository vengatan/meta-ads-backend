export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ ok: true, service: "meta-ads-backend", runtime: "vercel-node" });
}
