"use client";

import { useEffect, useState } from "react";

function format(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Relative time rendered only after mount, so server and client HTML match. */
export function TimeAgo({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);
  return <time dateTime={iso}>{now === null ? "" : format(iso, now)}</time>;
}

export function ClockTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      setText(new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })),
    );
    return () => cancelAnimationFrame(raf);
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
