import AuthPage from "@/components/auth-page";

export const metadata = {
  title: "Sign In — Medrella Healthcare",
  description: "Sign in to Medrella Healthcare clinical appointment system",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
