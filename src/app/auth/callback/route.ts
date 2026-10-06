import type { EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Completes email confirmation (PKCE code or token hash) and continues to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const nextParam = searchParams.get("next") ?? "/dashboard"
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard"

  const supabase = await createSupabaseServerClient()
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing code") }

  if (error) return NextResponse.redirect(new URL("/login?error=link_invalid", origin))
  return NextResponse.redirect(new URL(next, origin))
}
