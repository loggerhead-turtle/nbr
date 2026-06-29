import type { Metadata } from "next";
import { LegalProse } from "@/components/legal-prose";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service and User Agreement for National Baseball Ratings.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalProse title="Terms of Service & User Agreement" updated="June 27, 2026">
      <p>
        These Terms of Service (the “Terms”) govern your access to and use of the National
        Baseball Ratings website and related services (the “Service”). By accessing or using
        the Service, you agree to be bound by these Terms. If you do not agree, do not use the
        Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        The Service provides statistical ratings of amateur baseball teams, a
        tournament pool-generation tool, and related features. Ratings are computed estimates
        derived from publicly available game results and information submitted by users. The
        Service is provided for general informational and entertainment purposes only.
      </p>

      <h2>2. No Affiliation with Third Parties</h2>
      <p>
        The Service is independent and is <strong>not affiliated with, endorsed by, sponsored
        by, or in any way officially connected with</strong> GameChanger Media, Inc., Dick’s
        Sporting Goods, any youth or amateur baseball league, association, sanctioning body, or
        tournament organizer. All product names, logos, and brands are the property of their
        respective owners and are used for identification purposes only.
      </p>

      <h2>3. Accuracy; No Warranties</h2>
      <p>
        THE SERVICE, INCLUDING ALL RATINGS, RECORDS, AND POOL ASSIGNMENTS, IS PROVIDED
        “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR
        STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, TITLE, ACCURACY, OR NON-INFRINGEMENT.
      </p>
      <p>
        Ratings are statistical estimates and may be incomplete, delayed, or incorrect. We do
        not warrant that the Service will be uninterrupted, error-free, or that any data is
        accurate, complete, or current. You should not rely on the Service as the sole basis for
        any decision.
      </p>

      <h2>4. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE SERVICE, ITS OWNER,
        OPERATORS, OR CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR
        OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF (OR INABILITY TO USE)
        THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT, OR ANY OTHER LEGAL THEORY, EVEN
        IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p>
        OUR TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE SHALL NOT EXCEED
        ONE HUNDRED U.S. DOLLARS (USD $100). Some jurisdictions do not allow certain limitations,
        so portions of the above may not apply to you.
      </p>

      <h2>5. User Submissions</h2>
      <p>
        If you submit information (such as a team name or identifier), you represent that you
        have the right to do so and that it is accurate and not misleading. You grant us a
        worldwide, royalty-free license to use, store, reproduce, and display submitted
        information in connection with operating the Service. We may edit, remove, or decline to
        publish any submission at our discretion.
      </p>

      <h2>6. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose or in violation of any applicable law;</li>
        <li>
          submit false, misleading, infringing, or abusive content, or impersonate any person
          or team;
        </li>
        <li>
          attempt to disrupt, overload, scrape at scale, reverse engineer, or gain unauthorized
          access to the Service;
        </li>
        <li>use the Service to harass, defame, or harm others.</li>
      </ul>

      <h2>7. Team Pages, Future Accounts &amp; Privacy</h2>
      <p>
        Team pages display factual competitive information. Features that allow a team
        representative to associate themselves with a team may be offered in the future; where
        offered, contact details will be kept private and disclosed only as described in our{" "}
        <a className="font-medium text-navy-700 underline" href="/privacy">
          Privacy Policy
        </a>{" "}
        and with the relevant person’s consent. If you believe information about a team is
        inaccurate or was associated improperly, contact us to request review.
      </p>

      <h2>8. Intellectual Property</h2>
      <p>
        The Service’s original content, design, rating methodology, and software are owned by the
        Service’s owner and protected by applicable laws. Factual game results and scores are not
        owned by us. You may not copy, reproduce, or create derivative works of the Service’s
        proprietary materials without permission.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to defend, indemnify, and hold harmless the Service and its owner, operators,
        and contributors from and against any claims, liabilities, damages, losses, and expenses
        (including reasonable legal fees) arising out of or related to your use of the Service or
        your violation of these Terms.
      </p>

      <h2>10. Changes to the Service and Terms</h2>
      <p>
        We may modify or discontinue the Service, and may update these Terms, at any time.
        Changes are effective when posted. Your continued use of the Service after changes
        constitutes acceptance of the updated Terms.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Utah, USA, without regard to its
        conflict-of-laws rules. You agree to the exclusive jurisdiction of the state and federal
        courts located in Utah for any dispute not subject to arbitration or small-claims
        resolution.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms? Contact the site operator through the contact method
        provided on the Service.
      </p>
    </LegalProse>
  );
}
