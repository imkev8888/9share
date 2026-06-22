import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "User Data Deletion — 9share",
  description: "Instructions for deleting user data from 9share.",
};

export default function UserDataDeletionPage() {
  return (
    <LegalPage
      title="User Data Deletion"
      description="This page explains how users can request deletion of their 9share account data and connected Instagram data."
    >
      <LegalSection title="What Data Can Be Deleted">
        <p>
          A deletion request can remove your 9share account records, connected
          Instagram account information, stored Instagram access tokens,
          automation settings, selected post metadata, comment logs, delivery
          status records, and related error logs.
        </p>
      </LegalSection>

      <LegalSection title="How to Request Deletion">
        <p>
          To request deletion, contact the app owner, Kelvin Ng, using the
          contact details provided in the Facebook Developer app submission or
          through the channel where you received access to 9share.
        </p>
        <p>Please include:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The email address used to log in to 9share.</li>
          <li>The Instagram username connected to 9share.</li>
          <li>A short note saying you want your 9share data deleted.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Processing Time">
        <p>
          Deletion requests will be reviewed and processed as soon as reasonably
          possible. After deletion, connected Instagram tokens and automation
          records will no longer be available in 9share.
        </p>
      </LegalSection>

      <LegalSection title="Remove App Access from Instagram">
        <p>
          You can also remove 9share&apos;s access from Instagram or Meta account
          settings. Removing app access stops future API access, but you should
          still send a deletion request if you want stored 9share records
          removed from the app database.
        </p>
      </LegalSection>

      <LegalSection title="Data That May Be Retained">
        <p>
          Some minimal records may be retained if required for security, abuse
          prevention, legal compliance, or backup recovery, but they will not be
          used for automation after deletion is processed.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
