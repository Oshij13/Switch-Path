# Switchpath web

The authenticated Switchpath dashboard for preparing accounts, teaching and versioning research playbooks, reviewing evidence, managing learned preferences, and auditing interventions.

## Commands

```bash
npm run dev
npm run lint
npm test
npm run build
```

The dashboard connects to the agent API through `NEXT_PUBLIC_SWITCHPATH_API_BASE`. Local development defaults to `http://127.0.0.1:4317`.

Sites metadata is retained for build compatibility. Publishing is intentionally separate from local development.
