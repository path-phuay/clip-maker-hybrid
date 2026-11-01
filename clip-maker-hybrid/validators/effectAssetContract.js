// validators/effectAssetContract.js
// DS-09E2 — Approved Type-driven Effect Asset Contract v1.
//
// Only explicitly listed Effect Types participate in asset-reference
// validation. Unknown Effect Types remain forward-compatible and are ignored.
//
// "none" means the Effect Type does not require an external Asset Reference.
// "required" means assetId must resolve in the named registry.

export const EFFECT_ASSET_CONTRACT = Object.freeze({
  color_adjustment: Object.freeze({ assetRequirement: "none" }),
  blur: Object.freeze({ assetRequirement: "none" }),
  drop_shadow: Object.freeze({ assetRequirement: "none" }),
  glow: Object.freeze({ assetRequirement: "none" }),
  vignette: Object.freeze({ assetRequirement: "none" }),
  film_grain: Object.freeze({ assetRequirement: "none" }),
  texture_overlay: Object.freeze({
    assetRequirement: "required",
    registry: "graphics"
  })
});
