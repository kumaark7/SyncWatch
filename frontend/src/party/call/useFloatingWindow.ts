import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

const VIEWPORT_MARGIN = 8;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const MOBILE_BREAKPOINT = 640;
const MIN_WIDTH = 180;
const MIN_HEIGHT = 110;
const MINIMIZED_WIDTH = 126;
const MINIMIZED_HEIGHT = 40;

type FrameBounds = {
  width: number;
  height: number;
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerOperation = {
  pointerId: number;
  mode: "drag" | "resize";
  resizeEdge?: "bottom-left" | "bottom-right" | "bottom";
  captureTarget: HTMLElement;
  startX: number;
  startY: number;
  frame: WindowFrame;
  bounds: FrameBounds;
  moved: boolean;
  suppressClick: boolean;
};

function clampPosition(x: number, y: number, bounds: FrameBounds) {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - bounds.width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - bounds.height - VIEWPORT_MARGIN);

  return {
    x: Math.min(Math.max(x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(y, VIEWPORT_MARGIN), maxY)
  };
}

function resizeFrame(
  frame: WindowFrame,
  widthDelta: number,
  heightDelta: number,
  edge: "bottom-left" | "bottom-right" | "bottom"
) {
  const { minWidth, minHeight, maxWidth, maxHeight } = limits();
  const width = Math.min(Math.max(frame.width + (edge === "bottom" ? 0 : widthDelta), minWidth), maxWidth);
  const height = Math.min(Math.max(frame.height + heightDelta, minHeight), maxHeight);
  const x = edge === "bottom-left"
    ? frame.x + frame.width - width
    : frame.x;

  return clampFrame({ ...frame, x, width, height });
}

function limits() {
  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const availableWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
  const minWidth = Math.min(MIN_WIDTH, availableWidth);
  const minHeight = Math.min(MIN_HEIGHT, availableHeight);
  const maxWidth = availableWidth;
  const maxHeight = availableHeight;

  return { mobile, minWidth, minHeight, maxWidth, maxHeight };
}

function clampFrame(frame: WindowFrame): WindowFrame {
  const { minWidth, minHeight, maxWidth, maxHeight } = limits();
  const width = Math.min(Math.max(frame.width, minWidth), maxWidth);
  const height = Math.min(Math.max(frame.height, minHeight), maxHeight);
  const position = clampPosition(frame.x, frame.y, { width, height });

  return {
    ...position,
    width,
    height
  };
}

function initialFrame(): WindowFrame {
  const { mobile, maxWidth, maxHeight } = limits();
  const width = Math.min(mobile ? 280 : DEFAULT_WIDTH, maxWidth);
  const height = Math.min(mobile ? 180 : DEFAULT_HEIGHT, maxHeight);

  return clampFrame({
    x: window.innerWidth - width - 16,
    y: 16,
    width,
    height
  });
}

export default function useFloatingWindow(minimized = false) {
  const [frame, setFrame] = useState<WindowFrame>(initialFrame);
  const [mobile, setMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const operationRef = useRef<PointerOperation | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    const handleViewportResize = () => {
      setMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      setFrame((current) => minimized
        ? {
            ...current,
            ...clampPosition(current.x, current.y, {
              width: MINIMIZED_WIDTH,
              height: MINIMIZED_HEIGHT
            })
          }
        : clampFrame(current));
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, [minimized]);

  const startOperation = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    mode: PointerOperation["mode"],
    resizeEdge?: PointerOperation["resizeEdge"],
    bounds: FrameBounds = { width: frame.width, height: frame.height },
    suppressClick = false
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    operationRef.current = {
      pointerId: event.pointerId,
      mode,
      resizeEdge,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      frame,
      bounds,
      moved: false,
      suppressClick
    };
    setDragging(mode === "drag");
    setResizing(mode === "resize");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [frame]);

  const updateOperation = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== pointerId) {
      return;
    }

    const deltaX = clientX - operation.startX;
    const deltaY = clientY - operation.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      operation.moved = true;
    }
    setFrame(operation.mode === "drag"
      ? {
          ...operation.frame,
          ...clampPosition(
            operation.frame.x + deltaX,
            operation.frame.y + deltaY,
            operation.bounds
          )
        }
      : resizeFrame(
          operation.frame,
          operation.resizeEdge === "bottom-left" ? -deltaX : deltaX,
          deltaY,
          operation.resizeEdge ?? "bottom-right"
        )
    );
  }, []);

  const finishOperation = useCallback((pointerId: number) => {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== pointerId) {
      return;
    }

    operationRef.current = null;
    suppressNextClickRef.current = operation.suppressClick && operation.moved;
    setDragging(false);
    setResizing(false);
    if (operation.captureTarget.hasPointerCapture(pointerId)) {
      operation.captureTarget.releasePointerCapture(pointerId);
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      updateOperation(event.pointerId, event.clientX, event.clientY);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      finishOperation(event.pointerId);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
    };
  }, [finishOperation, updateOperation]);

  const moveBy = useCallback((deltaX: number, deltaY: number) => {
    setFrame((current) => clampFrame({
      ...current,
      x: current.x + deltaX,
      y: current.y + deltaY
    }));
  }, []);

  const moveMinimizedBy = useCallback((
    deltaX: number,
    deltaY: number,
    bounds: FrameBounds = { width: MINIMIZED_WIDTH, height: MINIMIZED_HEIGHT }
  ) => {
    setFrame((current) => ({
      ...current,
      ...clampPosition(current.x + deltaX, current.y + deltaY, bounds)
    }));
  }, []);

  const resizeBy = useCallback((deltaWidth: number, deltaHeight: number) => {
    setFrame((current) => resizeFrame(
      current,
      deltaWidth,
      deltaHeight,
      "bottom-right"
    ));
  }, []);

  const style: CSSProperties = {
    width: frame.width,
    height: frame.height,
    transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`
  };

  const minimizedStyle: CSSProperties = {
    transform: style.transform
  };

  return {
    mobile,
    dragging,
    resizing,
    style,
    minimizedStyle,
    startDrag: (event: ReactPointerEvent<HTMLElement>) => startOperation(event, "drag"),
    startMinimizedDrag: (event: ReactPointerEvent<HTMLElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      startOperation(
        event,
        "drag",
        undefined,
        { width: bounds.width, height: bounds.height },
        true
      );
    },
    startResize: (
      event: ReactPointerEvent<HTMLElement>,
      edge: "bottom-left" | "bottom-right" | "bottom" = "bottom-right"
    ) => startOperation(event, "resize", edge),
    cancelOperation: (event: ReactPointerEvent<HTMLElement>) => finishOperation(event.pointerId),
    consumeSuppressedClick: () => {
      const suppressed = suppressNextClickRef.current;
      suppressNextClickRef.current = false;
      return suppressed;
    },
    fitToViewport: () => setFrame((current) => clampFrame(current)),
    moveBy,
    moveMinimizedBy,
    resizeBy
  };
}
