import ArticleLayout from "@/components/resources/ArticleLayout";

// NOTE: Plain-language privacy notice for an early-stage Canadian SaaS, aligned
// with PIPEDA principles (accountability, identifying purposes, limiting
// collection/use, safeguards, individual access). This is a good-faith draft and
// must be reviewed/ratified by legal counsel before being treated as final.
const LAST_UPDATED = "August 2, 2026";

export default function Privacy() {
  return (
    <ArticleLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      intro={`How TruckFixr Fleet AI collects, uses, and protects personal information. Last updated ${LAST_UPDATED}.`}
      disclaimer="This privacy policy is provided for transparency and is being finalized with legal counsel. TruckFixr is an early-stage company and SOC 2 readiness is in progress; TruckFixr is not SOC 2 certified, ISO 27001 certified, or HIPAA compliant. For questions or to exercise your privacy rights, contact privacy@truckfixr.com."
    >
      <h2>Who we are</h2>
      <p>
        TruckFixr Fleet AI ("TruckFixr", "we", "us") provides maintenance
        intelligence and decision-support software for commercial trucking
        fleets. This policy explains what personal information we handle and
        why. It applies to our website, web app, and progressive web app.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, phone
          number, company/fleet name, and role (owner, manager, or driver).
        </li>
        <li>
          <strong>Fleet and vehicle information:</strong> vehicle identifiers
          such as VIN, unit number, and license plate; mileage and engine hours;
          inspection records, defects, and maintenance history.
        </li>
        <li>
          <strong>Inspection evidence:</strong> photos and notes that drivers or
          managers attach to inspections and defects.
        </li>
        <li>
          <strong>Diagnostic inputs:</strong> symptoms, fault codes, and related
          notes submitted to the AI-assisted diagnosis workflow.
        </li>
        <li>
          <strong>Sales and demo requests:</strong> details you provide when you
          request a demo, pilot, or contact us (name, company, email, phone,
          fleet size, needs).
        </li>
        <li>
          <strong>Technical and usage data:</strong> log and error data needed
          to operate and secure the service. We redact identifiers such as
          emails, VINs, phone numbers, and tokens from operational logs.
        </li>
        <li>
          <strong>Billing data:</strong> subscription status and identifiers.
          Card payments are processed by Stripe; we do not store full card
          numbers.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide, maintain, and secure the service for your fleet.</li>
        <li>
          To generate maintenance decision support, inspections, and reports.
        </li>
        <li>
          To communicate with you about your account, support, and sales
          requests.
        </li>
        <li>To process subscriptions and billing.</li>
        <li>
          To detect, investigate, and prevent abuse, errors, and security
          issues.
        </li>
      </ul>
      <p>
        We do not sell personal information. We limit collection and use to what
        is needed for these purposes.
      </p>

      <h2>How we share it</h2>
      <p>
        We share personal information only with service providers who help us
        run TruckFixr, under contract and for the purposes above. These
        currently include infrastructure and database hosting, object storage,
        email delivery, payment processing, and AI model providers used for the
        diagnosis workflow. Diagnostic inputs sent to AI providers are limited
        to what is needed to produce a result. We may also disclose information
        where required by law.
      </p>

      <h2>Website analytics</h2>
      <p>
        On our <strong>public marketing website only</strong> — pages such as
        the homepage, pricing, resources, and the Fleet Maintenance Review
        booking page — we use <strong>Google Analytics 4 (GA4)</strong> to
        understand how visitors find and use the site, so we can improve it and
        measure whether it helps fleets book a review. We look at aggregate
        information such as pages viewed, referring source and campaign,
        approximate location (country/region), device category, and whether a
        visitor clicked a booking call-to-action or reached the calendar.
      </p>
      <p>
        We run GA4 in a <strong>cookieless, privacy-preserving way</strong>: it
        does <strong>not set advertising or analytics cookies</strong> and does
        not store a tracking identifier on your device, IP addresses are
        anonymized, and Google advertising features and Google Signals are
        turned off. Because we don&apos;t store or read tracking information on
        your device, we don&apos;t show an intrusive cookie banner. Analytics is{" "}
        <strong>never loaded on the signed-in TruckFixr application</strong>,
        and we do not use it to collect fleet, vehicle, diagnostic, repair,
        driver, or account information, or to advertise to you.
      </p>
      <p>
        <strong>Your choices.</strong> Analytics is optional and never required
        to use the site or book a review. You can turn it off at any time using
        the <strong>&ldquo;Do not track me&rdquo;</strong> control in the
        footer, which stops analytics on your browser. If your browser sends a{" "}
        <strong>Global Privacy Control (GPC)</strong> or{" "}
        <strong>Do Not Track (DNT)</strong> signal, we automatically disable
        analytics without you having to do anything.
      </p>
      <p>
        <strong>Campaign attribution.</strong> When you arrive from a campaign
        link, we read non-identifying campaign parameters (such as{" "}
        <code>utm_source</code>, <code>utm_medium</code>, and{" "}
        <code>utm_campaign</code>) for the current visit to understand which
        channels bring visitors. We never place personal information in these
        parameters and do not store them on your device.
      </p>
      <p>
        <strong>Retention.</strong> We aim to limit analytics retention — for
        example, configuring GA4 to retain event data for no longer than 14
        months. Exact retention depends on provider settings, which we verify in
        Google&apos;s dashboard. See Google&apos;s own notice for details:{" "}
        <a
          href="https://policies.google.com/privacy"
          rel="noopener noreferrer"
          target="_blank"
        >
          Google Privacy Policy
        </a>
        .
      </p>

      <h2>Multi-tenant data isolation</h2>
      <p>
        Each fleet's data is logically isolated from other fleets. Access is
        scoped to the authenticated user's fleet and role, with database
        row-level security enabled as an additional safeguard. See our security
        overview for details.
      </p>

      <h2>How we protect it</h2>
      <ul>
        <li>
          Encryption in transit (HTTPS) between your browser and our servers.
        </li>
        <li>
          Role-based access control separating drivers, managers, and staff.
        </li>
        <li>Redaction of personal identifiers in operational logs.</li>
        <li>Restricted administrative access and secret management.</li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We keep personal information for as long as your account is active or as
        needed to provide the service, then for a reasonable period to meet
        legal, accounting, or compliance-record obligations. You can request
        deletion as described below.
      </p>

      <h2>Your rights</h2>
      <p>
        Subject to applicable Canadian privacy law (PIPEDA) and provincial law,
        you may request access to, correction of, or deletion of your personal
        information, and you may withdraw consent where applicable. To make a
        request, contact privacy@truckfixr.com. If you are a driver or fleet
        member, some requests may be coordinated with your fleet administrator,
        who is responsible for the fleet account.
      </p>

      <h2>International processing</h2>
      <p>
        Our service providers may process or store data outside your province or
        country. We take steps to ensure comparable protection wherever data is
        handled.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as the product and our practices evolve. We
        will update the "last updated" date above and, for material changes,
        provide additional notice where appropriate.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or privacy requests: privacy@truckfixr.com. General inquiries:
        info@truckfixr.com.
      </p>
    </ArticleLayout>
  );
}
