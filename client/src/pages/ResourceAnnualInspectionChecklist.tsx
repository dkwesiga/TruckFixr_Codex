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
    label: "Ontario MTO — Official Truck Handbook",
    href: "https://www.ontario.ca/document/official-mto-truck-handbook",
  },
];

export default function ResourceAnnualInspectionChecklist() {
  useSeoMeta({
    title: "Annual Inspection Planning Checklist for Fleets | TruckFixr",
    description:
      "A simple checklist to plan annual and semi-annual commercial vehicle inspection dates ahead of time, so fleet maintenance stays scheduled instead of becoming urgent.",
  });

  return (
    <ArticleLayout
      eyebrow="Planning checklist"
      title="Annual Inspection Planning Checklist"
      intro="A simple, practical checklist to help small and mid-sized fleets plan annual and semi-annual inspection dates ahead of time — so inspections stay scheduled instead of becoming an urgent, last-minute scramble."
      disclaimer={DISCLAIMER}
      references={REFERENCES}
    >
      <h2>Why plan inspections in advance</h2>
      <p>
        Annual and (where applicable) semi-annual inspections are predictable —
        the dates are known well ahead of time. Yet they often turn into a
        last-minute rush, because the deadline is tracked in one person's head or
        in a spreadsheet nobody opens until it is nearly due. Planning a few weeks
        ahead means a vehicle can be inspected during a natural gap in its
        schedule, any defects found can be repaired in one planned visit, and the
        truck stays available for dispatch.
      </p>

      <h2>Before the inspection is due</h2>
      <ul>
        <li>
          Confirm the inspection expiry date for each vehicle and note which
          inspections apply (annual, and semi-annual where required).
        </li>
        <li>
          Set a reminder several weeks ahead — not on the expiry date itself.
        </li>
        <li>
          Review the vehicle's open defects and recent driver reports, so known
          issues can be addressed in the same visit.
        </li>
        <li>
          Check for repeat issues on the unit that may need attention before the
          inspection.
        </li>
        <li>Confirm shop availability and book the slot early.</li>
      </ul>

      <h2>Bundling repairs with the inspection</h2>
      <p>
        An inspection visit is a natural opportunity to handle pending work in one
        trip to the shop. Before the appointment, gather:
      </p>
      <ul>
        <li>Open inspection defects from daily checks</li>
        <li>Outstanding driver-reported symptoms and warning lights</li>
        <li>Fault codes that have not yet been resolved</li>
        <li>Any deferred minor repairs that were being monitored</li>
      </ul>
      <p>
        Grouping these into a single planned visit reduces repeat shop trips and
        keeps the vehicle's downtime predictable instead of scattered across the
        month.
      </p>

      <h2>At inspection time</h2>
      <ul>
        <li>Make sure the driver's recent inspection records are up to date.</li>
        <li>Bring the vehicle's maintenance and repair history.</li>
        <li>
          Record the inspection result and any new defects against the vehicle.
        </li>
        <li>Schedule follow-up work for anything that could not be completed.</li>
      </ul>

      <h2>After the inspection</h2>
      <ul>
        <li>Save the inspection outcome to the vehicle's maintenance record.</li>
        <li>Update the next inspection due date.</li>
        <li>
          Close out any defects that were repaired, and keep monitoring the ones
          that were deferred.
        </li>
      </ul>

      <h2>How TruckFixr helps</h2>
      <p>
        TruckFixr helps small and mid-sized fleets keep inspection dates, open
        defects, fault codes, and repair history in one place, so annual and
        semi-annual inspections can be planned ahead and bundled with pending work
        where possible. It supports faster maintenance decisions — it does not
        replace certified inspections or the official requirements that apply to
        your fleet.
      </p>
    </ArticleLayout>
  );
}
