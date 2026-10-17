import { redirect } from "next/navigation";

export default async function Home({ searchParams }: PageProps<"/">) {
  // If /auth/callback isn't in Supabase's redirect allow-list, the magic link lands on the
  // Site URL (this page) with ?code=…; forward it so sign-in still completes.
  const { code } = await searchParams;
  if (typeof code === "string" && code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect("/dashboard");
}
