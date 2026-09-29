# Curated project data schema (`data/projects/<slug>.json`)

Hand-curated editorial content for each Uno Space app. Computed facts
(csproj graph, LOC, workflows, toolchain) live in `data/generated/` and are
produced by `npm run sync`.

```jsonc
{
  "slug": "vectorspace",                 // lowercase repo name
  "name": "VectorSpace",
  "repo": "wieslawsoltes/VectorSpace",
  "tagline": "≤ 70 chars, punchy, no trailing period",
  "summary": "2–3 sentence paragraph describing what the app is and what makes it notable.",
  "category": "Design | Documents | Media | Engineering | Developer | Data",
  "inspiredBy": "familiar product category it resembles, e.g. 'Figma-style design tools' (only if README mentions one; else '')",
  "version": "source version label from README/Directory.Build.props or ''",
  "heroStats": [ { "value": "10", "label": "reusable libraries" } ],   // 3–4 striking, TRUE numbers from README/docs
  "highlights": [                                                     // 6–8 cards
    { "title": "Infinite canvas", "text": "1–2 sentences.", "icon": "one of the icon keys below" }
  ],
  "featureGroups": [                                                  // 4–8 groups, from README tables/docs
    { "area": "Vector tools", "items": ["short bullet", "..."] }      // 3–7 items each, ≤ 110 chars each
  ],
  "packages": [                                                       // EVERY library project under src/ except *.App
    { "name": "VectorSpace.Core", "role": "one-line responsibility", "ui": "None | SkiaSharp | Uno | Uno + Skia | ...", "layer": "model | engine | io | rendering | controls | editor | workbench | service" }
  ],
  "codeSamples": [ { "title": "Embed the workbench", "lang": "csharp", "code": "..." } ],  // copy from README when present (0–3); else []
  "shortcuts": [ { "action": "Undo / redo", "keys": "Ctrl Z / Ctrl Shift Z" } ],            // from README/docs; up to 12; else []
  "formats": [ { "name": ".vectorspace", "support": "read/write | import | export | read" } ],  // file formats; else []
  "playground": {
    "intro": "1 sentence on what to try in the live browser build.",
    "tour": [ { "title": "Draw a path", "text": "Concrete steps a visitor can do in the live app (only real UI features named in README/docs)." } ]  // 4–6 steps
  },
  "architecture": [                                                  // 3–5 layers bottom → top
    { "name": "Engine", "text": "1 sentence", "packages": ["VectorSpace.Core", "VectorSpace.Layout"] }
  ],
  "boundaries": ["honest limitation from README/docs, ≤ 120 chars"],  // 3–5
  "docs": [ { "title": "Collaboration", "path": "docs/COLLABORATION.md", "blurb": "≤ 80 chars" } ]  // every file in docs/ worth linking (.md), max 12
}
```

Icon keys: canvas, pen, layers, grid, text, table, formula, pdf, image, camera, light, brush,
video, audio, film, effects, sparkles, flask, chart, code, terminal, slides, database, query,
note, book, cad, ruler, git, branch, control, chip, plug, cloud, users, lock, bolt, gauge,
puzzle, package, shield, download, upload, search, layout, palette, wand, cube, timeline,
keyboard, globe, recovery, check, eye, share, magic, filter, mask, history, zoom, ocr, form.
