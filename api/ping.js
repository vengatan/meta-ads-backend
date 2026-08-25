export const runtime = "nodejs";

export default async function handler() {
  return Response.json({
    ok: true,
    service: "meta-ads-backend",
    runtime: "vercel-web-standard-node"
  });
}
