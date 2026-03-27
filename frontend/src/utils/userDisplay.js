const PALETTE = [
  { bg: "#dbeafe", fg: "#1e3a8a", border: "#93c5fd" },
  { bg: "#fce7f3", fg: "#831843", border: "#f9a8d4" },
  { bg: "#d1fae5", fg: "#065f46", border: "#6ee7b7" },
  { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  { bg: "#e0e7ff", fg: "#3730a3", border: "#a5b4fc" },
  { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" },
  { bg: "#ccfbf1", fg: "#115e59", border: "#5eead4" },
  { bg: "#f3e8ff", fg: "#6b21a8", border: "#d8b4fe" },
  { bg: "#ecfccb", fg: "#365314", border: "#bef264" },
  { bg: "#fdf2f8", fg: "#86198f", border: "#f0abfc" },
  { bg: "#e0f2fe", fg: "#0c4a6e", border: "#7dd3fc" },
  { bg: "#fef9c3", fg: "#713f12", border: "#fde047" }
];

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) + h + str.charCodeAt(i);
  }
  return Math.abs(h);
}

export function colorsForUser(user) {
  if (!user || typeof user !== "object") {
    return { bg: "#f3f4f6", fg: "#6b7280", border: "#e5e7eb" };
  }
  const key = user._id?.toString() || user.id || user.email || "";
  if (!key) {
    return { bg: "#f3f4f6", fg: "#6b7280", border: "#e5e7eb" };
  }
  const idx = hashString(key) % PALETTE.length;
  return PALETTE[idx];
}

/** First name, or email local-part before . _ - */
export function shortAddedByName(user) {
  if (!user || typeof user !== "object") return "—";
  const name = user.name && String(user.name).trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    return first.length > 14 ? `${first.slice(0, 13)}…` : first;
  }
  if (user.email) {
    const local = user.email.split("@")[0];
    const part = local.split(/[._-]/)[0] || local;
    return part.length > 14 ? `${part.slice(0, 13)}…` : part;
  }
  return "—";
}

export function fullAddedByTitle(user) {
  if (!user || typeof user !== "object") return "";
  if (user.name && user.email) return `${user.name} (${user.email})`;
  return user.email || user.name || "";
}
