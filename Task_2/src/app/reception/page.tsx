import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { ReceptionClient } from "./reception-client";

export default async function ReceptionPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in with clinical staff credentials to access the reception desk.");
  }

  return <ReceptionClient />;
}
