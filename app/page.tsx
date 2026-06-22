import { redirect } from "next/navigation";

// Personal-use app: there is no marketing site. Send everyone to the dashboard.
// Unauthenticated visitors are bounced to /login by middleware.
export default function Home() {
  redirect("/dashboard");
}
