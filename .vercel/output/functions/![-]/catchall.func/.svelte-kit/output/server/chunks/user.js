const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
function toAuthUser(identity) {
  const id = identity.sub ?? identity.id;
  if (!id) return null;
  const meta = identity.user_metadata ?? {};
  return {
    id,
    email: text(identity.email),
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    isAdmin: identity.app_metadata?.role === "admin"
  };
}
function safeRedirectPath(next, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://kcal.invalid");
    return url.origin === "http://kcal.invalid" ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
export {
  safeRedirectPath as s,
  toAuthUser as t
};
