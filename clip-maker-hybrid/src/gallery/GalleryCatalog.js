const templates = [
  {
    id: "cartoon-story",
    name: "Cartoon Story",
    category: "featured",
    description: "A cinematic cartoon project featuring a character-driven story.",
    fixture: "./fixtures/valid/cartoon-story.json",
    tags: ["Cartoon", "Character", "Cinematic"]
  },
  {
    id: "minimal-project",
    name: "Minimal Project",
    category: "starter",
    description: "A minimal ClipProject v2 starting point for a new project.",
    fixture: "./fixtures/valid/minimal-project.json",
    tags: ["Minimal", "Starter"]
  },
  {
    id: "legacy-imported",
    name: "Legacy Sample",
    category: "legacy",
    description: "A validated ClipProject v2 sample that retains legacy import data.",
    fixture: "./fixtures/valid/legacy-imported.json",
    tags: ["Legacy", "Imported"]
  }
];

export function getGalleryTemplates() {
  return templates.map(template => ({
    ...template,
    tags: [...template.tags]
  }));
}

export function getGalleryTemplate(id) {
  const template = templates.find(item => item.id === id);

  if (!template) return null;

  return {
    ...template,
    tags: [...template.tags]
  };
}