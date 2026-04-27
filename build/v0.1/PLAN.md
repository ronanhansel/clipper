# Clipper v0.1 Plan

## Vision

Clipper v0.1 establishes an agentic video editor framework for creating fixed-resolution video from TypeScript, web layouts, Motion animations, and browser-rendered scenes. The editor should feel like a minimal open-source sibling to Premiere Pro or DaVinci Resolve, but with a web-native object model that agents can inspect, edit, animate, and eventually render into video.

## Product Focus

- Fixed `1920x1080` frame authoring for every project.
- Project > Scene > Part hierarchy with a strictly linear timeline.
- Parts are TypeScript-authored units with a maximum duration of 10 seconds.
- Scenes may contain many queued parts and are capped at 30 minutes.
- Every visible element inside the frame must be declared as an object with an id and rectangular bounding box metadata.
- Editor has two modes: Code for editing the part source and Interactive for visual object editing.
- Screenshot selector returns selection coordinates, selected objects, DOM selectors, ids, and bounding boxes for agent use.
- Zoom tool creates smooth zoom markers on a dedicated timeline row.
- Hero animation support transitions between adjacent parts when objects share ids.
- Initial encoding and timeline ideas should be informed by Recordly.
- Agentic chat, file context, and Codex communication should be informed by T3 Code.
- Interactive editing behavior should be informed by Penpot while staying intentionally smaller for v0.1.

## Architecture Goals

- Desktop-first Electron + Vite + TypeScript application.
- Keep renderer code modular and readable so agents can safely edit scenes and parts.
- Store projects under `projects/[project_id]/` with scene, part, manifest, and assets folders.
- Use manifests to map nanoid-backed ids to human-readable order and timeline placement.
- Keep the frame fixed and clipped, not responsive.
- Represent each frame object as structured data before rendering DOM/SVG/HTML.
- Use Motion as the first animation backend while keeping the object model backend-agnostic.

## Implementation Phases

1. Scaffold the Electron/Vite TypeScript app with a minimal editor shell.
2. Add project model types, manifest rules, fixture project data, and validation helpers for linear timelines and duration caps.
3. Build the editor layout: left project browser, fixed frame viewport, code/interactive mode switch, object inspector, and two-row timeline.
4. Add object selection, bounding-box overlay, screenshot selector metadata, object property editing, and part snapshot display.
5. Add zoom marker interactions and a zoom timeline row with smooth preview behavior.
6. Add agent workflow scaffolding: context payload generation, selection metadata export, and documentation for Codex-focused operations.
7. Add reference-repository notes from Recordly, T3 Code, and Penpot under `.temp/referenced/` for future extraction and adaptation.
8. Add tests or verification scripts for project model rules, editor build, and core UI behavior.

## Current Status

- v0.1 vision captured.
- Initial app implementation in progress.

## Testing Scenarios

- Create or load a sample project with one scene and several linear parts.
- Verify no part exceeds 10 seconds and scene duration remains under 30 minutes.
- Verify blank spacer parts appear on the timeline and frame as black parts.
- Select an object in the frame and confirm inspector values match id, bounding box, selector, and styles.
- Draw a screenshot selection rectangle and confirm selected objects and coordinates are exported.
- Add a zoom marker and confirm the zoom row, frame preview transform, and marker metadata update.
- Toggle Code and Interactive modes without losing selected part/object context.
- Build the app successfully with TypeScript checks.
