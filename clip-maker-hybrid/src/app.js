import { ProjectManager } from "./core/ProjectManager.js";

const manager = new ProjectManager();

const elements = {
  file: document.querySelector("#project-file"),
  save: document.querySelector("#save-project"),
  status: document.querySelector("#project-status"),
  message: document.querySelector("#message"),
  title: document.querySelector("#summary-title"),
  schema: document.querySelector("#summary-schema"),
  duration: document.querySelector("#summary-duration"),
  resolution: document.querySelector("#summary-resolution"),
  scenes: document.querySelector("#summary-scenes"),
  shots: document.querySelector("#summary-shots"),
};

function setMessage(message, kind = "info") {
  elements.message.textContent = message;
  elements.message.dataset.kind = kind;
}

function showSummary(project) {
  const settings = project.project ?? {};
  const resolution = settings.resolution ?? {};

  elements.title.textContent = settings.title ?? "Untitled";
  elements.schema.textContent = project.schemaVersion ?? "Unknown";
  elements.duration.textContent =
    Number.isFinite(settings.duration) ? `${settings.duration} s` : "—";
  elements.resolution.textContent =
    resolution.width && resolution.height
      ? `${resolution.width} × ${resolution.height}`
      : "—";
  elements.scenes.textContent = Array.isArray(project.scenes)
    ? String(project.scenes.length)
    : "—";
  elements.shots.textContent = Array.isArray(project.shots)
    ? String(project.shots.length)
    : "—";
}

function downloadJson(fileName, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

elements.file.addEventListener("change", async () => {
  const [file] = elements.file.files ?? [];
  if (!file) return;

  try {
    const project = await manager.loadFile(file);
    showSummary(project);
    elements.status.textContent = "Project loaded";
    elements.status.dataset.state = "success";
    elements.save.disabled = false;
    setMessage(
      `Loaded ${file.name}. JSON parsing succeeded. Full ClipProject validation is not connected in DS-11.`,
      "success",
    );
  } catch (error) {
    elements.status.textContent = "Load failed";
    elements.status.dataset.state = "error";
    elements.save.disabled = true;
    setMessage(error instanceof Error ? error.message : "Unable to load project.", "error");
  } finally {
    elements.file.value = "";
  }
});

elements.save.addEventListener("click", () => {
  try {
    const baseName = (manager.fileName ?? "clip-project").replace(/\.json$/i, "");
    downloadJson(`${baseName}.export.json`, manager.exportJson());
    setMessage("Project JSON export started.", "success");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Unable to export project.", "error");
  }
});
