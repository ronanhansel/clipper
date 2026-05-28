import {
  Component as ReactComponent,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  loadCodeComponent,
  loadCodePropsSchema,
  setCodeObjectError,
  clearCodeObjectError,
  retainCodeSource,
  releaseCodeSource,
  subscribeCodeObjectComponents,
  getCodeObjectComponentTick,
  type CodeComponent,
} from "../../render-engine/codeObjectRuntime";
import { applySchemaDefaults } from "../../render-engine/codePropsSchema";
import { useRawSceneTime } from "../../app/features/playback/playbackTimeStore";
import { usePlayheadSceneTime } from "../../app/features/playback/usePlayheadTime";
import type { FrameObject } from "../../core/types";

type CodeObjectFrameProps = {
  object: FrameObject;
  liveTimeEnabled?: boolean;
  time?: number;
  liveTimeOffset?: number;
};

export function CodeObjectFrame({
  object,
  liveTimeEnabled = true,
  time,
  liveTimeOffset = 0,
}: CodeObjectFrameProps) {
  const sourcePath =
    typeof object.props?.source === "string" ? object.props.source : null;
  const rawProps = useMemo(
    () => sanitizeCodeComponentProps(object.props),
    [object.props],
  );
  useEffect(() => {
    if (!sourcePath) return;
    retainCodeSource(sourcePath);
    return () => {
      releaseCodeSource(sourcePath);
    };
  }, [sourcePath]);
  const componentTick = useSyncExternalStore(
    subscribeCodeObjectComponents,
    getCodeObjectComponentTick,
    getCodeObjectComponentTick,
  );
  const component = useMemo(
    () => loadCodeComponent(sourcePath),
    [sourcePath, componentTick],
  );
  const schema = useMemo(
    () => loadCodePropsSchema(sourcePath),
    [sourcePath, componentTick],
  );
  const propsForComponent = useMemo(
    () => applySchemaDefaults(rawProps, schema),
    [rawProps, schema],
  );
  const externalTime = useRawSceneTime(
    shouldUseExternalClockForCodeObject(liveTimeEnabled, time),
    time ?? 0,
    liveTimeOffset,
  );
  const playheadTime = usePlayheadSceneTime(
    shouldUsePlayheadClockForCodeObject(liveTimeEnabled, time),
  );
  const componentTime = time === undefined ? playheadTime : externalTime;
  const size = {
    width: object.bounds.width,
    height: object.bounds.height,
  };

  return (
    <div
      className="absolute inset-0"
      style={{
        contain: "strict",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      <CodeObjectErrorBoundary
        objectId={object.id}
        resetKey={componentTick}
        size={size}
      >
        {component ? (
          <CodeComponentHost
            component={component}
            time={componentTime}
            props={propsForComponent}
            size={size}
          />
        ) : (
          <CodeObjectMissingPlaceholder size={size} />
        )}
      </CodeObjectErrorBoundary>
    </div>
  );
}

export function shouldUseExternalClockForCodeObject(
  liveTimeEnabled: boolean,
  time: number | undefined,
) {
  return liveTimeEnabled && time !== undefined;
}

export function shouldUsePlayheadClockForCodeObject(
  liveTimeEnabled: boolean,
  time: number | undefined,
) {
  return liveTimeEnabled && time === undefined;
}

function CodeComponentHost({
  component,
  time,
  props,
  size,
}: {
  component: CodeComponent;
  time: number;
  props: Record<string, unknown>;
  size: { width: number; height: number };
}) {
  const node = component({ time, props, size });
  return <>{node}</>;
}

function CodeObjectMissingPlaceholder({
  size,
}: {
  size: { width: number; height: number };
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(20, 22, 29, 0.7)",
        color: "#7c7e88",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: placeholderFontSize(size),
      }}
    >
      code: missing
    </div>
  );
}

function placeholderFontSize(size: { width: number; height: number }): number {
  return Math.max(16, Math.min(48, Math.min(size.width, size.height) / 12));
}

function sanitizeCodeComponentProps(
  props: FrameObject["props"],
): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "source") continue;
    result[key] = value;
  }
  return result;
}

class CodeObjectErrorBoundary extends ReactComponent<
  {
    objectId: string;
    resetKey: number;
    size: { width: number; height: number };
    children: ReactNode;
  },
  { error: { message: string; stack?: string } | null }
> {
  state: { error: { message: string; stack?: string } | null } = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    setCodeObjectError(this.props.objectId, { message, stack });
  }

  componentDidUpdate(
    previousProps: {
      objectId: string;
      resetKey: number;
      size: { width: number; height: number };
      children: ReactNode;
    },
    previousState: { error: { message: string; stack?: string } | null },
  ) {
    const objectChanged = previousProps.objectId !== this.props.objectId;
    const componentChanged = previousProps.resetKey !== this.props.resetKey;
    if ((objectChanged || componentChanged) && this.state.error)
      this.setState({ error: null });
    if (previousState.error && !this.state.error)
      clearCodeObjectError(this.props.objectId);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(70, 16, 24, 0.85)",
            color: "#ffb4b4",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: placeholderFontSize(this.props.size),
            padding: 16,
            textAlign: "center",
          }}
        >
          ⚠ Code error
        </div>
      );
    }
    return this.props.children;
  }
}
