import { LoginForm } from "@/components/auth/login-form"
import { getDataProvider } from "@/lib/data/provider-factory"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const setupRequired = await getDataProvider().getSetupStatus().then((value) => value.setupRequired).catch(() => false)
  return <LoginForm nextPath={params.next ?? "/dashboard"} setupRequired={setupRequired} />
}
