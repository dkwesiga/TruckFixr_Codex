import ArticleLayout from "@/components/resources/ArticleLayout";

// NOTE: Plain-language terms for an early-stage SaaS. Good-faith draft; must be
// reviewed/ratified by legal counsel before being treated as final. The AI
// decision-support limitation below mirrors the disclaimer on the landing page.
const LAST_UPDATED = "June 29, 2026";

export default function Terms() {
  return (
    <ArticleLayout
      eyebrow="Terms"
      title="Terms of Service"
      intro={`The terms that govern your use of TruckFixr Fleet AI. Last updated ${LAST_UPDATED}.`}
      disclaimer="These terms are a good-faith draft being finalized with legal counsel. They do not constitute legal advice. If any part conflicts with a signed agreement between TruckFixr and your organization, the signed agreement governs."
    >
      <h2>1. Agreement</h2>
      <p>
        These terms govern your access to and use of the TruckFixr Fleet AI website,
        web app, and related services (the "Service"). By using the Service you agree to
        these terms. If you use the Service on behalf of a fleet or company, you confirm
        you are authorized to do so.
      </p>

      <h2>2. Accounts and access</h2>
      <p>
        You are responsible for keeping your login credentials secure and for activity
        under your account. Fleet administrators are responsible for the users and
        vehicles they add, and for the accuracy of the data they enter. Roles (owner,
        manager, driver) determine what each user can access.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not attempt to access another fleet's or user's data.</li>
        <li>Do not probe, scan, or disrupt the Service or its security controls.</li>
        <li>Do not upload unlawful content or infringe others' rights.</li>
        <li>Do not misuse the AI features to generate misleading safety records.</li>
      </ul>

      <h2>4. Maintenance decision support — important limitation</h2>
      <p>
        TruckFixr provides maintenance decision support and information tools. It does
        <strong> not</strong> replace certified inspections, qualified mechanics, or a
        carrier's legal compliance obligations. AI-generated diagnoses and
        recommendations may be incomplete or incorrect and must be reviewed by a
        qualified person before any safety, repair, or "safe to drive" decision is made.
        You remain responsible for the operation and roadworthiness of your vehicles.
      </p>

      <h2>5. Subscriptions and billing</h2>
      <p>
        Paid plans, pilots, and trials are described at the point of sign-up. Fees,
        billing cadence, and limits apply as shown for your plan. Card payments are
        processed by our payment provider. Unless stated otherwise, fees are
        non-refundable except as required by law.
      </p>

      <h2>6. Your data</h2>
      <p>
        Your use of the Service and our handling of personal information are described in
        our <a href="/privacy">Privacy Policy</a>. You retain your fleet data; you grant
        us the rights needed to operate the Service and provide it to you.
      </p>

      <h2>7. Availability</h2>
      <p>
        We work to keep the Service available but provide it on an "as is" and "as
        available" basis. We do not currently guarantee a specific uptime level. We may
        modify, suspend, or discontinue features with reasonable notice where practical.
      </p>

      <h2>8. Disclaimers and limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided without
        warranties of any kind, and TruckFixr is not liable for indirect, incidental, or
        consequential damages, or for decisions made in reliance on AI-generated output.
        Nothing in these terms limits liability that cannot be limited under applicable
        law.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate access
        for breach of these terms or to protect the Service or its users. On
        termination, your right to use the Service ends; data handling follows the
        Privacy Policy.
      </p>

      <h2>10. Changes and contact</h2>
      <p>
        We may update these terms as the product evolves; we will update the "last
        updated" date and provide notice of material changes where appropriate.
        Questions: info@truckfixr.com.
      </p>
    </ArticleLayout>
  );
}
