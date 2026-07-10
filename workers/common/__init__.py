"""Shared building blocks for the ingestion workers (crawler, normalizer, deduplicator).

This package intentionally has no dependency on the TypeScript packages in the
monorepo (packages/shared, packages/market-de) -- Python cannot import them.
Instead, `common.market_de` is a hand-ported, kept-in-sync copy of the constants
defined in packages/market-de/src/index.ts. If that TS file changes, update
common/market_de.py to match.
"""
