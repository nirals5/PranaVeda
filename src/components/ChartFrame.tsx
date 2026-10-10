import React, { useLayoutEffect, useRef, useState } from 'react';

// Measures its container so Recharts gets explicit pixel dimensions.
export default function ChartFrame({
  height,
  children,
}: {
  height: number;
  children: (size: { width: number; height: number }) => React.ReactElement;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const updateWidth = () => {
      setWidth(Math.max(0, Math.floor(frameRef.current?.clientWidth ?? 0)));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (frameRef.current) observer.observe(frameRef.current);
    window.addEventListener('resize', updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  return (
    <div ref={frameRef} className="h-full w-full min-w-0">
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}
