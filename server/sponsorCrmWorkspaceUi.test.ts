import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("Sponsor CRM workspace safeguards", () => {
  const eventsPage = read("client/src/pages/EventsPage.tsx");
  const app = read("client/src/App.tsx");

  it("opens every sponsor as its own Events-protected account workspace", () => {
    expect(app).toContain('path="/events/sponsors/:id"');
    expect(app).toContain('<EventsPage sponsorId={id} />');
    expect(eventsPage).toContain("Account directory");
    expect(eventsPage).toContain("openSponsor={id => navigate(`/events/sponsors/${id}`)}");
    expect(eventsPage).toContain("Sponsor account not found");
    expect(eventsPage).toContain('navigate("/events?tab=sponsors")');
  });

  it("separates account relationship, commitments, delivery, payments, and notes", () => {
    for (const tab of [
      "Account overview",
      "Commitments (",
      "Deliverables (",
      "Payments (",
      "Account notes",
    ]) {
      expect(eventsPage).toContain(tab);
    }
    expect(eventsPage).toContain("Deliverable tracking");
    expect(eventsPage).toContain("Payment follow-through");
    expect(eventsPage).toContain("Add account notes, relationship context");
    expect(eventsPage).toContain("Last contact");
    expect(eventsPage).toContain("Contact log");
    expect(eventsPage).toContain("Log contact");
  });

  it("gives change notices and delivery fields enough room to operate", () => {
    expect(eventsPage).toContain("min-h-24 resize-y bg-white py-2 text-sm");
    expect(eventsPage).toContain("xl:grid-cols-[minmax(175px,0.45fr)_minmax(320px,1fr)_175px_auto]");
    expect(eventsPage).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(150px,0.68fr)");
    expect(eventsPage).toContain("grid-cols-1 gap-3 border-t pt-3 text-xs sm:grid-cols-3");
    expect(eventsPage).toContain("xl:grid-cols-[minmax(0,1.2fr)_140px_140px");
  });

  it("keeps deliverable details below the working row and makes each Event expandable", () => {
    expect(eventsPage).toContain('className="mt-3 min-w-0 border-t pt-3"');
    expect(eventsPage).toContain('placeholder="Add details"');
    expect(eventsPage).toContain("expandedDeliverableEvents[ask.id] ?? true");
    expect(eventsPage).toContain("toggleDeliverableEvent(ask.id)");
    expect(eventsPage).toContain("sponsor-deliverables-${ask.id}");
  });
});
