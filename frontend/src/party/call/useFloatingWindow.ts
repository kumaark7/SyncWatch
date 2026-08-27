import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

const VIEWPORT_MARGIN = 12;
const DEFAULT_WIDTH = 336;
const DEFAULT_HEIGHT = 272;
const MOBILE_BREAKPOINT = 640;

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerOperation = {
  pointerId: number;
  mode: "drag" | "resize";
  startX: number;
  startY: number;
  frame: WindowFrame;
};

function limits() {
  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const minWidth = mobile ? Math.min(260, window.innerWidth - VIEWPORT_MARGIN * 2) : 220;
  const minHeight = mobile ? 180 : 140;
  const maxWidth = mobile
    ? window.innerWidth - VIEWPORT_MARGIN * 2
    : Math.max(minWidth, window.innerWidth * 0.6);
  const maxHeight = Math.max(minHeight, window.innerHeight * 0.7);

  return { mobile, minWidth, minHeight, maxWidth, maxHeight };
}

function clampFrame(frame: WindowFrame): WindowFrame {
  const { mobile, minWidth, minHeight, maxWidth, maxHeight } = limits();
  const width = Math.min(Math.max(frame.width, minWidth), maxWidth);
  const height = Math.min(Math.max(frame.height, minHeight), maxHeight);
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);

  return {
    x: Math.min(Math.max(frame.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(frame.y, VIEWPORT_MARGIN), maxY),
    width: mobile ? maxWidth : width,
    height
  };
}

function initialFrame(): WindowFrame {
  const { mobile, maxWidth, maxHeight } = limits();
  const width = Math.min(DEFAULT_WIDTH, maxWidth);
  const height = Math.min(DEFAULT_HEIGHT, maxHeight);

  return clampFrame({
    x: window.innerWidth - width - 16,
    y: window.innerHeight - height - (mobile ? 20 : 80),
    width,
    height
  });
}

export default function useFloatingWindow() {
  const [frame, setFrame] = useState<WindowFrame>(initialFrame);
  const [mobile, setMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const operationRef = useRef<PointerOperation | null>(null);

  useEffect(() => {
    const handleViewportResize = () => {
      setMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      setFrame((current) => clampFrame(current));
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

  const startOperation = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    mode: PointerOperation["mode"]
  ) => {
    if (mode === "resize" && mobile) {
      return;
    }

    operationRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      frame
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [frame, mobile]);

  const moveOperation = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - operation.startX;
    const deltaY = event.clientY - operation.startY;
    setFrame(clampFrame(operation.mode === "drag"
      ? { ...operation.frame, x: operation.frame.x + deltaX, y: operation.frame.y + deltaY }
      : { ...operation.frame, width: operation.frame.width + deltaX, height: operation.frame.height + deltaY }
    ));
  }, []);

  const endOperation = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (operationRef.current?.pointerId !== event.pointerId) {
      return;
    }

    operationRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const style: CSSProperties = {
    width: frame.width,
    height: frame.height,
    transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`
  };

  return {
    mobile,
    style,
    startDrag: (event: ReactPointerEvent<HTMLElement>) => startOperation(event, "drag"),
    startResize: (event: ReactPointerEvent<HTMLElement>) => startOperation(event, "resize"),
    moveOperation,
    endOperation
  };
}
