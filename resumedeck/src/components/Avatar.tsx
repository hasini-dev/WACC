import styles from "./Avatar.module.css";

const COLORS = ["blue", "green", "red", "yellow", "purple", "pink"] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Square Tumblr-style avatar. Decorative: the name is always rendered next to it. */
export function Avatar({ name, seed, size = 64, hidden }: { name: string; seed: string; size?: number; hidden?: boolean }) {
  const color = COLORS[hash(seed) % COLORS.length];
  return (
    <span
      aria-hidden="true"
      className={styles.avatar}
      data-color={color}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {hidden ? "?" : initials(name)}
    </span>
  );
}
