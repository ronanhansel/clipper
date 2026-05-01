## Pan Terminology

- Replaced user-facing shared-id motion terminology from "transition" to "pan" in the sample project source, persisted sample project JSON, and agent workflow docs.
- Replaced remaining user-facing composition camera movement wording from "translation"/"translate" to "pan" in tools, timeline labels, marker labels, tooltips, inspector helper text, and add-marker errors.
- Agent context now exposes composition camera movement as `panMarkers` so agent-facing data matches the product terminology.
- Left Tailwind/CSS `transition` utility classes unchanged because they are implementation keywords rather than product terminology.
