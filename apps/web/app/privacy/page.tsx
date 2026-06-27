import type { Metadata } from "next";
import { LegalProse } from "@/components/legal-prose";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for National Baseball Ratings.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalProse title="Privacy Policy" updated="June 27, 2026">
      <p>
        This Privacy Policy explains what information National Baseball Ratings (the “Service”)
        collects and how it is used. By using the Service, you consent to this Policy.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Publicly available game data</strong> — team names, scores, dates, and similar
          competitive results.
        </li>
        <li>
          <strong>Information you submit</strong> — for example, a team name or GameChanger team
          identifier you add through the Service.
        </li>
        <li>
          <strong>Basic technical data</strong> — standard server logs and aggregate analytics
          used to operate and secure the Service.
        </li>
      </ul>

      <h2>2. Contact Information (Future Account Features)</h2>
      <p>
        If and when account or team-association features are offered, a representative may
        provide a name, email address, and phone number. In that case:
      </p>
      <ul>
        <li>A representative’s name may be displayed publicly in association with their team.</li>
        <li>
          <strong>Email addresses and phone numbers are kept private by default</strong> and are
          not displayed publicly.
        </li>
        <li>
          Such contact details are revealed only to registered users, and only where the
          relevant representative has expressly opted in to be contacted.
        </li>
      </ul>

      <h2>3. How We Use Information</h2>
      <p>
        We use information to compute and publish ratings, operate the pool generator and other
        features, maintain and secure the Service, and respond to inquiries and reports.
      </p>

      <h2>4. Sharing</h2>
      <p>
        We do not sell personal information. We may share information with service providers who
        help us operate the Service, or where required by law or to protect our rights.
      </p>

      <h2>5. Cookies</h2>
      <p>
        The Service may use essential cookies (for example, to maintain an administrator session)
        and limited analytics. You can control cookies through your browser settings.
      </p>

      <h2>6. Children’s Privacy</h2>
      <p>
        The Service publishes team-level competitive results and is not directed to children for
        the collection of personal information. We do not knowingly collect personal information
        from children. If you believe a child has provided personal information, contact us and
        we will remove it.
      </p>

      <h2>7. Data Removal &amp; Requests</h2>
      <p>
        To request correction or removal of information about a team, or to exercise privacy
        rights available to you, contact the site operator through the contact method provided on
        the Service.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update this Policy from time to time. Changes are effective when posted.
      </p>
    </LegalProse>
  );
}
