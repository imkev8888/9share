import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — 9share",
  description: "Terms of Service for 9share Instagram automation.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="These Terms of Service describe the rules for using 9share, a personal Instagram comment-to-DM automation dashboard."
    >
      <LegalSection title="Use of the App">
        <p>
          9share is provided to help approved users connect an Instagram Business
          or Creator account, configure comment-based automations, and view
          delivery activity. You are responsible for using the app in a lawful,
          respectful, and non-spammy way.
        </p>
      </LegalSection>

      <LegalSection title="Instagram and Meta Rules">
        <p>
          By using 9share, you agree to follow Meta&apos;s and Instagram&apos;s
          platform rules, developer policies, messaging policies, and community
          guidelines. You must not use 9share to send misleading, abusive,
          unauthorized, or spam content.
        </p>
      </LegalSection>

      <LegalSection title="Account Access">
        <p>
          You must only connect Instagram accounts that you own or are authorized
          to manage. You are responsible for maintaining access to your 9share
          login and for any automations configured under your account.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          9share is provided as-is. The app may depend on third-party services
          such as Vercel, Supabase, and Meta APIs. Availability and delivery
          behavior may change if those services are unavailable or if Meta
          changes API access.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, 9share and its owner are not
          liable for indirect, incidental, or consequential damages resulting
          from use of the app, automation configuration, API outages, account
          restrictions, or message delivery issues.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          Access may be removed if the app is misused, if Instagram or Meta
          permissions are revoked, or if continued access would violate platform
          policies or applicable law.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For questions about these terms, contact the app owner, Kelvin Ng,
          using the contact details provided in the Facebook Developer app
          submission or through the channel where you received access to 9share.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
