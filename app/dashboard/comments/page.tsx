import { redirect } from "next/navigation";

/** Comments moderation lives under Activity now. */
export default function CommentsRedirectPage() {
  redirect("/dashboard/logs");
}
