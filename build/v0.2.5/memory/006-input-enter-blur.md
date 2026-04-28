## Input Enter Blur

Updated for v0.2.5 so shared `Input` fields accept Enter as completion and immediately defocus, matching inspector number-field workflows where users type a value and press Enter to finish editing.

Architecture note: the behavior lives in `src/components/ui/input.tsx` because inspector numeric/text controls, project rename, asset rename, and settings controls already reuse this primitive. The handler preserves caller `onKeyDown` behavior first, then blurs only when Enter was not prevented, so specialized commit/cancel handlers still run before focus leaves the field.

Reuse: future single-line text or number fields should keep using `Input` to inherit consistent Enter-to-accept behavior. Multi-line editing should continue using `Textarea` or content-editable paths where Enter has text-entry meaning.
