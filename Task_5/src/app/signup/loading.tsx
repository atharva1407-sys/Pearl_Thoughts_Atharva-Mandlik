import AuthPage from "@/components/auth-page";

// The signup page needs no server data, so its loading state is the page itself: Next.js can prefetch
// it and show the form the instant a link is clicked, then swap in the identical server render.
export default function Loading() {
  return <AuthPage mode="signup" />;
}
