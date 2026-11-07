import { appleName, finishSocial } from "@/lib/account/social-handoff";

/**
 * Apple POSTs the customer back here (`response_mode=form_post`) with `code`,
 * `state` and — the first time only — `user` holding the name.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const code = form.get("code");
  const state = form.get("state");
  const to = await finishSocial("apple", typeof code === "string" ? code : null, typeof state === "string" ? state : null, appleName(form.get("user")));

  return new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store" } });
}
