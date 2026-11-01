// validators/effectParameterContract.js
// DS-09E3A — Approved Effect Parameter Contract v1.
// All parameters are optional. Bounds are inclusive.
// Unknown Effect Types are intentionally not listed and remain forward-compatible.

const numeric = (min, max) => Object.freeze({ type: "number", min, max });
const hexColor = Object.freeze({
  type: "string",
  format: "hex-color",
  pattern: /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
});
const blendMode = Object.freeze({
  type: "string",
  enum: Object.freeze(["normal", "multiply", "screen", "overlay", "soft-light"])
});

export const EFFECT_PARAMETER_CONTRACT = Object.freeze({
  color_adjustment: Object.freeze({
    brightness: numeric(-1, 1),
    contrast: numeric(0, 2),
    saturation: numeric(0, 2)
  }),
  blur: Object.freeze({
    radius: numeric(0, 100)
  }),
  drop_shadow: Object.freeze({
    offsetX: numeric(-100, 100),
    offsetY: numeric(-100, 100),
    blurRadius: numeric(0, 100),
    color: hexColor,
    opacity: numeric(0, 1)
  }),
  glow: Object.freeze({
    intensity: numeric(0, 2),
    radius: numeric(0, 100),
    color: hexColor
  }),
  vignette: Object.freeze({
    intensity: numeric(0, 1),
    radius: numeric(0, 1)
  }),
  film_grain: Object.freeze({
    amount: numeric(0, 1),
    size: numeric(0, 1)
  }),
  texture_overlay: Object.freeze({
    opacity: numeric(0, 1),
    blendMode
  })
});
