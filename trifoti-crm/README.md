# TRIFOTI CRM — discovery prototype

This is an isolated GitHub Pages prototype. It does **not** modify the old ChatGPT Sites project.

## Working features
- Light responsive CRM with local browser storage, export/import JSON, editing and favorites.
- Search radar for six public procurement portals (external search links).
- Scheduled discovery collector: Google News RSS queries, every six hours via GitHub Actions.
- Discovery results are **unverified leads**, not verified open procurement procedures.
- Frontend displays a separate review queue, without silently importing into CRM.
- The workflow preserves previously discovered candidates and reports source errors.

## Safety and limitations
RSS headlines are not official procurement records. Do not infer budgets, deadlines or active status.
Never auto-submit bids, contact buyers, or claim a lead is verified.
The collector uses no API keys. GitHub Actions may be disabled by repository settings, and RSS may be unavailable from the runner.
Browser localStorage is not a shared database. Export before clearing browser data.
To build a production system: PostgreSQL with authenticated API, official licensed procurement feeds, immutable source snapshots, robust deduplication, verification pipeline and monitoring.
