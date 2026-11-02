/**
 * Read-only RFC 6901 JSON Pointer utilities.
 * Returns explicit lookup state; never mutates the supplied document.
 */
export function parseJsonPointer(pointer) {
  if (typeof pointer !== "string") throw new TypeError("JSON Pointer must be a string.");
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new SyntaxError("A non-empty JSON Pointer must start with '/'.");
  return pointer.slice(1).split("/").map(segment => {
    if (/~(?![01])/u.test(segment)) throw new SyntaxError("JSON Pointer contains an invalid escape sequence.");
    return segment.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}

export function resolveJsonPointer(document, pointer) {
  let segments;
  try {
    segments = parseJsonPointer(pointer);
  } catch (error) {
    return { found: false, value: undefined, segments: [], reason: error.message };
  }
  let current = document;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return { found: false, value: undefined, segments, reason: "A parent value is not an object or array." };
    }
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(segment) || Number(segment) >= current.length) {
        return { found: false, value: undefined, segments, reason: "Array index does not exist." };
      }
      current = current[Number(segment)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return { found: false, value: undefined, segments, reason: "Object property does not exist." };
      }
      current = current[segment];
    }
  }
  return { found: true, value: current, segments, reason: null };
}

export function formatJsonPointer(pointer) {
  const segments = parseJsonPointer(pointer);
  return segments.length ? segments.map((segment, index) => {
    const label = /^\d+$/u.test(segment) ? `[${segment}]` : segment;
    return index === 0 ? label : ` → ${label}`;
  }).join("") : "(root)";
}
