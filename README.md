# brij

Free, open-source activity tracker for communities. Track activities, record attendance, log contributions, and build a visible history of what your community does together.

## Getting Started

```bash
pnpm install
cp packages/brij-app/.env.example packages/brij-app/.env.local
# Edit .env.local with your database and auth credentials
pnpm dev
```

## Project Structure

```
packages/
  brij-core/    # Shared library (@brij/core) — event types, design tokens
  brij-app/     # Next.js application
```

## Development

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
```

## License

Apache 2.0 — see [LICENSE](./LICENSE)

## Credits

Built with [Pentagon](https://pentagon.run)
