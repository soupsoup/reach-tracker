# reach-tracker
A static public dashboard of source-backed article distribution. No fabricated counts, audience multipliers or estimated readership.

## Collection
`python3 scripts/collect.py` collects bounded exact-URL Bluesky and Hacker News results and checks known public source pages. Failures are stored explicitly. Public counters remain separate by platform. X, LinkedIn, Facebook and Reddit lack configured reliable collectors; NYT analytics are private. Syndication is verified through attribution evidence, not same-topic coverage. Search-index evidence and verification dates are retained separately from fresh direct checks.

GitHub Actions runs at `17,47 * * * *` (UTC), and supports manual dispatch. Scheduled runs may be delayed by GitHub. Snapshots are committed with contents-write permission; Git history preserves provenance. Every run writes an immutable timestamped snapshot. The dashboard serves up to 336 recent collections, fetching latest JSON directly from the public repository, so bot commits do not require Vercel rebuilds. All full snapshots remain available in the repository.

## Add articles and sources
Add an object with a unique id, title, publisher, published date, URL and sources to `data/articles.json`. New source records should begin as candidates unless independently verified; provide the evidence and verification date. Exact link discovery automatically promotes candidates with a direct backlink to citation. Same headlines alone never establish attribution. Known-source checks are partial discovery, not an exhaustive backlink index.

## Run and deploy
Serve the root with any static HTTP server. Vercel serves `index.html` without build dependencies. `python3 -m unittest discover -s tests` verifies canonical matching and prevents headline-only and other-article social matches. No secrets are needed by collection. Refresh status distinguishes repository data from a deployment fallback. Unavailable counters are null, not zero. Historical snapshots preserve counters, source status and failures; the dashboard summarizes source and post changes.
