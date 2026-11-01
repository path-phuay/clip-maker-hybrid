# DS-12A — Legacy Adapter Contract

Status: Implemented as a read-only compatibility inventory. This is not a renderer converter.

ClipProject v2 remains canonical. The adapter does not invoke or modify the Legacy Renderer and does not mutate source project data. Each discovered feature is marked `requires_verified_mapping` until the executable legacy source is inspected.

The inventory covers scene layers, shot actors, shot graphics, shot effects, audio/music tracks, and subtitle tracks. It reports `conversionAvailable: false` and `rendererInvocationAllowed: false`.

No field mappings, defaults, units, ordering rules, or timing formulas are approved in DS-12A. They must be derived from the complete executable Legacy Renderer source.

## DS-12B acceptance criteria

1. Inspect complete legacy source.
2. Identify accepted input shapes and required fields.
3. Verify time units, coordinate conventions, ordering, and camera semantics.
4. Define supported, unsupported, and lossy mappings.
5. Preserve the complete original v2 project.
6. Report unsupported features without silent substitutions or omissions.
7. Add real legacy fixtures and conversion tests.
8. Verify the legacy source remains unchanged.
9. Gate renderer invocation until conversion tests pass.

Tests cover inventory counts, missing collections, invalid input, and source non-mutation. They do not test conversion or rendering.
