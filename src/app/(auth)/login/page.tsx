import type { Metadata } from "next"
import { signIn } from "../actions"
import { AuthForm } from "../auth-form"

export const metadata: Metadata = { title: "Sign in" }

const NOTICES: Record<string, string> = {
  link_invalid: "That sign-in link is invalid or has expired. Sign in again.",
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams
  const next = typeof searchParams.next === "string" ? searchParams.next : undefined
  const error = typeof searchParams.error === "string" ? NOTICES[searchParams.error] : undefined
  return <AuthForm mode="login" action={signIn} next={next} notice={error} />
}
