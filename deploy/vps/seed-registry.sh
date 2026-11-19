#!/usr/bin/env bash
# One-time: copy the URL-registered articles in data/articles.json (the
# collector imported Vercel's Blob registry there) into the VPS registry.
set -euo pipefail
DIR=/var/lib/reach-tracker/registry
cd "$(dirname "$0")/../.."
sudo -u reach-tracker env DIR="$DIR" node -e '
const fs=require("fs"),path=require("path");
const raw=JSON.parse(fs.readFileSync("data/articles.json","utf8"));
const list=Array.isArray(raw)?raw:raw.articles;
let n=0;
for (const a of list.filter(a=>a.id.startsWith("url-"))) {
  const f=path.join(process.env.DIR,a.id+".json");
  if (fs.existsSync(f)) continue;
  fs.writeFileSync(f, JSON.stringify({id:a.id,url:a.url,title:a.title,publisher:a.publisher,published:a.published??null,sources:a.sources||[],addedAt:new Date().toISOString()}));
  n++;
}
console.log("seeded", n, "article(s) into", process.env.DIR);
'
