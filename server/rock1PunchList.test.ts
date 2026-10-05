/**
 * Rock 1, Milestone 1 punch list fixes: pro-forma auto-save on leaving the
 * page, the pro-forma numbers button with nothing linked, the Zillow paste
 * box, the featured order tie-break, the case study property search, one
 * agent card for properties and case studies, no revenue or return
 * figures in a property's public meta text, page titles that fit in 60
 * characters, AI text cut at a sentence end, and half baths counted as halves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { proformaSnapshot } from "../client/src/lib/proformaSnapshot";
import { CASE_STUDY_ASK_COPY } from "../client/src/lib/caseStudyAskCopy";
import { isCaseStudyLeadPath, websiteFormLeadSource } from "../shared/websiteLeadSources";
import {
  buildSeoMessages,
  fitToSentence,
  parseSeoAnswer,
  PROPERTY_META_HIDDEN_FACTS,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
} from "./websiteSeoWriter";
import { websitePageTitle } from "../shared/websitePageTitle";
import { pageTitle } from "./websiteSeoPages";
import { bathroomCountFromText, mapZillowPropertyResponse, zillowBathroomCount } from "./externalApis";
import { typedBaths } from "../client/src/lib/inputFormatters";

const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");
const proformaPage = read("client/src/pages/ProformaPage.tsx");
const websiteTab = read("client/src/components/website/PropertyWebsiteTab.tsx");
const contentEditor = read("client/src/components/website/ContentEditor.tsx");
const websiteRouter = read("server/routers/website.ts");

describe("pro-forma auto-save", () => {
  it("treats a rename alone as a change", () => {
    const form = { purchasePrice: "500000" };
    expect(proformaSnapshot(form, "25% down")).not.toBe(proformaSnapshot(form, "30% down"));
    expect(proformaSnapshot(form, "25% down")).toBe(proformaSnapshot({ purchasePrice: "500000" }, "25% down"));
    expect(proformaPage).toContain("onChange={e => { hasDirtyChanges.current = true; setTitle(e.target.value); }}");
  });

  it("saves straight away on leaving the page instead of dropping the last 2 seconds", () => {
    expect(proformaPage).toContain('document.addEventListener("visibilitychange", onHidden)');
    expect(proformaPage).toContain('window.addEventListener("beforeunload", onBeforeUnload)');
    expect(proformaPage).toMatch(/mountedRef\.current = false;\s*flushAutoSave\(\);/);
  });

  it("never creates a second row for a new pro-forma, and a refresh reopens it", () => {
    expect(proformaPage).toContain("editingIdRef.current = result.id;");
    expect(proformaPage).toContain("proforma?load=${result.id}`, { replace: true }");
  });

  it("keeps edits typed during a save marked unsaved, and says when a save fails", () => {
    expect(proformaPage).not.toContain("hasDirtyChanges.current = false;\n    } catch (e) { console.error");
    expect(proformaPage).toContain("hasDirtyChanges.current = proformaSnapshot(formRef.current, titleRef.current) !== snapshot;");
    expect(proformaPage).toContain('toast.error("Auto-save failed.');
  });

  it("refreshes the Website tab's pro-forma list after a save", () => {
    expect(proformaPage).toContain("utils.website.propertyWebsiteContent.invalidate({ propertyId })");
  });
});

describe("Use the pro-forma numbers with nothing linked", () => {
  const hint = websiteTab.slice(websiteTab.indexOf("function ProformaNumbersHint"));
  it("still shows the button, disabled, with what to do first", () => {
    expect(hint).not.toContain("if (!proforma) return null;");
    expect(hint).toContain("Link a pro-forma above first");
    expect(hint).toContain("This property has no pro-forma yet.");
    expect(hint).toContain("/proforma?new=true");
  });
});

describe("Import from Zillow paste box", () => {
  it("stays open while the link is typed", () => {
    expect(websiteTab).not.toContain("zillowPasteOpen && !zillowLink.trim()");
    expect(websiteTab).toContain("disabled={!draft.sourceUrl.trim() || importZillow.isPending}");
  });
});

describe("homepage featured order", () => {
  it("breaks ties by id so the order is stable", () => {
    expect(websiteRouter).toContain(
      "desc(websiteFeaturedListings.featuredAt), desc(websiteProperties.publishedAt), desc(websiteProperties.id)"
    );
  });
});

describe("case study property search", () => {
  it("matches every typed word across address, city, state and zip", () => {
    expect(contentEditor).toContain("words.every(word => haystack.includes(word))");
    expect(websiteRouter).toMatch(/city: properties\.city,\s*state: properties\.state,\s*zip: properties\.zip,/);
  });
});

describe("Create a pro-forma from the Website tab", () => {
  it("navigates in the app instead of reloading the page", () => {
    const hint = websiteTab.slice(websiteTab.indexOf("function ProformaNumbersHint"));
    expect(hint).toContain("navigate(`/properties/${propertyId}/proforma?new=true`)");
    expect(hint).not.toContain('<a href={`/properties/${propertyId}/proforma?new=true`}');
  });
});

describe("one agent card on properties and case studies", () => {
  const publicSite = read("client/src/pages/PublicWebsite.tsx");
  const card = publicSite.slice(
    publicSite.indexOf("function AgentContactCard"),
    publicSite.indexOf("function marketsLine")
  );

  it("keeps the buttons in one order", () => {
    const order = [
      "Message {firstName}",
      "Schedule a Call",
      "Call {firstName}",
      "Book a Showing",
      "Request Deeper Analysis",
      "Financing",
      "View Full Profile",
    ].map(text => card.indexOf(text));
    expect(order.every(index => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is used by the property page, with Schedule a Call from the agent's booking link", () => {
    expect(publicSite).toContain('title="Your Agent"');
    expect(publicSite).toContain("bookingUrl: item.assignedAgentBookingUrl");
    expect(publicSite).toContain('requests={["showing", "analysis", "financing"]}');
    expect(websiteRouter).toContain("assignedAgentBookingUrl: normalizeBookingUrl(row.assignedAgentBookingUrl)");
  });

  it("gives case studies Deeper Analysis and Financing, but no showing", () => {
    expect(publicSite).toContain('requests={["analysis", "financing"]}');
  });
});

describe("case study analysis and financing leads", () => {
  const publicSite = read("client/src/pages/PublicWebsite.tsx");
  const caseForm = publicSite.slice(publicSite.indexOf('id="case-study-lead-form"'));

  it("submit with the requestType of the button that opened the form", () => {
    expect(caseForm.slice(0, 800)).toContain("requestType={caseAsk ?? undefined}");
    const leadForm = publicSite.slice(publicSite.indexOf("function LeadForm"), publicSite.indexOf("function LeadForm") + 6000);
    expect(leadForm).toMatch(/submit\.mutate\(\{\s*\.\.\.form,\s*intent,\s*requestType,/);
    expect(leadForm).toContain("sourcePath: window.location.pathname");
  });

  it("are tracked as Deeper Analysis and Financing requests", () => {
    const path = "/newsite/case-studies/orem-utah-511755547";
    expect(websiteFormLeadSource({ intent: "property", requestType: "analysis", sourcePath: path })).toBe(
      "Deeper Analysis Request"
    );
    expect(websiteFormLeadSource({ intent: "property", requestType: "financing", sourcePath: path })).toBe(
      "Financing Request"
    );
    expect(websiteFormLeadSource({ intent: "property", sourcePath: path })).toBe("Case Study Inquiry");
  });

  it("word the form for a closed deal", () => {
    expect(CASE_STUDY_ASK_COPY.analysis.title(null)).toBe("Get an analysis like this one");
    expect(CASE_STUDY_ASK_COPY.analysis.message("Orem Utah")).toBe(
      "I'd like a deeper investment analysis on a property like the one in Orem Utah."
    );
    expect(CASE_STUDY_ASK_COPY.financing.title(null)).toBe("Financing like this deal");
    expect(CASE_STUDY_ASK_COPY.financing.message("Orem Utah")).toBe(
      "I'd like to talk through financing for a purchase like Orem Utah."
    );
    expect(CASE_STUDY_ASK_COPY.default.title(null)).toBe("Ask Savvy about this story");
  });

  it("never email the visitor the case study property's street address", () => {
    expect(isCaseStudyLeadPath("/newsite/case-studies/orem-utah-511755547")).toBe(true);
    expect(isCaseStudyLeadPath("/newsite/properties/608-touchstone-circle-port-orange")).toBe(false);
    expect(websiteRouter).toContain(
      "if (input.requestType && input.propertyId && !isCaseStudyLeadPath(input.sourcePath))"
    );
  });
});

describe("property meta text carries no revenue or return figures", () => {
  const facts = {
    address: "608 Touchstone Circle",
    city: "Port Orange",
    state: "FL",
    beds: 5,
    projectedAnnualRevenue: "135024",
    cashOnCashPercent: "11.8",
    capRatePercent: "7.2",
    occupancyPercent: "68",
    averageDailyRate: "540",
    proformaBaseCaseGrossRevenue: "135024",
    agentBlurb: "Cash flowed from month one for my last buyer.",
  };

  it("drops the figures from what the model sees and forbids stating any", () => {
    const [system, user] = buildSeoMessages({ kind: "property", facts });
    expect(system.content).not.toContain("mention the projected revenue");
    expect(system.content).toContain("Never state revenue, cash-on-cash, cap rate, occupancy, nightly rate");
    const sent = JSON.parse(user.content).facts;
    for (const key of PROPERTY_META_HIDDEN_FACTS) expect(sent).not.toHaveProperty(key);
    expect(sent).toMatchObject({ address: "608 Touchstone Circle", city: "Port Orange", beds: "5" });
  });

  it("still lets a case study lead with its result", () => {
    const [system, user] = buildSeoMessages({ kind: "caseSeo", facts: { "Annual revenue": "$135,024" } });
    expect(system.content).toContain("lead with the result the client got");
    expect(system.content).not.toContain("Never state revenue");
    expect(JSON.parse(user.content).facts).toHaveProperty("Annual revenue");
  });

  it("is not sent the figures by the editor or the router", () => {
    const ai = websiteTab.slice(websiteTab.indexOf("const aiContent"), websiteTab.indexOf("function submit()"));
    for (const key of [
      "projectedAnnualRevenue",
      "cashOnCashPercent",
      "capRatePercent",
      "occupancyPercent",
      "averageDailyRate",
      "agentBlurb",
    ]) {
      expect(ai).not.toContain(key);
    }
    expect(websiteRouter).not.toContain("proformaBaseCaseGrossRevenue");
  });
});

describe("page titles fit in 60 characters", () => {
  it("adds the site name to a page's own meta title only when it still fits", () => {
    expect(websitePageTitle("Repeat-client portfolio growth in Asheville", { ownMetaTitle: true })).toBe(
      "Repeat-client portfolio growth in Asheville"
    );
    expect(websitePageTitle("Orem, UT turnkey STR", { ownMetaTitle: true })).toBe("Orem, UT turnkey STR | Savvy STR Agents");
    const sixty = "x".repeat(41); // 41 + " | Savvy STR Agents" (19) = 60
    expect(websitePageTitle(sixty, { ownMetaTitle: true })).toBe(`${sixty} | Savvy STR Agents`);
    expect(websitePageTitle(`${sixty}y`, { ownMetaTitle: true })).toBe(`${sixty}y`);
  });

  it("always adds it to anything that is not a meta title, and the server agrees", () => {
    const address = "9304 South Old Oregon Inlet Road, Nags Head, NC 27959 and more";
    expect(websitePageTitle(address)).toBe(`${address} | Savvy STR Agents`);
    expect(websitePageTitle("")).toBe("Savvy STR Agents");
    expect(pageTitle("Nags Head, NC semi-oceanfront 7-bed vacation home", { ownMetaTitle: true })).toBe(
      "Nags Head, NC semi-oceanfront 7-bed vacation home"
    );
  });

  it("is used by the server for property and case study meta titles, and by the browser tab", () => {
    const seo = read("server/websiteSeo.ts");
    expect(seo).toContain("ownMetaTitle: !!row.metaTitle?.trim(),");
    expect(seo).toContain("ownMetaTitle: !!seo?.metaTitle?.trim(),");
    expect(seo).toContain("pageTitle(found.title, { ownMetaTitle: found.ownMetaTitle })");
    const publicSite = read("client/src/pages/PublicWebsite.tsx");
    expect(publicSite).toContain("document.title = websitePageTitle(title, { ownMetaTitle });");
    expect(publicSite).toContain('usePageTitle(item?.metaTitle || item?.title || "Case Study", { ownMetaTitle: !!item?.metaTitle?.trim() });');
    expect(websiteRouter).toContain("metaTitle: seo?.metaTitle ?? null");
  });
});

describe("Write with AI lengths", () => {
  it("asks for at most 55 and 130 to 150 characters", () => {
    const [system] = buildSeoMessages({ kind: "property", facts: { city: "Nags Head" } });
    expect(system.content).toContain("at most 55 characters");
    expect(system.content).toContain("130 to 150 characters");
  });

  it("caps at 60 and 155, ending a description at its last full sentence", () => {
    const description =
      "Semi-oceanfront 7 bed, 7.5 bath home in South Nags Head, NC with a pool and hot tub. Listed at $1,599,000. Verify permits and operating rules during diligence.";
    const answer = parseSeoAnswer(
      JSON.stringify({ metaTitle: "Nags Head NC semi-oceanfront 7 bed single family home for sale now", metaDescription: description }),
      "property"
    );
    expect(answer.metaTitle.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
    expect(answer.metaDescription).toBe(
      "Semi-oceanfront 7 bed, 7.5 bath home in South Nags Head, NC with a pool and hot tub. Listed at $1,599,000."
    );
    expect(answer.metaDescription.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX);
  });

  it("falls back to a word cut when no sentence ends past 100 characters", () => {
    const text = "Short one. " + "word ".repeat(60);
    const cut = fitToSentence(text, 155);
    expect(cut.length).toBeLessThanOrEqual(155);
    expect(cut).not.toBe("Short one.");
    expect(cut.endsWith(" ")).toBe(false);
  });

  it("leaves a description that fits alone", () => {
    expect(fitToSentence("Fits. Easily", 155)).toBe("Fits. Easily");
  });
});

describe("bathroom counts", () => {
  const nineThreeOhFour = {
    bathrooms: 8,
    resoFacts: {
      bathrooms: 8,
      bathroomsFull: 7,
      bathroomsHalf: null,
      bathroomsOneQuarter: null,
      bathroomsPartial: 1,
      bathroomsFloat: 8,
      bathroomsThreeQuarter: null,
    },
  };

  it("counts Zillow's half bath as a half (real 9304 / 6927 response shape)", () => {
    expect(zillowBathroomCount(nineThreeOhFour)).toBe(7.5);
    expect(zillowBathroomCount({ bathrooms: 3, resoFacts: { bathroomsFull: 2, bathroomsHalf: 2 } })).toBe(3);
    expect(zillowBathroomCount({ bathrooms: 3, resoFacts: { bathroomsFull: 2, bathroomsThreeQuarter: 1, bathroomsPartial: 1 } })).toBe(3);
    expect(zillowBathroomCount({ bathrooms: 4 })).toBe(4);
    expect(zillowBathroomCount({})).toBeNull();
  });

  it("uses that count when mapping a Zillow lookup", () => {
    const mapped = mapZillowPropertyResponse({ propertyDetails: { ...nineThreeOhFour, price: 1599000 } });
    expect(mapped?.bathrooms).toBe(7.5);
  });

  it("reads decimals from Airbnb listing text", () => {
    expect(bathroomCountFromText("Salt Shaker: 7 bedrooms, 7.5 baths, pool")).toBe(7.5);
    expect(bathroomCountFromText("3 bedroom 2 bathroom cabin")).toBe(2);
    expect(bathroomCountFromText("no count here")).toBeNull();
  });
});

describe("half baths can be entered", () => {
  const propertiesRouter = read("server/routers/properties.ts");
  const dialog = read("client/src/components/EditPropertyFactsDialog.tsx");

  it("lets the server take 7.5 baths but not 7.3", () => {
    const rule = /^\d{1,2}(\.[05])?$/;
    expect(propertiesRouter).toContain('z.string().regex(/^\\d{1,2}(\\.[05])?$/, "Baths must be a whole or half number, like 2 or 2.5")');
    expect(propertiesRouter.match(/baths: bathCount\.optional\(\)\.nullable\(\)/g)?.length).toBe(2);
    expect(["7.5", "8", "2.0"].every(value => rule.test(value))).toBe(true);
    expect(["7.3", "7.", "100"].some(value => rule.test(value))).toBe(false);
  });

  it("keeps the decimal point while typing, and shows 7.5 instead of rounding to 8", () => {
    expect(typedBaths("7.5")).toBe("7.5");
    expect(typedBaths("7.")).toBe("7.");
    expect(typedBaths("7.3")).toBe("7.");
    expect(typedBaths("12a")).toBe("12");
    expect(typedBaths("123")).toBe("12");
    expect(dialog).toContain("baths: bathsText(property.baths),");
    expect(dialog).toContain('inputMode="decimal"');
  });
});
