import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { mutedCaps } from "../../../app/config";
import {
  getCodeObjectComponentTick,
  getCodeObjectError,
  loadCodeDefaultSettings,
  loadCodePropsSchema,
  subscribeCodeObjectComponents,
  subscribeCodeObjectErrors,
} from "../../../render-engine/codeObjectRuntime";
import type {
  CodePropField,
  CodePropsSchema,
} from "../../../render-engine/codePropsSchema";
import type {
  FrameObject,
  JsonValue,
  ProjectBinItem,
} from "../../../core/types";
import { resolveBinItemByPath } from "../../../core/binPathResolver";
import { useObjectInspector } from "../objectInspectorContext";
import { Textarea } from "../../ui/textarea";
import { Input } from "../../ui/input";
import { Checkbox } from "../../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

const sourceKey = "source";
const codeExtensions = [".tsx", ".ts", ".jsx", ".js"];
const binPathDataType = "application/x-clipper-bin-path";

const pendingDefaultsApply = new Set<string>();

export function CodeSection() {
  const { object, projectBin, onChange } = useObjectInspector();

  function setProps(
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) {
    onChange((current) => ({
      ...current,
      props: updater(current.props ?? {}),
    }));
  }

  useApplyDefaultSettingsOnFirstAttach(object, onChange);

  return (
    <div className="grid gap-3">
      <SourceSubsection
        object={object}
        projectBin={projectBin}
        setProps={setProps}
      />
      <PropsSubsection object={object} setProps={setProps} />
      <ErrorsSubsection objectId={object.id} />
    </div>
  );
}

function SourceSubsection({
  object,
  projectBin,
  setProps,
}: {
  object: FrameObject;
  projectBin: ProjectBinItem[];
  setProps: (
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) => void;
}) {
  const sourcePath =
    typeof object.props?.[sourceKey] === "string"
      ? (object.props[sourceKey] as string)
      : null;

  const [draft, setDraft] = useState<string>(sourcePath ?? "");
  const [savedReference, setSavedReference] = useState<string>(
    sourcePath ?? "",
  );
  const [isDragOver, setIsDragOver] = useState(false);

  if (savedReference !== (sourcePath ?? "")) {
    setSavedReference(sourcePath ?? "");
    setDraft(sourcePath ?? "");
  }

  const validation = useMemo(
    () => validateSourcePath(projectBin, sourcePath),
    [projectBin, sourcePath],
  );

  function commitDraft(value: string) {
    const trimmed = value.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    const previous = sourcePath;
    if (next && next !== previous) {
      pendingDefaultsApply.add(object.id);
    }
    setProps((current) => ({
      ...current,
      [sourceKey]: next,
    }));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(binPathDataType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const dropped = event.dataTransfer.getData(binPathDataType);
    if (!dropped) return;
    event.preventDefault();
    setIsDragOver(false);
    setDraft(dropped);
    commitDraft(dropped);
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Source</span>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-[10px] ${isDragOver ? "outline outline-2 outline-[var(--clipper-accent-strong)]" : ""}`}
      >
        <Input
          className="h-[38px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea]"
          placeholder="paper/main.tsx"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commitDraft(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft(draft);
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
      {validation ? (
        <span className="text-[11px] font-semibold text-[#ff8585]">
          {validation}
        </span>
      ) : null}
    </div>
  );
}

function PropsSubsection({
  object,
  setProps,
}: {
  object: FrameObject;
  setProps: (
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) => void;
}) {
  const sourcePath =
    typeof object.props?.[sourceKey] === "string"
      ? (object.props[sourceKey] as string)
      : null;

  const componentTick = useSyncExternalStore(
    subscribeCodeObjectComponents,
    getCodeObjectComponentTick,
    getCodeObjectComponentTick,
  );

  const schema = useMemo(
    () => loadCodePropsSchema(sourcePath),
    [sourcePath, componentTick],
  );

  if (schema)
    return (
      <SchemaPropsEditor object={object} schema={schema} setProps={setProps} />
    );
  return <JsonPropsEditor object={object} setProps={setProps} />;
}

function SchemaPropsEditor({
  object,
  schema,
  setProps,
}: {
  object: FrameObject;
  schema: CodePropsSchema;
  setProps: (
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) => void;
}) {
  const props = object.props ?? {};

  function commit(key: string, value: JsonValue | undefined) {
    setProps((current) => {
      const next: Record<string, JsonValue> = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  return (
    <div className="grid gap-3">
      <span className={mutedCaps}>Props</span>
      {Object.entries(schema).map(([key, field]) => {
        const raw = props[key];
        return (
          <SchemaField
            key={key}
            propKey={key}
            field={field}
            value={raw}
            onCommit={(value) => commit(key, value)}
          />
        );
      })}
    </div>
  );
}

function SchemaField({
  propKey,
  field,
  value,
  onCommit,
}: {
  propKey: string;
  field: CodePropField;
  value: JsonValue | undefined;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const labelText = field.label ?? propKey;

  if (field.type === "string") {
    const display = typeof value === "string" ? value : (field.default ?? "");
    return (
      <StringField
        label={labelText}
        field={field}
        value={display}
        onCommit={onCommit}
      />
    );
  }

  if (field.type === "color") {
    const display = typeof value === "string" ? value : (field.default ?? "");
    return (
      <ColorField
        label={labelText}
        field={field}
        value={display}
        onCommit={onCommit}
      />
    );
  }

  if (field.type === "number") {
    const display = typeof value === "number" ? value : (field.default ?? null);
    return (
      <NumberField
        label={labelText}
        field={field}
        value={display}
        onCommit={onCommit}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <BooleanField
        label={labelText}
        field={field}
        value={typeof value === "boolean" ? value : null}
        onCommit={onCommit}
      />
    );
  }

  if (field.type === "select") {
    return (
      <SelectField
        label={labelText}
        field={field}
        value={typeof value === "string" ? value : null}
        onCommit={onCommit}
      />
    );
  }

  return null;
}

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-semibold text-[#9da3b2]">{label}</span>
      {children}
      {error ? (
        <span className="text-[11px] font-semibold text-[#ff8585]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function StringField({
  label,
  field,
  value,
  onCommit,
}: {
  label: string;
  field: Extract<CodePropField, { type: "string" }>;
  value: string;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [savedReference, setSavedReference] = useState(value);

  if (savedReference !== value) {
    setSavedReference(value);
    setDraft(value);
  }

  function commit() {
    if (draft === value) return;
    if (draft === "" && field.default !== undefined) {
      onCommit(undefined);
      return;
    }
    onCommit(draft);
  }

  if (field.multiline) {
    return (
      <FieldShell label={label}>
        <Textarea
          className="min-h-[80px] text-xs leading-[1.45]"
          spellCheck={false}
          value={draft}
          placeholder={field.placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      </FieldShell>
    );
  }

  return (
    <FieldShell label={label}>
      <Input
        className="h-8 rounded-[8px] px-2 text-xs"
        spellCheck={false}
        value={draft}
        placeholder={field.placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </FieldShell>
  );
}

function ColorField({
  label,
  field,
  value,
  onCommit,
}: {
  label: string;
  field: Extract<CodePropField, { type: "color" }>;
  value: string;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [savedReference, setSavedReference] = useState(value);

  if (savedReference !== value) {
    setSavedReference(value);
    setDraft(value);
  }

  function commit(next: string) {
    if (next === value) return;
    if (next === "" && field.default !== undefined) {
      onCommit(undefined);
      return;
    }
    onCommit(next);
  }

  const swatch = isCssColor(draft) ? draft : "#171920";

  return (
    <FieldShell label={label}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-7 w-7 shrink-0 rounded-[6px] border border-[#2d313b]"
          style={{ background: swatch }}
        />
        <Input
          className="h-8 rounded-[8px] px-2 text-xs"
          spellCheck={false}
          placeholder="#88ddff"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(draft);
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    </FieldShell>
  );
}

function NumberField({
  label,
  field,
  value,
  onCommit,
}: {
  label: string;
  field: Extract<CodePropField, { type: "number" }>;
  value: number | null;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const display = value === null ? "" : String(value);
  const [draft, setDraft] = useState(display);
  const [savedReference, setSavedReference] = useState(display);
  const [error, setError] = useState<string | null>(null);

  if (savedReference !== display) {
    setSavedReference(display);
    setDraft(display);
    setError(null);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) onCommit(undefined);
      setError(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setError("Not a number");
      return;
    }
    if (field.min !== undefined && parsed < field.min) {
      setError(`Must be ≥ ${field.min}`);
      return;
    }
    if (field.max !== undefined && parsed > field.max) {
      setError(`Must be ≤ ${field.max}`);
      return;
    }
    setError(null);
    if (parsed === value) return;
    onCommit(parsed);
  }

  return (
    <FieldShell label={label} error={error}>
      <Input
        className="h-8 rounded-[8px] px-2 text-xs"
        spellCheck={false}
        type="number"
        step={field.step}
        min={field.min}
        max={field.max}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </FieldShell>
  );
}

function BooleanField({
  label,
  field,
  value,
  onCommit,
}: {
  label: string;
  field: Extract<CodePropField, { type: "boolean" }>;
  value: boolean | null;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const checked = value ?? field.default ?? false;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] font-semibold text-[#9da3b2]">{label}</span>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onCommit(next === true)}
      />
    </div>
  );
}

function SelectField({
  label,
  field,
  value,
  onCommit,
}: {
  label: string;
  field: Extract<CodePropField, { type: "select" }>;
  value: string | null;
  onCommit: (value: JsonValue | undefined) => void;
}) {
  const current = value ?? field.default ?? field.options[0].value;
  return (
    <FieldShell label={label}>
      <Select value={current} onValueChange={(next) => onCommit(next)}>
        <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label ?? option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

function JsonPropsEditor({
  object,
  setProps,
}: {
  object: FrameObject;
  setProps: (
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) => void;
}) {
  const objectPropsJson = useMemo(
    () => stringifyComponentProps(object.props),
    [object.props],
  );
  const [draft, setDraft] = useState<string>(objectPropsJson);
  const [savedReference, setSavedReference] = useState<string>(objectPropsJson);
  const [parseError, setParseError] = useState<string | null>(null);

  if (savedReference !== objectPropsJson) {
    setSavedReference(objectPropsJson);
    setDraft(objectPropsJson);
    setParseError(null);
  }

  function commit() {
    if (draft.trim() === "") {
      setProps((current) => preserveSource(current, {}));
      setParseError(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Invalid JSON");
      return;
    }
    if (!isPlainObject(parsed)) {
      setParseError("Props must be a JSON object");
      return;
    }
    setParseError(null);
    setProps((current) =>
      preserveSource(current, parsed as Record<string, JsonValue>),
    );
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Props</span>
      <Textarea
        className="min-h-[120px] font-mono text-[11px] leading-[1.45]"
        spellCheck={false}
        value={draft}
        aria-invalid={parseError ? true : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (parseError) setParseError(null);
        }}
        onBlur={commit}
      />
      {parseError ? (
        <span className="text-[11px] font-semibold text-[#ff8585]">
          {parseError}
        </span>
      ) : null}
    </div>
  );
}

function isCssColor(value: string): boolean {
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function")
    return CSS.supports("color", value);
  return /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

function ErrorsSubsection({ objectId }: { objectId: string }) {
  const error = useSyncExternalStore(
    subscribeCodeObjectErrors,
    () => getCodeObjectError(objectId),
    () => null,
  );
  const [stackOpen, setStackOpen] = useState(false);

  if (!error) {
    return (
      <div className="grid gap-2">
        <span className={mutedCaps}>Errors</span>
        <span className="text-[11px] font-semibold text-[#737884]">
          No errors
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Errors</span>
      <div className="grid gap-1.5 rounded-[10px] border border-[#5a1f24] bg-[#23131544] p-3">
        <span className="text-[12px] font-semibold leading-snug text-[#ffb4b4]">
          {error.message}
        </span>
        {error.stack ? (
          <button
            type="button"
            className="justify-self-start text-[11px] font-semibold text-[#ff9a9a] underline-offset-2 hover:underline"
            onClick={() => setStackOpen((value) => !value)}
          >
            {stackOpen ? "Hide stack" : "Show stack"}
          </button>
        ) : null}
        {stackOpen && error.stack ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[6px] bg-[#1a1014] p-2 text-[10px] leading-tight text-[#ffd3d3]">
            {error.stack}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function validateSourcePath(
  bin: ProjectBinItem[],
  sourcePath: string | null,
): string | null {
  if (!sourcePath) return null;
  const item = resolveBinItemByPath(bin, sourcePath);
  if (!item) return `No bin item at "${sourcePath}".`;
  if (item.kind !== "internal-file" && item.kind !== "external-proxy")
    return `"${sourcePath}" is not a code file.`;
  if (!codeExtensions.some((ext) => item.name.endsWith(ext)))
    return `"${item.name}" is not a TypeScript or JavaScript file.`;
  return null;
}

function stringifyComponentProps(props: FrameObject["props"]): string {
  if (!props) return "{}";
  const filtered: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === sourceKey) continue;
    filtered[key] = value as JsonValue;
  }
  return Object.keys(filtered).length === 0
    ? "{}"
    : JSON.stringify(filtered, null, 2);
}

function preserveSource(
  current: Record<string, JsonValue>,
  next: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const merged: Record<string, JsonValue> = { ...next };
  if (sourceKey in current) merged[sourceKey] = current[sourceKey];
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function useApplyDefaultSettingsOnFirstAttach(
  object: FrameObject,
  onChange: (updater: (object: FrameObject) => FrameObject) => void,
) {
  const sourcePath =
    typeof object.props?.[sourceKey] === "string"
      ? (object.props[sourceKey] as string)
      : null;

  const componentTick = useSyncExternalStore(
    subscribeCodeObjectComponents,
    getCodeObjectComponentTick,
    getCodeObjectComponentTick,
  );

  useEffect(() => {
    if (!sourcePath) return;
    if (!pendingDefaultsApply.has(object.id)) return;
    const defaults = loadCodeDefaultSettings(sourcePath);
    if (!defaults) return;
    pendingDefaultsApply.delete(object.id);
    onChange((current) => ({
      ...current,
      bounds: {
        ...current.bounds,
        width: defaults.width,
        height: defaults.height,
      },
    }));
  }, [object.id, sourcePath, componentTick, onChange]);
}
