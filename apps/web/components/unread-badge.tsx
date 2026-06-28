"use client";

import { useEffect, useState } from "react";

/**
 * Red count bubble for unread scrimmage messages. Fetches client-side so the
 * header can stay static; refreshes when the tab regains focus.
 */
export function UnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/messages/unread");
        const data = await res.json();
        if (active) setCount(Number(data.count) || 0);
      } catch {
        /* ignore */
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
