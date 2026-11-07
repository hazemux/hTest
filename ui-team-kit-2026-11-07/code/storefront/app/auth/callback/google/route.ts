import { finishSocial } from "@/lib/account/social-handoff";

/** Google sends the customer back here with `?code=&state=` (registered redirect URI). */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const to = await finishSocial("google", query.get("code"), query.get("state"), null);

  return new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store" } });
}
