import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/supabase";

const passwordSetupTypes = new Set<EmailOtpType>(["recovery", "invite"]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const success = new URL("/login?passwordSetup=recovery", request.url);
  const failure = new URL("/login?authError=invalid_or_expired", request.url);

  if (!tokenHash || !type || !passwordSetupTypes.has(type)) {
    return NextResponse.redirect(failure);
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });

  return NextResponse.redirect(error ? failure : success);
}
