import { redirect } from "next/navigation";

// The assistant now lives as a chat popup on My Appointments; keep old links and bookmarks working.
export default function AssistantPage() {
  redirect("/patient/dashboard");
}
