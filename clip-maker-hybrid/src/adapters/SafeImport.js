/**
 * DS-12D preservation-first JSON import.
 *
 * Parses JSON text and retains the exact source text for lossless export.
 * This module does not validate against ClipProject v2, convert legacy
 * fields, or invoke any renderer.
 */
const LEGACY_HINT_KEYS = new Set([
  "theme", "sky", "ground", "decor", "shapes", "actors",
  "c", "emoji", "parts", "svg", "act", "x", "y", "to", "dir",
  "cam", "tx", "hl", "ts", "gx", "lt", "am", "s", "d", "tr",
]);

function isJsonObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectTopLevelKeys(document) {
  const keys = Object.keys(document);
  const hints = keys.filter((key) => LEGACY_HINT_KEYS.has(key));
  const hasLegacyData = Object.prototype.hasOwnProperty.call(document, "legacyData");

  return {
    topLevelKeyCount: keys.length,
    legacyHintKeys: hints,
    hasLegacyData,
    classification: hints.length > 0 || hasLegacyData
      ? "legacy_indicators_present_unverified"
      : "unclassified_json_object",
    note: "Key-name inspection only; no legacy schema or runtime semantics are inferred.",
  };
}

/**
 * Import JSON text without transforming it.
 * @param {string} sourceText
 * @param {{ fileName?: string }} [options]
 */
export function importProjectText(sourceText, options = {}) {
  if (typeof sourceText !== "string") {
    throw new TypeError("Project source must be JSON text.");
  }

  let parsed;
  try {
    parsed = JSON.parse(sourceText);
  } catch (cause) {
    const error = new SyntaxError("The selected file is not valid JSON.");
    error.cause = cause;
    throw error;
  }

  if (!isJsonObject(parsed)) {
    throw new TypeError("A project document must be a top-level JSON object.");
  }

  return Object.freeze({
    importStage: "DS-12D",
    conversionAvailable: false,
    rendererInvocationAllowed: false,
    fileName: typeof options.fileName === "string" ? options.fileName : null,
    originalText: sourceText,
    document: parsed,
    inspection: inspectTopLevelKeys(parsed),
    warnings: [
      "The document was parsed but not validated against the ClipProject v2 schema.",
      "No legacy-to-v2 conversion or rendering was performed.",
      "Original JSON text is retained unchanged for export.",
    ],
  });
}

/** Return the exact imported source text, without re-serializing the object. */
export function exportOriginalText(importRecord) {
  if (
    !importRecord ||
    importRecord.importStage !== "DS-12D" ||
    typeof importRecord.originalText !== "string"
  ) {
    throw new TypeError("A DS-12D import record is required.");
  }
  return importRecord.originalText;
}
