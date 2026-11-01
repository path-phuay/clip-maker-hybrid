/**
 * Browser-side project file manager for the DS-11 application shell.
 * This module handles JSON file I/O only; validation and rendering are
 * intentionally supplied by later integration stages.
 */
export class ProjectManager {
  #project = null;
  #fileName = null;

  get project() {
    return this.#project;
  }

  get fileName() {
    return this.#fileName;
  }

  async loadFile(file) {
    if (!(file instanceof File)) {
      throw new TypeError("A browser File is required.");
    }

    const text = await file.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      const error = new Error("The selected file is not valid JSON.");
      error.cause = cause;
      throw error;
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new TypeError("A ClipProject document must be a JSON object.");
    }

    this.#project = parsed;
    this.#fileName = file.name;
    return parsed;
  }

  exportJson() {
    if (!this.#project) {
      throw new Error("No project is loaded.");
    }

    return JSON.stringify(this.#project, null, 2);
  }

  clear() {
    this.#project = null;
    this.#fileName = null;
  }
}
