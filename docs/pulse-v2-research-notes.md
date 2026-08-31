# Pulse V2 research notes

## EOS Level 10 methodology

EOS describes a weekly, fixed-agenda meeting with a typical 90-minute leadership-team format. The seven prescribed stages are: Segue (5 minutes), Scorecard (5), Rock Review (5), Customer/Employee Headlines (5), To-Do List (5), IDS—Identify, Discuss, Solve—(60), and Conclude (5). The methodology calls for the same day, same time, a consistent agenda, and reliable on-time starts and finishes.

The operational rule is to surface an off-track metric, Rock, incomplete To-Do, or concerning headline as an Issue during its review, without discussing it there. Discussion happens in IDS, beginning with the highest-priority issues and producing durable solutions and, when needed, new To-Dos. Conclude confirms commitments, prepares cascaded messages, collects a 1–10 meeting rating, and ends on time. EOS also distinguishes facilitation from agenda/record management: the facilitator drives the pace while a second person may manage the agenda/records.

## Established platform patterns

Ninety supports recurring schedules with a separate facilitator and scribe, prepares team members to update metrics/Rocks/To-Dos/Issues/Headlines before the meeting, runs a timed click-through agenda, and retains post-meeting records. It emphasizes issue prioritization, creation of To-Dos and Issues in context, time tracking, meeting ratings, archived meeting references, recap distribution, notifications, and cascading messages.

## Implications for SavvyOS Pulse V2

* Model an L10 as the recurring definition and a session as one dated occurrence with its own immutable-ish snapshots and report.
* Use the full seven-step L10 runner sequence. Dashboard-level sections may be individually configured, while a disabled section must not render in the dashboard, tab navigation, or runner.
* Provide separate configured roles for facilitator and scribe/records owner. The user specifically asks only for facilitator as a distinct meeting role; session artifact creation should still record actor identity.
* Make between-meeting entry possible, but associate meeting-created updates, work, and metric review with the active/upcoming session when appropriate so the report accurately preserves what came out of a session.
* Put off-track items into IDS as deliberate new issues, prioritise IDS and record resolutions / resulting commitments.
* Make closing a meeting create a durable report with rating, metric/Rock snapshots, commitments, resolved issues, and published cascading messages.

## Sources

1. EOS Worldwide, "What is a Level 10 Meeting?" https://www.eosworldwide.com/level-10-meeting
2. EOS Worldwide, "Level 10 Meeting™" https://www.eosworldwide.com/blog/the-level-10-meeting
3. Ninety, "EOS® Meeting Tool in Ninety" https://www.ninety.io/eos/meetings
4. Ninety Help Center, "Level 10 Meetings, Powered by Ninety" https://help.eos.ninety.io/en/articles/13639370-level-10-meetings-powered-by-ninety
