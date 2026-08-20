import { getSectionData as segue } from "./segue";
import { getSectionData as headlines } from "./headlines";
import { getSectionData as scorecard } from "./scorecard";
import { getSectionData as goals } from "./goals";
import { getSectionData as rocks } from "./rocks";
import { getSectionData as todos } from "./todos";
import { getSectionData as issues } from "./issues";
import { getSectionData as cascading } from "./cascading";
import { getSectionData as conclude } from "./conclude";
import { visibleSectionContext, type SectionKey } from "./shared";

const sections: Record<SectionKey, (ctx: any) => Promise<any>> = { segue, headlines, scorecard, goals, rocks, todos, issues, cascading, conclude };
export const PULSE_SECTION_FUNCTIONS = Object.fromEntries(Object.keys(sections).map((key) => [key, `pulse/sections/${key}.ts#getSectionData`]));

/** The only meeting-section read path. Dashboard and runner route procedures both call this. */
export async function getMeetingSectionPayloads(db: any, viewerId: number, meetingId: string) {
  const ctx = await visibleSectionContext(db, viewerId, meetingId);
  const order = ctx.meeting.sectionOrder as SectionKey[];
  const payloads = [];
  for (const section of order) payloads.push(await sections[section](ctx));
  return { meeting: ctx.meeting, sections: payloads };
}
