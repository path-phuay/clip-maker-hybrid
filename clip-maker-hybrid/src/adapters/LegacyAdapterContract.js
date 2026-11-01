/** DS-12A read-only compatibility inventory; not a renderer converter. */
export function inspectLegacyCompatibility(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new TypeError("A ClipProject object is required.");
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const shots = Array.isArray(project.shots) ? project.shots : [];
  const timeline = project.timeline && typeof project.timeline === "object" ? project.timeline : {};
  const features = [
    { id: "scene_layers", count: scenes.reduce((n, x) => n + (Array.isArray(x?.layers) ? x.layers.length : 0), 0) },
    { id: "shot_actors", count: shots.reduce((n, x) => n + (Array.isArray(x?.actors) ? x.actors.length : 0), 0) },
    { id: "shot_graphics", count: shots.reduce((n, x) => n + (Array.isArray(x?.graphics) ? x.graphics.length : 0), 0) },
    { id: "shot_effects", count: shots.reduce((n, x) => n + (Array.isArray(x?.effects) ? x.effects.length : 0), 0) },
    { id: "audio_tracks", count: ["audioTracks", "musicTracks"].reduce((n, k) => n + (Array.isArray(timeline[k]) ? timeline[k].length : 0), 0) },
    { id: "subtitle_tracks", count: Array.isArray(timeline.subtitleTracks) ? timeline.subtitleTracks.length : 0 }
  ].map(x => ({ ...x, status: "requires_verified_mapping" }));
  return {
    adapterStage: "DS-12A", conversionAvailable: false, rendererInvocationAllowed: false,
    sourcePreservation: "caller_retains_original_project",
    project: { schemaVersion: typeof project.schemaVersion === "string" ? project.schemaVersion : null, sceneCount: scenes.length, shotCount: shots.length, hasLegacyData: Object.prototype.hasOwnProperty.call(project, "legacyData") },
    features,
    warnings: ["No v2-to-legacy conversion was performed.", "Legacy input fields, defaults, units, and timing semantics require source verification."]
  };
}
