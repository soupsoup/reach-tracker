# reach-tracker.antderosa.com on the VPS

nginx serves the dashboard from the checkout and proxies `/api/*` to `reach-tracker.service`, which runs `api/register.js`, `api/registry.js` and `api/track.js` (formerly Vercel functions) through `server/serve-api.js`. Saved registrations are one JSON file per article in `/var/lib/reach-tracker/registry` (`REACH_REGISTRY_DIR`); on Vercel they were in Blob. `api/cron/` is Vercel-only and blocked.

The dashboard still reads its snapshots from `data/latest.json` on GitHub. New snapshots appear only while the **Collect public reach** GitHub Action runs; it now reads the registry from https://reach-tracker.antderosa.com/api/registry.

## Install (once, as root)

```bash
git clone https://github.com/soupsoup/reach-tracker /var/www/reach-tracker
/var/www/reach-tracker/deploy/vps/install.sh
install -d -o reach-tracker -g reach-tracker /var/lib/reach-tracker/registry
/var/www/reach-tracker/deploy/vps/seed-registry.sh
systemctl start reach-tracker-deploy && systemctl enable --now reach-tracker-deploy.timer
certbot --nginx -d reach-tracker.antderosa.com
```
