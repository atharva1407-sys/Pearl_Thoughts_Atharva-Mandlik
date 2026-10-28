import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "DOCTOR") {
    redirect("/doctor/dashboard");
  }

  redirect("/patient/dashboard");
}
