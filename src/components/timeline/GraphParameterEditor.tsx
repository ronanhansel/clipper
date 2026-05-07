export type GraphParameterEditorField = {
  key: string;
  label: string;
  value: string;
};

export type GraphParameterEditorGroup = {
  id: string;
  label?: string;
  columns?: number;
  fields: GraphParameterEditorField[];
};

export type GraphParameterEditorSchema = {
  width: number;
  height: number;
  groups: GraphParameterEditorGroup[];
};

export function GraphParameterEditor({
  schema,
  onChange,
}: {
  schema: GraphParameterEditorSchema;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {schema.groups.map((group) =>
        group.label ? (
          <GraphParameterGroup key={group.id} group={group} onChange={onChange} />
        ) : (
          <div key={group.id} className="grid gap-1">
            {group.fields.map((field) => (
              <GraphParameterInlineField
                key={field.key}
                field={field}
                onChange={onChange}
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function GraphParameterGroup({
  group,
  onChange,
}: {
  group: GraphParameterEditorGroup;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7f8794]">
        {group.label}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${group.columns ?? 1}, minmax(0, 1fr))` }}
      >
        {group.fields.map((field) => (
          <GraphParameterBoxField
            key={field.key}
            field={field}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function GraphParameterInlineField({
  field,
  onChange,
}: {
  field: GraphParameterEditorField;
  onChange: (key: string, value: string) => void;
}) {
  const split = splitParameterUnit(field.value);
  return (
    <label className="grid grid-cols-[78px_1fr_auto] items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7f8794]">
        {field.label}
      </span>
      <input
        className="h-6 min-w-0 rounded border border-transparent bg-transparent px-1 text-right text-[12px] font-semibold text-[#e4e9f2] outline-none transition hover:bg-[#141b27] focus:border-[#3d4b62] focus:bg-[#0b1018]"
        value={split.value}
        onChange={(event) => onChange(field.key, `${event.target.value}${split.unit}`)}
      />
      <span className="min-w-[12px] text-[10px] font-bold text-[#7f8794]">
        {split.unit}
      </span>
    </label>
  );
}

function GraphParameterBoxField({
  field,
  onChange,
}: {
  field: GraphParameterEditorField;
  onChange: (key: string, value: string) => void;
}) {
  const split = splitParameterUnit(field.value);
  return (
    <label className="grid gap-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#697280]">
        {field.label}
      </span>
      <div className="grid grid-cols-[1fr_auto] items-center gap-1 rounded border border-transparent bg-[#0c121b] px-1.5 transition hover:bg-[#141b27] focus-within:border-[#3d4b62] focus-within:bg-[#0b1018]">
        <input
          className="h-6 min-w-0 bg-transparent text-right text-[12px] font-semibold text-[#e4e9f2] outline-none"
          value={split.value}
          onChange={(event) => onChange(field.key, `${event.target.value}${split.unit}`)}
        />
        <span className="min-w-[10px] text-[10px] font-bold text-[#7f8794]">
          {split.unit}
        </span>
      </div>
    </label>
  );
}

function splitParameterUnit(value: string) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
  return match ? { value: match[1], unit: match[2] } : { value, unit: "" };
}
