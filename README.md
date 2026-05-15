# bun-basic-registry-probe

A minimal Bun probe project for Mend SCA detection testing.
Exercises five patterns in a single lockfile-based project.

## Pattern bundle

This probe covers the following five patterns from
`skills/bun-core/references/feature-coverage-patterns.md`:

| # | Pattern | How it is exercised |
|---|---------|---------------------|
| 1 | `basic-registry` | Four npm registry packages declared in `package.json` / resolved in `bun.lock` |
| 2 | `diamond-dependency` | Root declares `hono` and `zod` directly; `@hono/zod-validator` also peer-depends on both — a single resolved version of each must appear in the tree |
| 3 | `transitive-only-dep` | `undici-types@6.21.0` is never declared by root; it is only reachable via `@types/node` |
| 4 | `lockfile-jsonc-comments` | `bun.lock` contains `// comment` lines and trailing commas throughout — exercises the JSONC parser in the detection engine |
| 5 | `scoped-packages` | `@types/node` and `@hono/zod-validator` both use `@scope/name` form; tests that Mend preserves the full scoped name including the `@` prefix |

## Why bundled

All five patterns are exercised by the same lockfile-parser code path.
Mend's detection of Bun projects (via npm-resolver fallback — see
"Mend config" below) reads `bun.lock`, strips JSONC syntax (comments,
trailing commas), then walks the `packages` section. That single entry
point covers:

- **Registry source detection** (`basic-registry`) — every package entry
  in `bun.lock` encodes `name@semver`, which maps to `source: registry`.
- **JSONC robustness** (`lockfile-jsonc-comments`) — the very act of
  parsing this lockfile requires JSONC support.
- **Scoped-name preservation** (`scoped-packages`) — the lockfile keys
  `@hono/zod-validator` and `@types/node` contain `@` and `/`; a naive
  string-split parser loses the scope.
- **Diamond resolution** (`diamond-dependency`) — `hono` and `zod` each
  appear once in the `packages` map regardless of how many times they are
  referenced; the correct behavior is a single deduplicated node.
- **Parent-chain completeness** (`transitive-only-dep`) — `undici-types`
  has no root-level declaration; a flat-manifest parser (one that reads
  only `package.json`) misses it entirely.

Bundling avoids four nearly identical stub projects while still giving the
comparator distinct assertion targets (scoped name list, diamond node
count, transitive node count).

## Package selection rationale

| Package | Version | Role |
|---------|---------|------|
| `hono` | 4.12.18 | Bun-native HTTP framework; no runtime deps (clean leaf node) |
| `zod` | 3.25.68 | Schema validation; no runtime deps (clean leaf node, v3 satisfies `@hono/zod-validator` peer range) |
| `@types/node` | 22.15.21 | Scoped TypeScript definitions; pulls in `undici-types` as a transitive |
| `@hono/zod-validator` | 0.8.0 | Scoped Hono middleware; peer-depends on `hono` and `zod`, forming the diamond |
| `undici-types` | 6.21.0 | Transitive-only; declared by `@types/node ~6.21.0`, never by root |

## Dependency graph

```
bun-basic-registry-probe (root)
├── hono@4.12.18                    [direct, leaf]
├── zod@3.25.68                     [direct, leaf]
├── @types/node@22.15.21            [direct, scoped]
│   └── undici-types@6.21.0         [transitive-only, leaf]
└── @hono/zod-validator@0.8.0       [direct, scoped]
    ├── hono@4.12.18                [diamond arm — same node as above]
    └── zod@3.25.68                 [diamond arm — same node as above]
```

Diamond arms share the single resolved version of `hono` and `zod`
already present in the packages map. No duplicate nodes.

## Mend config

**Bucket C — no `.whitesource` emitted.**

`js-bun` is NOT in Mend's `install-tool` list (see
`plugins/mend-knowledge/skills/mend-sca/references/whitesource-config.md`,
table row `js-bun`). Manual toolchain pinning via `scanSettings.versioning`
is impossible for this ecosystem. The probe therefore ships no
`.whitesource` file.

Implications for reproducibility:
- Mend will fall back to its npm-resolver logic, treating `bun.lock` as a
  JSON/JSONC file analogous to `package-lock.json`.
- The exact Bun version cannot be pinned; the toolchain that runs during
  scanning is whatever Mend provisions out-of-band.
- If the detection result varies between Mend versions, treat it as an
  exploratory probe rather than a regression-bound one.

For operator-side workarounds, install Bun out-of-band in the scan
environment before invoking Mend, if Bun's own pre-step is required.

This limitation is tracked in the feature-coverage catalog under
`edge-cases.md` ("Bun not in Mend's install-tool list").

## Expected tree summary

| Metric | Value |
|--------|-------|
| Direct dependencies | 4 |
| Transitive dependencies | 1 (`undici-types`) |
| Total packages | 5 |
| Scoped package names | `@types/node`, `@hono/zod-validator` |
| Diamond resolved packages | `hono`, `zod` (one node each, two parents each) |
| Transitive-only packages | `undici-types` |

## Known Mend failure modes (from feature-coverage-patterns.md)

1. **JSONC parse failure** — standard JSON parser rejects comments and
   trailing commas; Mend emits 0 dependencies.
2. **Scope stripping** — `@types/node` reported as `node`, losing the
   `@types` scope.
3. **Diamond duplication** — `hono` or `zod` reported twice (once as
   direct, once as transitive of `@hono/zod-validator`).
4. **Missing transitive** — `undici-types` absent because the scanner
   only reads `package.json` (manifest-only path).
5. **Packages-tuple misparse** — Bun's `["name@ver", {meta}, "hash"]`
   tuple format not understood, all packages dropped.

## Resolver notes

The UA javascript.md resolver documents npm resolver behavior. Bun is
NOT a named UA resolver — every Bun-specific feature (JSONC lockfile,
workspace section, packages-tuple) is a probe target for
"Mend cannot detect this." The npm resolver fallback reads lockfiles
structured like `package-lock.json`; Bun's JSONC format with tuple
entries diverges from that shape. Detection fidelity is exploratory
for this ecosystem.

---

Tracked in: docs/BUN_COVERAGE_PLAN.md §11.1 entry #1