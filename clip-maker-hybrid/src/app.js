import { ProjectManager } from "./core/ProjectManager.js";
import { getGalleryTemplates } from "./gallery/GalleryCatalog.js";
import { ImportRequestGuard } from "./core/ImportRequestGuard.js";
import { resolveJsonPointer, formatJsonPointer } from "./core/JsonPointer.js";
import { createProjectValidationService } from "./browser/validation.bundle.js";

const manager = new ProjectManager();
const importRequests = new ImportRequestGuard();
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const el = Object.fromEntries([
  "project-file", "save-project", "project-status", "message",
  "summary-title", "summary-schema", "summary-duration", "summary-resolution",
  "summary-scenes", "summary-shots", "import-classification", "import-hints",
  "import-warnings", "validation-status", "validation-summary", "validation-layers",
  "validation-issues", "validation-context",
  "gallery-grid", "gallery-detail", "gallery-message"
].map(id => [id, document.getElementById(id)]));

let validationService = null;
let validationInitializationError = null;
let currentIssues = [];

function message(value, kind = "info") {
  el.message.textContent = value;
  el.message.dataset.kind = kind;
}
function clearProjectView() {
  for (const id of ["summary-title", "summary-schema", "summary-duration", "summary-resolution", "summary-scenes", "summary-shots", "import-classification", "import-hints"]) {
    el[id].textContent = "—";
  }
  el["import-warnings"].replaceChildren();
  el["save-project"].disabled = true;
}
function beginImportAttempt() {
  const token = importRequests.begin();
  manager.clear();
  clearProjectView();
  el["project-status"].textContent = "Importing";
  el["project-status"].dataset.state = "pending";
  setValidationState(validationService ? "Ready" : validationInitializationError ? "Unavailable" : "Initializing", "Waiting for the selected JSON file.");
  message("Reading selected JSON file…");
  return token;
}
function summary(project) {
  const data = project.project ?? {};
  const resolution = data.resolution ?? {};
  el["summary-title"].textContent = data.title ?? "Untitled";
  el["summary-schema"].textContent = project.schemaVersion ?? "Unknown";
  el["summary-duration"].textContent = Number.isFinite(data.duration) ? `${data.duration} s` : "—";
  el["summary-resolution"].textContent = resolution.width && resolution.height ? `${resolution.width} × ${resolution.height}` : "—";
  el["summary-scenes"].textContent = Array.isArray(project.scenes) ? String(project.scenes.length) : "—";
  el["summary-shots"].textContent = Array.isArray(project.shots) ? String(project.shots.length) : "—";
}
function inspection(record) {
  el["import-classification"].textContent = record.inspection.classification;
  el["import-hints"].textContent = record.inspection.legacyHintKeys.join(", ") || "None detected at top level";
  el["import-warnings"].replaceChildren();
  for (const warning of record.warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    el["import-warnings"].append(item);
  }
}
function clearContext(text = "Select an issue to inspect its location and read-only data context.") {
  el["validation-context"].replaceChildren();
  const note = document.createElement("p");
  note.className = "context-empty";
  note.textContent = text;
  el["validation-context"].append(note);
}
function showIssueContext(index) {
  const issue = currentIssues[index];
  if (!issue || !manager.project) return;
  for (const button of el["validation-issues"].querySelectorAll("button")) {
    const active = Number(button.dataset.issueIndex) === index;
    button.setAttribute("aria-pressed", String(active));
  }
  const panel = el["validation-context"];
  panel.replaceChildren();
  const heading = document.createElement("h4");
  heading.textContent = issue.code ?? "VALIDATION_ERROR";
  const messageText = document.createElement("p");
  messageText.textContent = issue.message ?? "No message provided.";
  const rawPath = document.createElement("code");
  rawPath.textContent = issue.path || "(root)";
  const readable = document.createElement("p");
  readable.className = "context-path";
  try {
    readable.textContent = formatJsonPointer(issue.path || "");
  } catch {
    readable.textContent = "Path cannot be interpreted as a valid JSON Pointer.";
  }
  panel.append(heading, messageText, rawPath, readable);
  const resolved = resolveJsonPointer(manager.project, issue.path || "");
  const label = document.createElement("h5");
  label.textContent = "Read-only value at this path";
  panel.append(label);
  const value = document.createElement("pre");
  if (resolved.found) {
    try {
      value.textContent = JSON.stringify(resolved.value, null, 2);
    } catch {
      value.textContent = "The value exists but could not be formatted.";
    }
  } else {
    value.textContent = `No exact value found: ${resolved.reason ?? "path unavailable"}`;
  }
  panel.append(value);
}
function setValidationState(state, summaryText, layersText = "—") {
  el["validation-status"].textContent = state;
  el["validation-status"].dataset.state = state;
  el["validation-summary"].textContent = summaryText;
  el["validation-layers"].textContent = layersText;
  el["validation-issues"].replaceChildren();
  currentIssues = [];
  clearContext();
}
function renderValidation(result) {
  const layers = result.meta?.layers ?? [];
  const layerText = layers.length ? layers.join(" → ") : "Input check";
  if (result.valid) {
    setValidationState("Valid", "ClipProject v2 schema and reference validation passed. No issues to inspect.", layerText);
    return;
  }
  const issues = result.errors ?? [];
  setValidationState("Invalid", `${issues.length} validation error${issues.length === 1 ? "" : "s"} found. Select an issue to inspect its location.`, layerText);
  currentIssues = issues;
  currentIssues.forEach((issue, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "validation-issue-button";
    button.dataset.issueIndex = String(index);
    button.setAttribute("aria-pressed", "false");
    const heading = document.createElement("strong");
    heading.textContent = issue.code ?? "VALIDATION_ERROR";
    const detail = document.createElement("span");
    detail.textContent = issue.message ?? "No message provided.";
    const path = document.createElement("code");
    path.textContent = issue.path || "(root)";
    button.append(heading, detail, path);
    button.addEventListener("click", () => showIssueContext(index));
    item.append(button);
    el["validation-issues"].append(item);
  });
  if (currentIssues.length === 0) clearContext("No error details were returned by the validator.");
}
function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

setValidationState("Initializing", "Loading the canonical ClipProject v2 schema…");
createProjectValidationService()
  .then(service => {
    validationService = service;
    validationInitializationError = null;
    if (manager.project) {
      renderValidation(validationService.validateProject(manager.project));
      message("Validation completed. Original JSON text remains preserved for export.", "success");
    } else {
      setValidationState("Ready", "Validator initialized. Open a JSON file to validate it.");
    }
  })
  .catch(error => {
    validationInitializationError = error;
    setValidationState("Unavailable", error instanceof Error ? error.message : "Validator initialization failed.");
    if (manager.project) message("Project imported, but validation is unavailable. Original JSON export remains available.", "error");
  });

el["project-file"].addEventListener("change", async () => {
  const [file] = el["project-file"].files ?? [];
  if (!file) return;
  await importProjectFile(file);
});


// All project sources use the same guarded import and validation pipeline.
async function importProjectFile(
  file,
  sourceName = file.name,
  token = beginImportAttempt()
) {

  if (file.size > MAX_IMPORT_BYTES) {
    el["project-status"].textContent = "Import rejected";
    el["project-status"].dataset.state = "error";
    setValidationState(
      validationService ? "Ready" : validationInitializationError ? "Unavailable" : "Initializing",
      "Validation was not run because the file exceeded the import limit."
    );
    message("File exceeds the 10 MiB import limit. No project data was loaded.", "error");
    el["project-file"].value = "";
    return false;
  }

  try {
    const project = await manager.loadFile(file, {
      isCurrent: () => importRequests.isCurrent(token)
    });

    if (!importRequests.isCurrent(token)) return false;

    summary(project);
    inspection(manager.importRecord);

    el["project-status"].textContent = "JSON imported";
    el["project-status"].dataset.state = "success";
    el["save-project"].disabled = false;

    if (validationService) {
      renderValidation(validationService.validateProject(project));
      message(
        `Imported ${sourceName}. Original JSON text is preserved. Validation does not convert or render the project.`,
        "success"
      );
    } else if (validationInitializationError) {
      setValidationState(
        "Unavailable",
        validationInitializationError instanceof Error
          ? validationInitializationError.message
          : "Validator initialization failed."
      );
      message(
        `Imported ${sourceName}, but validation is unavailable. Original JSON export remains available.`,
        "error"
      );
    } else {
      setValidationState(
        "Initializing",
        "Validator is still initializing. This project will be validated when it is ready."
      );
      message(
        `Imported ${sourceName}. Original JSON text is preserved; validation is pending.`,
        "info"
      );
    }

    return true;
  } catch (error) {
    if (!importRequests.isCurrent(token)) return false;

    manager.clear();
    clearProjectView();

    el["project-status"].textContent = "Load failed";
    el["project-status"].dataset.state = "error";

    setValidationState(
      validationService ? "Ready" : validationInitializationError ? "Unavailable" : "Initializing",
      "Validation was not run because the selected file could not be imported."
    );

    message(
      error instanceof Error ? error.message : "Unable to load project.",
      "error"
    );

    return false;
  } finally {
    if (importRequests.isCurrent(token)) {
      el["project-file"].value = "";
    }
  }
}

function createGalleryElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function showGalleryDetails(template) {
  const panel = el["gallery-detail"];
  panel.replaceChildren(
    createGalleryElement("p", "gallery-detail-loading", "Loading template details...")
  );

  try {
    const response = await fetch(template.fixture);

    if (!response.ok) {
      throw new Error(`Unable to load template details (HTTP ${response.status}).`);
    }

    const project = JSON.parse(await response.text());
    const data = project.project ?? {};
    const resolution = data.resolution ?? {};

    panel.replaceChildren();

    const heading = createGalleryElement("h3", "", template.name);
    const description = createGalleryElement("p", "", template.description);
    const details = document.createElement("dl");
    details.className = "gallery-detail-list";

    const rows = [
      ["Schema", project.schemaVersion ?? "Unknown"],
      ["Duration", Number.isFinite(data.duration) ? `${data.duration} s` : "Unknown"],
      [
        "Resolution",
        resolution.width && resolution.height
          ? `${resolution.width} × ${resolution.height}`
          : "Unknown"
      ],
      ["Scenes", Array.isArray(project.scenes) ? String(project.scenes.length) : "Unknown"],
      ["Shots", Array.isArray(project.shots) ? String(project.shots.length) : "Unknown"]
    ];

    for (const [label, value] of rows) {
      const wrapper = document.createElement("div");
      const term = createGalleryElement("dt", "", label);
      const description = createGalleryElement("dd", "", value);
      wrapper.append(term, description);
      details.append(wrapper);
    }

    panel.append(heading, description, details);
  } catch (error) {
    panel.replaceChildren(
      createGalleryElement(
        "p",
        "gallery-error",
        error instanceof Error ? error.message : "Unable to read template details."
      )
    );
  }
}

async function loadGalleryTemplate(template) {
  // Begin the guarded request immediately when the user clicks.
  const token = beginImportAttempt();

  el["gallery-message"].textContent = `Loading ${template.name}...`;

  try {
    const response = await fetch(template.fixture);

    if (!importRequests.isCurrent(token)) return;

    if (!response.ok) {
      throw new Error(`Unable to load template (HTTP ${response.status}).`);
    }

    const sourceText = await response.text();

    if (!importRequests.isCurrent(token)) return;

    const file = new File(
      [sourceText],
      `${template.id}.json`,
      { type: "application/json" }
    );

    const loaded = await importProjectFile(
      file,
      `Gallery template "${template.name}"`,
      token
    );

    if (!importRequests.isCurrent(token)) return;

    el["gallery-message"].textContent = loaded
      ? `${template.name} was loaded into Project workspace. Check its validation status before proceeding.`
      : `${template.name} could not be imported. Check the Project status for details.`;
  } catch (error) {
    if (!importRequests.isCurrent(token)) return;

    manager.clear();
    clearProjectView();

    el["project-status"].textContent = "Load failed";
    el["project-status"].dataset.state = "error";

    setValidationState(
      validationService
        ? "Ready"
        : validationInitializationError
          ? "Unavailable"
          : "Initializing",
      "Validation was not run because the Gallery template could not be loaded."
    );

    const errorMessage = error instanceof Error
      ? error.message
      : "Unable to load Gallery template.";

    message(errorMessage, "error");
    el["gallery-message"].textContent = errorMessage;
  }
}

function renderGallery() {
  const grid = el["gallery-grid"];
  grid.replaceChildren();

  for (const template of getGalleryTemplates()) {
    const card = createGalleryElement("article", "gallery-card");
    const category = createGalleryElement(
      "span",
      "gallery-category",
      template.category
    );
    const heading = createGalleryElement("h3", "", template.name);
    const description = createGalleryElement("p", "", template.description);
    const tags = createGalleryElement("div", "gallery-tags");

    for (const tag of template.tags) {
      tags.append(createGalleryElement("span", "gallery-tag", tag));
    }

    const actions = createGalleryElement("div", "gallery-card-actions");

    const detailsButton = createGalleryElement(
      "button",
      "button",
      "View details"
    );
    detailsButton.type = "button";
    detailsButton.addEventListener("click", () => {
      showGalleryDetails(template);
    });

    const useButton = createGalleryElement(
      "button",
      "button button-primary",
      "Use template"
    );
    useButton.type = "button";
    useButton.addEventListener("click", () => {
      loadGalleryTemplate(template);
    });

    actions.append(detailsButton, useButton);
    card.append(category, heading, description, tags, actions);
    grid.append(card);
  }
}

renderGallery();

el["save-project"].addEventListener("click", () => {
  try {
    const base = (manager.fileName ?? "clip-project").replace(/\.json$/i, "");
    download(`${base}.original.json`, manager.exportOriginal());
    message("Original JSON export started without re-serialization.", "success");
  } catch (error) {
    message(error instanceof Error ? error.message : "Unable to export project.", "error");
  }
});
