## Description

<!-- What does this PR change and why? -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation
- [ ] Performance improvement
- [ ] Refactoring

## Checklist

- [ ] `tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes
- [ ] CLI commands tested: `analyze`, `explain`, `benchmark`
- [ ] CHANGELOG.md updated (if applicable)
- [ ] New fixtures added (if applicable)

## Verification

```bash
# Commands to verify this PR
npm run agent -- analyze --schema tests/fixtures/sample_schema.sql
npm run agent -- explain --sql "SELECT * FROM orders WHERE status = 'pending'"
```
