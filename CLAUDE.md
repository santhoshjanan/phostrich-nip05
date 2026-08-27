# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

**`docs/SPEC.md` is the product and architecture spec — read it before starting any non-trivial task.** It has the full auth design, data model, identifier lifecycle, deployment topology, and the open/closed decisions. This file only covers how to operate day to day; it does not repeat what's in the spec.

## Status

Greenfield — the repo has no code yet. Once scaffolding lands, replace this section with real commands (verified against `package.json`, not assumed) and delete this note.

## UI/UX

All UI work goes through the **Impeccable** plugin. Invoke the `impeccable` skill before designing or redesigning any frontend surface — new screens and later polish/critique passes alike. This is not optional styling guidance; it's how this project meets its "robust, non-AI-slop UX" bar.

## Conventions that apply everywhere

- **Layering**: privileged logic lives in `src/lib/server/**` only; route files stay thin. Nothing under `src/lib/server` may be imported by client code.
- **Pubkeys**: store and compare as 32-byte lowercase hex everywhere — DB, cache keys, config, NIP-05 responses. Decode `npub…` at the edge in one helper; never let bech32 past it.

Full rationale for both is in `docs/SPEC.md`.
