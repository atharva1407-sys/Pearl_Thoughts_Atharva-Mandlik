import AuthPage from "@/components/auth-page";

export const metadata = {
  title: "Sign In — Medrella Healthcare",
  description: "Sign in to Medrella Healthcare clinical appointment system",
};

interface LoginPageProps {
  searchParams?: Promise<{ portal?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  // `?portal=reception` shows the receptionist-only sign-in (reached from the Receptionist button).
  const portal = params?.portal === "reception" ? "reception" : undefined;
  // `key` remounts the form when switching portals, so the selected role never carries over.
  return <AuthPage key={portal ?? "default"} mode="login" portal={portal} />;
}
