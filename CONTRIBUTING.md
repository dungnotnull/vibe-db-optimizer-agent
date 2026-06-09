# Contributing to vibe-db-optimizer-agent

Welcome! We're glad you want to help make database optimization accessible to vibe coders everywhere.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## How to Contribute

### Reporting Bugs

1. Check the [issue tracker](https://github.com/vibe-db/vibe-db-optimizer-agent/issues) for duplicates
2. Open a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected behavior vs actual behavior
   - Environment: OS, Node.js version, database version
   - Any relevant EXPLAIN ANALYZE output or schema files

### Suggesting Features

1. Check existing issues and PRs for similar ideas
2. Open an issue with the `enhancement` tag
3. Describe the use case: what problem does it solve, who benefits
4. If applicable, suggest an implementation approach

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes:
   - Follow existing code style (Prettier + ESLint for TS, black + ruff for Python)
   - Add/update fixtures if adding new functionality
   - Update CHANGELOG.md under Unreleased
4. Run the type checker: `npm run typecheck`
5. Run the linter: `npm run lint`
6. Test your changes end-to-end in dry-run mode:
   ```bash
   npm run agent -- analyze --schema tests/fixtures/sample_schema.sql
   npm run agent -- explain --sql "SELECT * FROM orders WHERE status = 'pending'"
   ```
7. Commit with a descriptive message
8. Push and open a PR against `main`

### Development Setup

```bash
git clone https://github.com/vibe-db/vibe-db-optimizer-agent.git
cd vibe-db-optimizer-agent
npm install
pip install -r requirements.txt
cp .env.example .env  # Edit with your API keys
npm run typecheck      # Verify everything compiles
```

### Code Style

**TypeScript:**
- Strict mode enabled (`tsconfig.json`)
- No unused variables (prefix with `_` if intentional)
- Prettier: 100 char width, single quotes, trailing commas
- ESLint: recommended + TypeScript + Prettier

**Python:**
- Type hints required
- `mypy --strict` must pass
- `black` formatting, `ruff` linting

### Project Structure

```
src/
├── agents/          # Domain logic: schema-parser, explain-analyzer, etc.
├── cli/             # Commander.js entrypoint
├── ml/              # Python FastAPI microservices
├── prompts/         # LLM prompt templates with few-shot examples
├── tools/           # Shared utilities: DB connector, LLM client, report gen
└── types/           # TypeScript interfaces and type definitions
tests/
└── fixtures/        # Sample schemas, EXPLAIN outputs, query logs
```

### Adding a New Anti-Pattern Rule

1. Add the rule function in `src/agents/schema-parser/index.ts`
2. Call it from `detectAntiPatterns()`
3. Add a test fixture in `tests/fixtures/` demonstrating the pattern
4. Update the anti-patterns list in CHANGELOG.md

### Adding a New ML Model

1. Create `src/ml/your-model/main.py` as a FastAPI service
2. Implement a model-loading fallback pattern (see existing services)
3. Add the health check and prediction endpoints
4. Document in PROJECT-detail.md §5

### Questions?

Open a [discussion](https://github.com/vibe-db/vibe-db-optimizer-agent/discussions) or ask in an issue.
