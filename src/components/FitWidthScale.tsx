"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Scales children down so their intrinsic width fits the container.
 * On desktop (scale 1) content stays centered; on phones it shrinks to fit.
 */
export function FitWidthScale({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const available = outer.clientWidth;
      const contentWidth = Math.max(inner.scrollWidth, inner.offsetWidth);
      const contentHeight = inner.offsetHeight;
      const next =
        contentWidth > 0 && available > 0
          ? Math.min(1, available / contentWidth)
          : 1;
      setScale(next);
      setInnerHeight(contentHeight);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className={`flex w-full max-w-full justify-center ${className}`}
      style={{
        height: innerHeight ? innerHeight * scale : undefined,
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        className="w-max max-w-none"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
