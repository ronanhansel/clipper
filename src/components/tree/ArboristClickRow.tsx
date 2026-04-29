import type { MouseEvent, ReactNode, Ref } from "react";
import type { NodeApi, RowRendererProps } from "react-arborist";

export function ArboristClickRow<T>({ attrs, children, innerRef, node, onClick }: RowRendererProps<T> & { onClick?: (event: MouseEvent<HTMLDivElement>, node: NodeApi<T>) => void }) {
  return (
    <div
      {...attrs}
      ref={innerRef as Ref<HTMLDivElement>}
      onFocus={(event) => event.stopPropagation()}
      onClick={(event) => {
        node.handleClick(event);
        onClick?.(event, node);
      }}
    >
      {children as ReactNode}
    </div>
  );
}
