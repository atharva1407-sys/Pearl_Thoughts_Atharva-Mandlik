import AuthPage from "@/components/auth-page";

export const metadata = {
  title: "Create Account — Medrella Healthcare",
  description: "Join Medrella Healthcare outpatient appointment and scheduling portal",
};

export default function SignUpPage() {
  return <AuthPage mode="signup" />;
}
