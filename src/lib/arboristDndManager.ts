import { createDragDropManager } from "dnd-core";
import { HTML5Backend } from "react-dnd-html5-backend";

export const arboristDndManager = createDragDropManager(HTML5Backend);
