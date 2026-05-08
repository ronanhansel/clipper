import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";

export type GraphParameterEditorField = {
  key: string;
  label: string;
  value: string;
  type?: "number" | "text";
  unit?: string;
  options?: readonly { value: string; label: string }[];
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
      <div className="text-[10px] font-bold text-[#7f8794]">
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
  if (field.options) return <GraphParameterSelectField field={field} onChange={onChange} inline />;
  if (field.type === "text") return <GraphParameterTextField field={field} onChange={onChange} inline />;
  const split = splitParameterUnit(field.value, field.unit);
  const displayValue = getNumberFieldDisplayValue(field, split.value);
  return (
    <label className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] font-bold text-[#7f8794]">
        {field.label}
      </span>
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-transparent bg-transparent px-1 transition hover:bg-[#141b27] focus-within:border-[#3d4b62] focus-within:bg-[#0b1018]">
        <span className="min-w-[12px] text-left text-[10px] font-bold text-[#7f8794]">
          {split.unit}
        </span>
        <Input
          className="h-6 min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] focus:border-0 focus:ring-0"
          value={displayValue}
          onChange={(event) => commitNumberField(field, event.target.value, split.unit, onChange)}
        />
      </div>
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
  if (field.options) return <GraphParameterSelectField field={field} onChange={onChange} />;
  if (field.type === "text") return <GraphParameterTextField field={field} onChange={onChange} />;
  const split = splitParameterUnit(field.value, field.unit);
  const displayValue = getNumberFieldDisplayValue(field, split.value);
  return (
    <label className="grid gap-1">
      <span className="text-[9px] font-bold text-[#697280]">
        {field.label}
      </span>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-transparent bg-[#0c121b] px-1.5 transition hover:bg-[#141b27] focus-within:border-[#3d4b62] focus-within:bg-[#0b1018]">
        <span className="min-w-[10px] text-left text-[10px] font-bold text-[#7f8794]">
          {split.unit}
        </span>
        <Input
          className="h-6 min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] focus:border-0 focus:ring-0"
          value={displayValue}
          onChange={(event) => commitNumberField(field, event.target.value, split.unit, onChange)}
        />
      </div>
    </label>
  );
}

function GraphParameterTextField({
  field,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  onChange: (key: string, value: string) => void;
  inline?: boolean;
}) {
  const control = (
    <Input
      className="h-6 min-w-0 rounded border-transparent bg-[#0c121b] px-1.5 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] hover:bg-[#141b27] focus:border-[#3d4b62] focus:ring-0"
      value={field.value}
      onChange={(event) => onChange(field.key, event.target.value)}
    />
  );
  if (inline) {
    return (
      <label className="grid grid-cols-[78px_1fr] items-center gap-2">
        <span className="text-[10px] font-bold text-[#7f8794]">{field.label}</span>
        {control}
      </label>
    );
  }
  return (
    <label className="grid gap-1">
      <span className="text-[9px] font-bold text-[#697280]">{field.label}</span>
      {control}
    </label>
  );
}

function getNumberFieldDisplayValue(field: GraphParameterEditorField, value: string) {
  return isAllowedNumberInput(value, field.key === "repeat") ? value : "";
}

function GraphParameterSelectField({
  field,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  onChange: (key: string, value: string) => void;
  inline?: boolean;
}) {
  const control = (
    <Select value={field.value} onValueChange={(value) => onChange(field.key, value)}>
      <SelectTrigger className="h-6 flex-row-reverse justify-start rounded border-transparent bg-[#0c121b] px-1.5 text-[12px] font-semibold text-[#e4e9f2] hover:bg-[#141b27] focus:border-[#3d4b62] focus:ring-0 [&>span]:ml-auto [&>span]:text-right">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[6000]">
        <SelectGroup>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  if (inline) {
    return (
      <label className="grid grid-cols-[78px_1fr] items-center gap-2">
        <span className="text-[10px] font-bold text-[#7f8794]">{field.label}</span>
        {control}
      </label>
    );
  }
  return (
    <label className="grid gap-1">
      <span className="text-[9px] font-bold text-[#697280]">{field.label}</span>
      {control}
    </label>
  );
}

function commitNumberField(
  field: GraphParameterEditorField,
  value: string,
  unit: string,
  onChange: (key: string, value: string) => void,
) {
  if (!isAllowedNumberInput(value, field.key === "repeat")) return;
  onChange(field.key, `${value}${unit}`);
}

function isAllowedNumberInput(value: string, allowInfinity: boolean) {
  if (value === "") return true;
  if (allowInfinity && "Infinity".toLowerCase().startsWith(value.toLowerCase())) return true;
  return /^-?\d*(?:\.\d*)?$/.test(value) && value !== "-" && value !== "." && value !== "-.";
}

function splitParameterUnit(value: string, fallbackUnit = "") {
  const match = value.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
  if (match) return { value: match[1], unit: match[2] };
  if (fallbackUnit) {
    const unitOnlyMatch = value.match(/^([a-z%]+)$/i);
    if (unitOnlyMatch && unitOnlyMatch[1] === fallbackUnit) return { value: "", unit: unitOnlyMatch[1] };
  }
  return { value: fallbackUnit && value.endsWith(fallbackUnit) ? value.slice(0, -fallbackUnit.length) : value, unit: fallbackUnit };
}
