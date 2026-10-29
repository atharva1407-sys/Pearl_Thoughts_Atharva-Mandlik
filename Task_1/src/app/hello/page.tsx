import { redirect } from "next/navigation";

export default function HelloRedirect() {
  redirect("/helloworld");
}
