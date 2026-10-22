import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";

type Context = { params: Promise<{ referenceId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Context) {
  const { referenceId } = await params;
  if (!uuidPattern.test(referenceId)) return new Response(null, { status: 404 });
  const userId = await getAuthenticatedUserId();
  if (!userId) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: asset, error } = await supabase.from("model_reference_assets").select("bucket_id,object_path,mime_type").eq("id", referenceId).eq("user_id", userId).maybeSingle();
  if (error || !asset) return new Response(null, { status: 404 });
  const signed = await supabase.storage.from(asset.bucket_id).createSignedUrl(asset.object_path, 60);
  if (signed.error || !signed.data?.signedUrl) return new Response(null, { status: 404 });
  try {
    const upstream = await fetch(signed.data.signedUrl, { cache: "no-store" });
    if (!upstream.ok) return new Response(null, { status: 404 });
    return new Response(upstream.body, { headers: { "Content-Type": asset.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
