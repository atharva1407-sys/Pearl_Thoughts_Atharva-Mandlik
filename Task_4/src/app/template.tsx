"use client";

import { useEffect, useState } from "react";

// Set after the first page has mounted. A template (unlike a layout) re-mounts on every navigation,
// so later pages fade in instead of replacing the previous one in a hard cut, while the initial
// server-rendered page is shown immediately (no fade delaying first paint).
let hasMountedOnce = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const [animate] = useState(() => hasMountedOnce);

  useEffect(() => {
    hasMountedOnce = true;
  }, []);

  // Opacity only: a transform here would break position:fixed children.
  return <div className={animate ? "page-transition" : undefined}>{children}</div>;
}
