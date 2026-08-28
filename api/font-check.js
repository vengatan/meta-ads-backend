import fs from "node:fs";
import path from "node:path";

function walk(dir, depth = 0, out = []) {
  if (depth > 4 || out.length > 300) return out;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, depth + 1, out);
      else if (/\.(ttf|otf|ttc|woff2?)$/i.test(ent.name)) out.push(p);
    }
  } catch {}
  return out;
}

export default function handler(req, res) {
  if (!req.query || req.query.k !== "fontcheck_20260829") return res.status(404).json({ok:false});
  const roots = ["/usr/share/fonts", "/usr/local/share/fonts", "/var/task/node_modules"];
  const fonts = [];
  for (const root of roots) walk(root, 0, fonts);
  res.status(200).json({ok:true, fonts: fonts.slice(0,300)});
}
