import { ActivationForm } from "@/components/auth/activation-form";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <ActivationForm token={token} />;
}
