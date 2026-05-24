---
name: package-consumer-release-proof
description: Prove a local TypeScript package from its packed installed artifact without hidden network, stale temp fixtures, or unnecessary repo copies. Use when a package release lane must validate public exports, generated declarations, and runtime import behavior from a temp consumer.
---

# Package Consumer Release Proof

## Overview

Use this skill for release-grade package validation when local source checks and in-repo smoke tests are not enough. The goal is to prove the packed artifact as a real consumer sees it, while keeping the fixture deterministic, offline-friendly, and cheap on disk.

This is for package-boundary confidence from the installed artifact, not for source-tree validation, bundler-current drift tracking, or adding new runtime API.

## Workflow

1. Read the package manifest, README release notes, and the assistant or project notes that name the current release risk.
2. Build the package artifacts first, then pack the package once.
3. Before install, inspect packed contents for manifest/files allowlist drift, including README/readme casing on case-sensitive consumers.
4. Confirm the packed README path is the one named by the manifest and docs; do not let Windows case-insensitivity hide package-file casing drift.
5. Create a fresh temp consumer root under a narrow repo-local temp path.
6. Verify the temp root exists before writing fixtures, running install, reading files, or cleanup.
7. Install only the packed tarball plus already-available local tooling:
   - prefer package-manager offline mode when the dependency cache is expected to exist
   - avoid `bun x`, rolling downloads, or implicit network fetches in release proof
   - use repo-local TypeScript or other known local binaries for declaration checks
8. Keep fixture contents minimal: package manifest, runtime import smoke, declaration-consumer smoke, and any asset import smoke needed by the public contract.
9. Avoid full-repo copies, BranchFS mounts, or broad fixture cloning unless the package contract explicitly requires them.
10. Include each declaration consumer mode that the package claims to support; do not let one module-resolution mode stand in for another. For packages with modern `exports`, keep Bundler and NodeNext declaration checks separate when subpaths exist or both consumer shapes matter.
11. For each public `exports` subpath, prove that runtime importability and declaration resolution agree. A runtime-only subpath should fail the release proof unless the manifest deliberately removes it from the public surface.
12. If the package exposes assets that bundlers rewrite, run the package's separate pinned bundler asset proof before release. Do not treat installed-artifact import proof as proof that a Vite-style `?url` asset recipe still works.
13. Keep rolling latest-version or current-tool checks in a named drift lane. They can inform future work, but they should not be required for deterministic release confidence.
14. Clean temp output deterministically, but only after checking the target path is the intended fixture root.

## Evidence To Capture

- packed tarball path and package version
- packed contents match manifest metadata and files allowlist casing
- install mode, especially offline/no-network behavior
- runtime import result through public package names and subpaths
- declaration check result through the public package surface
- declaration resolution mode used by the consumer fixture
- separate NodeNext declaration result when exported subpaths may be consumed outside bundlers
- public subpath parity: every exported runtime subpath is typed, smoked, or intentionally absent
- asset subpath proof when the package exposes required assets
- companion pinned bundler-asset proof when the package documents a bundler URL recipe
- any skipped network/current-version drift check as a separate non-release lane

## Verification

Use the package's named release lane when it exists. For `./engine`, run from `./engine`:

```powershell
bun.cmd run release:package-consumer
bun.cmd run release:wasm-asset
```

If the lane fails with `ENOENT`, first inspect temp-root creation and cleanup ordering. If it fails with `ENOSPC`, remove stale local temp artifacts and reduce fixture copying before retrying.

## Guardrails

- Do not treat in-repo source imports as installed-artifact proof.
- Do not treat packed-artifact proof as green until fixtures import from the installed package name, not relative source paths.
- Do not weaken declaration checks to make the fixture faster.
- Do not assume Bundler-mode declaration success proves NodeNext consumers.
- Do not let package `exports` expose source-layout or browser-runtime subpaths without matching type proof.
- Do not treat README/readme casing as cosmetic when the package files allowlist names a specific path.
- Do not add package dependencies that require fresh network during release proof.
- Do not fold current-version drift checks back into deterministic package release proof.
- Do not assume installed package-name resolution proves bundler asset URL rewriting.
- Do not use full repository copies for a package smoke unless the package truly needs them.
- Do not replace deterministic pinned release gates with rolling current-version checks.
