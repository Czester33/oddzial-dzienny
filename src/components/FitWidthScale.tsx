"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const MOBILE_MQ = "(max-width: 768px)";

function useIsMobile(): { isMobile: boolean; ready: boolean } {
  const [isMobile, setIsMobile] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    setReady(true);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return { isMobile, ready };
}

/**
 * Scales wide tables to fit the viewport on phones.
 * Uses a fixed design width on mobile so scale does not jitter from ResizeObserver loops.
 */
export function FitWidthScale({
  children,
  className = "",
  contentWidthPx,
}: {
  children: ReactNode;
  className?: string;
  /** Intrinsic table width in px — required for stable mobile scaling. */
  contentWidthPx: number;
}) {
  const { isMobile, ready } = useIsMobile();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!ready || !isMobile) {
      setScale(1);
      setScaledHeight(undefined);
      return;
    }

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let raf = 0;

    const measureScale = () => {
      const available = outer.clientWidth || window.innerWidth;
      if (!available || !contentWidthPx) return;
      const next = Math.min(1, available / contentWidthPx);
      setScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };

    const measureHeight = () => {
      const contentHeight = inner.offsetHeight;
      if (!contentHeight) return;
      setScaledHeight((prev) => {
        const available = outer.clientWidth || window.innerWidth;
        const nextScale = Math.min(1, available / contentWidthPx);
        const nextHeight = Math.ceil(contentHeight * nextScale);
        return prev === nextHeight ? prev : nextHeight;
      });
    };

    const measureAll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measureScale();
        measureHeight();
      });
    };

    measureAll();

    const outerObserver = new ResizeObserver(measureScale);
    outerObserver.observe(outer);

    const innerObserver = new ResizeObserver(measureHeight);
    innerObserver.observe(inner);

    window.addEventListener("resize", measureAll);
    window.addEventListener("orientationchange", measureAll);

    const delayed = window.setTimeout(measureAll, 150);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(delayed);
      outerObserver.disconnect();
      innerObserver.disconnect();
      window.removeEventListener("resize", measureAll);
      window.removeEventListener("orientationchange", measureAll);
    };
  }, [ready, isMobile, contentWidthPx]);

  if (!ready || !isMobile) {
    return (
      <div className={`flex w-full max-w-full justify-center ${className}`}>
        {children}
      </div>
    );
  }

  const innerStyle: CSSProperties = {
    width: contentWidthPx,
    transform: scale < 1 ? `scale(${scale})` : undefined,
    transformOrigin: "top center",
  };

  return (
    <div
      ref={outerRef}
      className={`w-full max-w-full overflow-x-clip ${className}`}
      style={{ height: scaledHeight }}
    >
      <div ref={innerRef} className="mx-auto max-w-none" style={innerStyle}>
        {children}
      </div>
    </div>
  );
}
