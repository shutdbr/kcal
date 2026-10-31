import { t as toAuthUser } from "../chunks/user.js";
import { createServerClient } from "@supabase/ssr";
import { b as building } from "../chunks/internal.js";
import { p as public_env } from "../chunks/shared-server.js";
function supabaseConfig() {
  if (building) return null;
  const url = public_env.PUBLIC_SUPABASE_URL;
  const key = public_env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
function createSupabaseServerClient(event) {
  const config = supabaseConfig();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    global: { fetch: event.fetch },
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) event.cookies.set(name, value, { ...options, path: "/" });
      }
    }
  });
}
const handle = async ({ event, resolve }) => {
  const supabase = createSupabaseServerClient(event);
  event.locals.supabase = supabase;
  let user;
  event.locals.getUser = () => user ??= (async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getClaims();
    return error || !data ? null : toAuthUser(data.claims);
  })();
  return resolve(event, {
    // supabase-js reads these on responses SvelteKit replays during hydration
    filterSerializedResponseHeaders: (name) => name === "content-range" || name === "x-supabase-api-version"
  });
};
export {
  handle
};
