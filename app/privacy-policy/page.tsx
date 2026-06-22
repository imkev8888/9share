import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — 9share",
  description: "Privacy Policy for 9share Instagram automation.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This Privacy Policy explains how 9share collects, uses, stores, and deletes information when you connect an Instagram account and use the comment-to-DM automation dashboard."
    >
      <LegalSection title="Information We Collect">
        <p>
          When you use 9share, we may collect your account email address, your
          Instagram account ID, username, display name, profile picture,
          Instagram access token, selected post metadata, automation settings,
          comment text received through Instagram webhooks, commenter usernames,
          delivery status, and error logs.
        </p>
      </LegalSection>

      <LegalSection title="How We Use Information">
        <p>
          We use this information only to provide the app&apos;s core function:
          connecting your Instagram account, showing your posts, sending private
          replies or public comment replies based on your configured
          automations, and displaying delivery activity inside your dashboard.
        </p>
      </LegalSection>

      <LegalSection title="Instagram and Meta Data">
        <p>
          9share uses Meta and Instagram APIs only for the permissions granted by
          you during login. We do not ask for your Instagram password. We do not
          sell Instagram data, share it with advertisers, or use it for unrelated
          purposes.
        </p>
      </LegalSection>

      <LegalSection title="Data Storage and Security">
        <p>
          App data is stored in Supabase and access is restricted to the owner
          of the connected 9share account. Instagram access tokens are stored
          server-side and are not exposed to the browser.
        </p>
      </LegalSection>

      <LegalSection title="Data Sharing">
        <p>
          We do not sell, rent, or trade personal information. Data may be
          processed by service providers required to operate the app, including
          hosting, database, authentication, and Meta/Instagram API services.
        </p>
      </LegalSection>

      <LegalSection title="Data Deletion">
        <p>
          You may request deletion of your 9share account data and connected
          Instagram data at any time. Instructions are available on the User Data
          Deletion page.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For privacy or data deletion requests, contact the app owner, Kelvin
          Ng, using the contact details provided in the Facebook Developer app
          submission or through the channel where you received access to 9share.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
