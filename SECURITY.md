# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Yes             |

## Reporting a Vulnerability

If you discover a security vulnerability in vibe-db-optimizer-agent, please report it via email to the maintainers. **Do not open a public issue.**

We will respond within 48 hours and work with you on a fix. We appreciate responsible disclosure.

## Security Architecture

### Database Access

The agent connects to databases using **read-only** credentials only:

```sql
-- Recommended PostgreSQL setup
CREATE ROLE optimizer_readonly LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_db TO optimizer_readonly;
GRANT USAGE ON SCHEMA public TO optimizer_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO optimizer_readonly;
GRANT SELECT ON pg_stat_statements TO optimizer_readonly;
```

The `db-connector.ts` module enforces read-only queries by rejecting any SQL containing INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, VACUUM, REINDEX, CLUSTER, or COPY keywords **before** sending to the database.

### Credential Management

- All credentials via environment variables (`.env` file, never committed)
- `.env.example` provided with placeholder values
- `ANTHROPIC_API_KEY` only required for LLM features; dry-run mode works without it

### Generated Code Safety

- k6 scripts run in isolated subprocesses with configurable timeout (default: 15 minutes)
- Generated DDL is always presented for review — never auto-applied to production
- All `CREATE INDEX` statements use `CONCURRENTLY` to avoid table locks

### Knowledge Crawler

- URL allowlist: only arxiv.org, vldb.org, postgresql.org are fetched
- Crawled content is sanitized and truncated before storage
- No execution of crawled content

### API Keys

- Anthropic API key used only via environment variable
- Never logged, never stored in code, never exposed in reports

## Dependencies

Dependencies are monitored for known vulnerabilities. Run:

```bash
npm audit
pip audit  # or: pip list --outdated
```
