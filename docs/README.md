# Documentation

This folder contains project documentation for the Savvy Hampers Inventory System.

## Files

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Full technical specification and design |
| [PROGRESS.md](./PROGRESS.md) | **Multi-agent tracking** - Update this when working! |
| [ETSY_INVENTORY_CACHING_PLAN.md](./ETSY_INVENTORY_CACHING_PLAN.md) | Implemented server-side caching for Etsy listing inventory |

## Multi-Agent Workflow

When using multiple AI agents (Antigravity, Kiro, Claude Code, Codex):

1. **Start of session:** Read `PROGRESS.md` to understand current state
2. **Before starting work:** Mark your task as "In Progress" in the Active Work Log
3. **During work:** Use feature branches to avoid conflicts
4. **End of session:** Update Handoff Notes with where you left off
5. **On completion:** Check off completed items and update the work log

## Branch Naming

Use descriptive branch names:
- `feature/add-stock-form`
- `feature/barcode-scanner`
- `feature/hamper-crud`
- `fix/api-error-handling`
