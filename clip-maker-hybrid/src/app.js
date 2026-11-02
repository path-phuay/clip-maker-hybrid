import { ProjectManager } from "./core/ProjectManager.js";
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
  "validation-issues", "validation-context"
].map(id => [id, document.getElementById(id)]));

let validationService = null;
let validationInitializationError = null;
let currentIssues = [];

function message(value, kind = "info") {
  el.message.textContent = value;
  el.message.dataset.kind = kind;
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
  });

el["project-file"].addEventListener("change", async () => {
  const [file] = el["project-file"].files ?? [];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    el["project-status"].textContent = "Import rejected";
    el["project-status"].dataset.state = "error";
    message("File exceeds the 10 MiB import limit. No project data was loaded.", "error");
    el["project-file"].value = "";
    return;
  }
  try {
    const project = await manager.loadFile(file);
    summary(project);
    inspection(manager.importRecord);
    el["project-status"].textContent = "JSON imported";
    el["project-status"].dataset.state = "success";
    el["save-project"].disabled = false;
    if (validationService) {
      renderValidation(validationService.validateProject(project));
      message(`Imported ${file.name}. Original JSON text is preserved. Validation does not convert or render the project.`, "success");
    } else {
      setValidationState("Unavailable", validationInitializationError instanceof Error
        ? validationInitializationError.message
        : "The validator is not ready. Original JSON export remains available.");
      message(`Imported ${file.name}, but validation is unavailable. The original JSON can still be exported.`, "error");
    }
  } catch (error) {
    el["project-status"].textContent = "Load failed";
    el["project-status"].dataset.state = "error";
    el["save-project"].disabled = true;
    message(error instanceof Error ? error.message : "Unable to load project.", "error");
  } finally {
    el["project-file"].value = "";
  }
});

el["save-project"].addEventListener("click", () => {
  try {
    const base = (manager.fileName ?? "clip-project").replace(/\.json$/i, "");
    download(`${base}.original.json`, manager.exportOriginal());
    message("Original JSON export started without re-serialization.", "success");
  } catch (error) {
    message(error instanceof Error ? error.message : "Unable to export project.", "error");
  }
});
