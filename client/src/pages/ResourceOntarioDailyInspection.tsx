import ArticleLayout, {
  type OfficialReference,
} from "@/components/resources/ArticleLayout";
import { useSeoMeta } from "@/lib/useSeoMeta";

const DISCLAIMER =
  "This resource is general guidance only. Confirm current requirements with official Ontario/MTO sources or a qualified compliance professional. TruckFixr helps organize inspection and maintenance signals; it does not replace certified inspections or regulatory advice.";

const REFERENCES: OfficialReference[] = [
  {
    label: "Ontario — Commercial vehicle safety requirements",
    href: "https://www.ontario.ca/page/commercial-vehicle-safety",
  },
  {
    label: "Ontario — Commercial vehicle safety and emissions inspections",
    href: "https://www.ontario.ca/page/commercial-vehicle-inspections",
  },
  {
    label: "Ontario MTO — Official Truck Handbook (daily trip inspection)",
    href: "https://www.ontario.ca/document/official-mto-truck-handbook",
  },
];

export default function ResourceOntarioDailyInspection() {
  useSeoMeta({
    title: "Ontario Daily Inspection Guide for Commercial Fleets | TruckFixr",
    description:
      "A practical guide to daily commercial vehicle inspections in Ontario — what drivers check, how to record defects, and how to keep daily inspections from piling up.",
  });

  return (
    <ArticleLayout
      eyebrow="Inspection guide"
      title="Ontario Daily Inspection Guide for Commercial Fleets"
      intro="A practical overview of how daily commercial vehicle inspections work in Ontario, and how fleets can keep defects from turning into unplanned downtime. This is a plain-language summary for planning purposes — always confirm the current rules with official sources."
      disclaimer={DISCLAIMER}
      references={REFERENCES}
    >
      <h2>Why daily inspections matter</h2>
      <p>
        A daily inspection is the first chance to catch a small truck problem
        before it becomes an expensive breakdown on the road. In Ontario,
        commercial vehicles are generally expected to be inspected before they
        are driven, with defects recorded and addressed based on severity. Beyond
        the regulatory side, a consistent daily inspection habit gives a fleet a
        steady stream of early signals — the same signals that, when organized
        well, lead to faster maintenance decisions.
      </p>

      <h2>What a daily inspection usually covers</h2>
      <p>
        The exact schedule and items depend on the vehicle type and current
        requirements, but a daily commercial inspection typically walks through
        the major safety systems. Common areas include:
      </p>
      <ul>
        <li>Brakes, air system, and warning devices</li>
        <li>Tires, wheels, fasteners, and hub seals</li>
        <li>Steering and suspension components</li>
        <li>Lights, reflectors, and electrical connections</li>
        <li>Coupling devices and cargo securement (where applicable)</li>
        <li>Windshield, wipers, mirrors, and horn</li>
        <li>Fluid levels and visible leaks</li>
        <li>Emergency equipment and the inspection schedule itself</li>
      </ul>

      <h2>Major vs. minor defects</h2>
      <p>
        Daily inspections generally separate defects into minor and major
        categories. A minor defect should be recorded and monitored, but the
        vehicle may still be operated. A major defect means the vehicle should
        not be operated until the problem is repaired and re-checked. The
        important point for a fleet is that both kinds of defect are useful data:
        repeated minor defects on the same unit often point to a larger issue
        worth scheduling proactively.
      </p>

      <h2>Recording and following up on defects</h2>
      <p>
        A daily inspection is only as valuable as the follow-through behind it.
        When a driver records a defect, three things need to happen: the defect
        needs to reach the person who decides what to do, a decision needs to be
        made (monitor, schedule a repair, or take the vehicle out of service),
        and the outcome needs to be saved so the vehicle's history stays
        accurate. When any of those steps lives only in a text message, a paper
        pad, or someone's memory, problems slip through.
      </p>

      <h2>Keeping daily inspections from piling up</h2>
      <p>
        For small and mid-sized fleets, the hardest part is rarely the inspection
        itself — it is staying on top of the defects that come out of it. A few
        practical habits help:
      </p>
      <ul>
        <li>
          Capture inspections digitally so defects are searchable instead of
          buried in paper.
        </li>
        <li>
          Route every recorded defect to a single decision point, so nothing
          waits on a missed phone call.
        </li>
        <li>
          Watch for repeat defects on the same vehicle — they are an early signal
          worth scheduling around.
        </li>
        <li>
          Connect each defect to its repair outcome so the vehicle's maintenance
          record stays complete.
        </li>
      </ul>

      <h2>How TruckFixr helps</h2>
      <p>
        TruckFixr helps small and mid-sized fleets organize driver-reported
        issues, inspections, fault codes, compliance dates, and repair history so
        daily inspection defects turn into faster maintenance decisions. It is
        decision support — it does not replace certified inspections, qualified
        technicians, or the official requirements that apply to your fleet.
      </p>
    </ArticleLayout>
  );
}
