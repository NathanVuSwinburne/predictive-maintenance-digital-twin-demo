import { MfaForm } from "@/components/auth/mfa-form"

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  return <MfaForm nextPath={params.next ?? "/dashboard"} />
}
