import { redirect } from "@sveltejs/kit";
import { s as safeRedirectPath } from "../../../../chunks/user.js";
const GET = async ({ url, locals }) => {
  const code = url.searchParams.get("code");
  if (code && locals.supabase) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, safeRedirectPath(url.searchParams.get("next")));
  }
  redirect(303, "/?signin=failed");
};
export {
  GET
};
