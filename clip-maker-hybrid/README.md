# DS-01 — ClipProject v2 JSON Schema

Deliverable for **Task DS-01** of the Clip Maker Hybrid AI SVG Animation Generator.

## Scope

This package contains **only** the JSON Schema and its tests. It does **not**
contain a validator, renderer, or migration code — those are DS-02 / DS-03.

## Repository layout

```text
clip-maker-hybrid/
├── package.json
├── README.md
├── schema/
│   └── project.schema.json
├── fixtures/
│   ├── valid/     (4 fixtures — MUST pass)
│   └── invalid/   (11 fixtures — MUST fail)
└── tests/
    └── schema.test.mjs