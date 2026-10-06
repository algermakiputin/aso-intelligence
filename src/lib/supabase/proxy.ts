import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabasePublicEnv } from "@/lib/env/public"
import type { Database } from "./database.types"

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"]
const AUTH_PAGES = ["/login", "/signup"]

/**
 * Refreshes the Supabase session cookie on every request and performs optimistic
 * redirects. Authorization is enforced again in every page and Server Action; this is
 * only a fast path for navigation.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { url, anonKey } = getSupabasePublicEnv()

  const supabase = createServerClient<Database, "aso">(url, anonKey, {
    db: { schema: "aso" },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Validates the JWT (and refreshes it when needed). Do not run code between client
  // creation and this call.
  const { data } = await supabase.auth.getClaims()
  const isSignedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const target = request.nextUrl.clone()
    target.pathname = path
    target.search = params ? `?${new URLSearchParams(params)}` : ""
    const redirect = NextResponse.redirect(target)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  if (
    !isSignedIn &&
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return redirectTo("/login", { next: `${pathname}${search}` })
  }
  if (isSignedIn && AUTH_PAGES.includes(pathname)) {
    return redirectTo("/dashboard")
  }

  return response
}
