import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Users,
  Brain,
  CalendarDays,
  ListChecks,
  Shield,
  MapPin,
  FileText,
  Zap,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

// ─── Section navigation ─────────────────────────────────────────────────────
type Section = "definitions" | "howto" | "faq";

export default function CoachingHelpView() {
  const [section, setSection] = useState<Section>("definitions");

  const sections: { id: Section; label: string; icon: any }[] = [
    { id: "definitions", label: "Definitions & Terms", icon: BookOpen },
    { id: "howto", label: "How-To Guides", icon: Lightbulb },
    { id: "faq", label: "FAQ", icon: HelpCircle },
  ];

  return (
    <div className="space-y-5">
      {/* Section toggle */}
      <div className="flex gap-2">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <s.icon className="h-4 w-4" />
            {s.label}
          </button>
        ))}
      </div>

      {section === "definitions" && <DefinitionsSection />}
      {section === "howto" && <HowToSection />}
      {section === "faq" && <FAQSection />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════
function DefinitionsSection() {
  return (
    <div className="space-y-6">
      {/* Performance Statuses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Performance Statuses
          </CardTitle>
          <CardDescription>
            Every agent is assigned a performance status that reflects their current production level relative to company benchmarks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <Badge className="bg-green-600 text-white mt-0.5">Green</Badge>
              <div>
                <p className="font-medium text-sm">On Track / Exceeding</p>
                <p className="text-sm text-muted-foreground">Agent is meeting or exceeding production benchmarks. Coaching focus is on growth, stretch goals, and skill refinement. Typical cadence: monthly check-ins.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
              <Badge className="bg-yellow-600 text-white mt-0.5">Yellow</Badge>
              <div>
                <p className="font-medium text-sm">Needs Attention</p>
                <p className="text-sm text-muted-foreground">Agent is below benchmark but showing effort or has identifiable blockers. Coaching focus is on diagnosis, accountability, and targeted interventions. Typical cadence: bi-weekly sessions.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
              <Badge className="bg-red-600 text-white mt-0.5">Red</Badge>
              <div>
                <p className="font-medium text-sm">Critical / At Risk</p>
                <p className="text-sm text-muted-foreground">Agent is significantly underperforming with no clear improvement trajectory. May require a formal Performance Reset plan. Typical cadence: weekly sessions with documented commitments.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <Badge className="bg-blue-600 text-white mt-0.5">New / Launch</Badge>
              <div>
                <p className="font-medium text-sm">New Agent (First 90 Days)</p>
                <p className="text-sm text-muted-foreground">Agent is within their launch period (typically 90 days). Coaching focus is on onboarding, first-deal milestones, and building foundational habits. Cadence: weekly during ramp-up.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Diagnosis Categories
          </CardTitle>
          <CardDescription>
            The diagnosis is the coach's assessment of the root cause behind an agent's current performance level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { term: "Skill Gap", desc: "Agent lacks specific technical or interpersonal skills needed to perform. Solution: targeted training, role-play, shadowing." },
              { term: "Effort / Activity", desc: "Agent has the skills but isn't putting in sufficient activity volume (calls, showings, follow-ups). Solution: accountability structures, activity tracking." },
              { term: "Market Conditions", desc: "External factors (low inventory, seasonal slowdown) are impacting results despite adequate effort. Solution: pivot strategy, expand territory." },
              { term: "Mindset / Confidence", desc: "Agent is capable but held back by limiting beliefs, fear of rejection, or burnout. Solution: mindset coaching, wins celebration, workload adjustment." },
              { term: "Systems / Process", desc: "Agent struggles with CRM usage, lead management, or workflow organization. Solution: systems training, process simplification." },
              { term: "Lead Quality", desc: "Agent's lead sources are producing low-conversion prospects. Solution: lead source audit, new channel development." },
              { term: "Time Management", desc: "Agent has activity but it's unfocused or poorly prioritized. Solution: time-blocking, priority frameworks." },
              { term: "Personal / External", desc: "Life circumstances are temporarily impacting performance. Solution: empathy, adjusted expectations, support resources." },
            ].map((item) => (
              <div key={item.term} className="p-3 rounded-lg border">
                <p className="font-medium text-sm">{item.term}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Retention Risk Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Retention Risk Levels
          </CardTitle>
          <CardDescription>
            Retention risk indicates the likelihood an agent may leave the brokerage. This is a subjective coach assessment informed by engagement signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { level: "Low", color: "bg-green-100 text-green-800", desc: "Agent is engaged, satisfied, and showing no signs of departure. No action needed beyond standard coaching." },
              { level: "Medium", color: "bg-yellow-100 text-yellow-800", desc: "Some warning signs present — decreased engagement, mentions of frustration, or exploring options. Proactive retention conversation recommended." },
              { level: "High", color: "bg-orange-100 text-orange-800", desc: "Strong indicators of potential departure — actively interviewing, expressing dissatisfaction, or disengaging from team activities. Immediate intervention required." },
              { level: "Critical", color: "bg-red-100 text-red-800", desc: "Agent has expressed intent to leave or has received an offer elsewhere. Escalation to leadership required immediately." },
            ].map((item) => (
              <div key={item.level} className="flex items-start gap-3 p-3 rounded-lg border">
                <Badge className={`${item.color} mt-0.5`}>{item.level}</Badge>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Session Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Session Types
          </CardTitle>
          <CardDescription>
            Different session types serve different purposes in the coaching workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { type: "Standard COACH Session", desc: "Regular 1:1 coaching session following the COACH framework (Connect, Observe, Assess, Commit, Hold Accountable). The primary session type for ongoing development." },
              { type: "Performance Review", desc: "Formal review of production metrics, goal progress, and overall trajectory. Typically quarterly or when performance status changes." },
              { type: "Goal Setting", desc: "Dedicated session for establishing or revising annual/quarterly goals. Includes market analysis and capacity planning." },
              { type: "Pipeline Review", desc: "Deep dive into the agent's active pipeline — lead quality, conversion rates, stuck deals, and next actions for each opportunity." },
              { type: "Skill Development", desc: "Focused training session on a specific skill (negotiation, prospecting, presentation, objection handling, etc.)." },
              { type: "Performance Reset Kickoff", desc: "Formal initiation of a 30-day Performance Reset plan. Documents expectations, requirements, and consequences." },
              { type: "Reset Checkpoint", desc: "Scheduled check-in during an active Performance Reset to evaluate progress against requirements." },
              { type: "Retention Conversation", desc: "Proactive discussion about agent satisfaction, career goals, and any concerns that might lead to departure." },
              { type: "Emergency / Ad-Hoc", desc: "Unscheduled session for urgent situations — deal emergencies, client escalations, or personal crises affecting work." },
              { type: "Onboarding Check-in", desc: "Regular check-in during the agent's first 90 days focused on launch milestones and integration into the team." },
            ].map((item) => (
              <div key={item.type} className="p-3 rounded-lg border">
                <p className="font-medium text-sm">{item.type}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Commitment Statuses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Commitment Statuses
          </CardTitle>
          <CardDescription>
            Commitments are specific, time-bound action items that come out of coaching sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { status: "Active", color: "bg-blue-100 text-blue-800", desc: "Commitment is current and the agent is expected to be working on it." },
              { status: "Completed", color: "bg-green-100 text-green-800", desc: "Agent has fulfilled the commitment and it has been verified by the coach." },
              { status: "Overdue", color: "bg-red-100 text-red-800", desc: "The due date has passed without completion. Requires follow-up in next session." },
              { status: "Canceled", color: "bg-gray-100 text-gray-800", desc: "Commitment was removed — either no longer relevant or replaced by a different action." },
              { status: "Deferred", color: "bg-yellow-100 text-yellow-800", desc: "Commitment has been intentionally postponed to a later date with coach agreement." },
              { status: "AI Suggested", color: "bg-purple-100 text-purple-800", desc: "Commitment was auto-extracted by AI from session notes. Needs coach review and approval before becoming Active." },
            ].map((item) => (
              <div key={item.status} className="flex items-start gap-3 p-3 rounded-lg border">
                <Badge className={`${item.color} mt-0.5 text-xs`}>{item.status}</Badge>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Coaching Priority Levels
          </CardTitle>
          <CardDescription>
            Priority determines how much coaching attention an agent should receive relative to others in the portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { level: "High", desc: "Agent needs intensive coaching attention. Typically Red-status agents, those on Performance Resets, or new agents in critical launch phases. Expect weekly touchpoints." },
              { level: "Medium", desc: "Agent needs regular coaching. Typically Yellow-status agents or those with specific development goals. Expect bi-weekly sessions." },
              { level: "Low", desc: "Agent is self-sufficient and performing well. Coaching is maintenance-focused. Expect monthly check-ins or as-needed." },
              { level: "Watch", desc: "Agent doesn't need active coaching but should be monitored for changes. Useful for agents who recently moved from Yellow to Green." },
            ].map((item) => (
              <div key={item.level} className="p-3 rounded-lg border">
                <p className="font-medium text-sm">{item.level}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance Reset */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Performance Reset Plans
          </CardTitle>
          <CardDescription>
            A formal 30-day improvement plan for agents who are critically underperforming.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A Performance Reset is the last structured intervention before a coach-out recommendation. It includes:
          </p>
          <div className="grid gap-2">
            {[
              "Clear, measurable requirements the agent must meet within 30 days",
              "Weekly checkpoint meetings to evaluate progress",
              "Documented evidence of coaching support provided",
              "Explicit consequences if requirements are not met",
              "Agent acknowledgment of the plan and expectations",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Important</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Performance Resets should only be initiated after documented coaching efforts have failed to produce improvement. They are not punitive — they are a final structured support mechanism.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Escalation Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Escalation Types
          </CardTitle>
          <CardDescription>
            When a situation exceeds what a coach can handle alone, it should be escalated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { type: "Capacity", desc: "Coach has too many high-priority agents and cannot provide adequate attention to all." },
              { type: "Performance", desc: "Agent's performance issues require leadership involvement beyond coaching." },
              { type: "Behavioral", desc: "Agent conduct issues (compliance, professionalism, team dynamics) that need HR/leadership." },
              { type: "Retention", desc: "High-value agent at risk of leaving — needs leadership retention intervention." },
              { type: "Conflict", desc: "Interpersonal conflicts between agents or between agent and coach that need mediation." },
              { type: "Resource", desc: "Agent needs resources (marketing budget, tools, territory changes) that coach cannot authorize." },
            ].map((item) => (
              <div key={item.type} className="p-3 rounded-lg border">
                <p className="font-medium text-sm">{item.type}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOW-TO GUIDES
// ═══════════════════════════════════════════════════════════════════════════════
function HowToSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Coach How-To Guides</CardTitle>
          <CardDescription>
            Step-by-step walkthroughs for common coaching workflows in SavvyOS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {/* Guide 1: Running a Coaching Session */}
            <AccordionItem value="run-session">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  How to Run a Coaching Session (End-to-End)
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  {[
                    { step: "1. Create the Session", desc: "Navigate to the agent's profile → click 'New Session' → select session type, date/time, and duration → click 'Create Session'." },
                    { step: "2. Prepare (Before the Meeting)", desc: "Open the Session Workspace → click 'Generate Brief' to get an AI-powered pre-session summary. This pulls the agent's recent production, pipeline, commitments, and history into a coaching preparation document." },
                    { step: "3. Start the Session", desc: "When the meeting begins, click 'Start Session' to move into the Conduct phase. The timer begins tracking duration." },
                    { step: "4. Take Notes During the Session", desc: "Use the 'Source Notes' field to capture raw notes during the conversation. These are your unfiltered observations and the agent's statements." },
                    { step: "5. Complete the Session", desc: "When the meeting ends, click 'Complete Session'. This locks the duration and moves to AI Processing." },
                    { step: "6. Generate AI Summary", desc: "Click 'Generate Summary' to have AI analyze your notes and produce a structured summary with diagnosis, key themes, and extracted commitments." },
                    { step: "7. Review & Approve", desc: "Review the AI-generated summary and commitments. Edit anything that needs correction. Approve the summary to finalize it." },
                    { step: "8. Confirm Commitments", desc: "Review the AI-extracted commitments. Approve, edit, or remove them. Set due dates for each. These become trackable action items." },
                    { step: "9. Schedule Next Session", desc: "Set the date for the next coaching touchpoint based on the agent's priority and status." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 2: Using the Command Center */}
            <AccordionItem value="command-center">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  How to Use the Command Center
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">The Command Center is your daily operational dashboard. Here's how to use it effectively:</p>
                <div className="space-y-2">
                  {[
                    { step: "Check Metrics First", desc: "The top grid shows 18 portfolio-level metrics. Red numbers indicate areas needing attention. Focus on 'Overdue Commitments', 'No Session in 14 Days', and 'Active Resets' first." },
                    { step: "Generate the AI Brief", desc: "Click 'Generate Brief' for an AI-written summary of your portfolio's current state, top priorities, and recommended actions for today." },
                    { step: "Work the Action Queues", desc: "Scroll to the Action Queues section. These are pre-filtered lists of agents who need specific attention (overdue commitments, missing sessions, at-risk new agents, etc.). Work through them top to bottom." },
                    { step: "Review Upcoming Sessions", desc: "Check the upcoming sessions table to prepare for your day. Click any session to open its workspace and generate a pre-session brief." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 3: Creating a Performance Reset */}
            <AccordionItem value="perf-reset">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  How to Create a Performance Reset Plan
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Performance Resets are formal 30-day improvement plans. Only use when standard coaching has not produced results.</p>
                <div className="space-y-2">
                  {[
                    { step: "1. Document Prior Coaching", desc: "Before initiating a reset, ensure you have documented evidence of prior coaching efforts (session history, commitments given, support provided)." },
                    { step: "2. Navigate to Agent's Profile", desc: "Go to the agent's coaching page → click the 'Perf. Reset' tab." },
                    { step: "3. Create New Reset", desc: "Click 'New Performance Reset' → set the reason, start date, and end date (typically 30 days)." },
                    { step: "4. Add Requirements", desc: "Add specific, measurable requirements the agent must meet. Examples: 'Close 2 transactions', 'Make 50 prospecting calls per week', 'Attend all team meetings'." },
                    { step: "5. Add Checkpoints", desc: "Schedule weekly checkpoint meetings (typically 4 over the 30-day period). These are mandatory check-ins to evaluate progress." },
                    { step: "6. Communicate to Agent", desc: "Hold a formal session (use 'Performance Reset Kickoff' session type) to walk the agent through the plan, expectations, and consequences." },
                    { step: "7. Track Progress", desc: "At each checkpoint, update requirement statuses and add notes. The system tracks completion percentage automatically." },
                    { step: "8. Resolve the Reset", desc: "At the end of 30 days, mark the reset as 'Completed' (requirements met) or 'Failed' (requirements not met, escalate to coach-out recommendation)." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 4: Managing Commitments */}
            <AccordionItem value="commitments">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  How to Manage Commitments Effectively
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Commitments are the accountability backbone of coaching. Here's how to use them well:</p>
                <div className="space-y-2">
                  {[
                    { step: "Keep Commitments Specific", desc: "Bad: 'Prospect more'. Good: 'Make 10 prospecting calls per day, Monday through Friday, for the next 2 weeks'. Specificity enables accountability." },
                    { step: "Set Realistic Due Dates", desc: "Commitments should be achievable within the timeframe. If an agent has 5 active commitments, don't add 5 more. Focus on 2-3 high-impact items." },
                    { step: "Review at Every Session", desc: "Start each coaching session by reviewing outstanding commitments. Mark completed ones, discuss blockers on overdue ones, and adjust if needed." },
                    { step: "Use AI Suggestions Wisely", desc: "After AI processes session notes, it extracts suggested commitments. Review these carefully — approve good ones, edit vague ones, and delete irrelevant ones." },
                    { step: "Track Completion Rate", desc: "The Commitments tab shows completion rates. If an agent consistently misses commitments, that's a coaching signal — either commitments are too ambitious or there's an accountability issue." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 5: Using AI Features */}
            <AccordionItem value="ai-features">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  How to Use AI Coaching Features
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">SavvyOS uses AI to augment (not replace) your coaching judgment. Here's what's available:</p>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border">
                    <p className="font-medium">Pre-Session Brief</p>
                    <p className="text-xs text-muted-foreground mt-1">Generated before a session, this pulls the agent's recent data (production, pipeline, commitments, history) into a coaching preparation document. It highlights what's changed since last session and suggests talking points.</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="font-medium">Session Summary</p>
                    <p className="text-xs text-muted-foreground mt-1">After you complete a session and write notes, AI generates a structured summary including: key themes discussed, diagnosis assessment, recommended next steps, and extracted commitments.</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="font-medium">Commitment Extraction</p>
                    <p className="text-xs text-muted-foreground mt-1">AI reads your session notes and identifies specific action items the agent committed to. These are suggested with a confidence score — you approve, edit, or reject each one.</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="font-medium">Agent Intelligence (AI Insights Tab)</p>
                    <p className="text-xs text-muted-foreground mt-1">On each agent's profile, the AI Insights tab provides a holistic analysis combining production data, pipeline health, goal progress, coaching history, and commitment patterns into actionable recommendations.</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="font-medium">Command Center Brief</p>
                    <p className="text-xs text-muted-foreground mt-1">A portfolio-level AI summary that tells you what to focus on today across all your agents. Identifies the highest-priority actions and patterns across your coaching portfolio.</p>
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Remember</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    AI is a tool, not a replacement for coaching judgment. Always review AI outputs before acting on them. The AI doesn't know context that wasn't captured in notes — your human insight is irreplaceable.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 6: Escalations */}
            <AccordionItem value="escalations">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  How to Create and Manage Escalations
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Escalations bring leadership attention to situations that exceed coaching scope.</p>
                <div className="space-y-2">
                  {[
                    { step: "1. Identify the Need", desc: "Escalate when: you've exhausted coaching options, the situation requires authority you don't have, there's a compliance/legal concern, or an agent is at critical retention risk." },
                    { step: "2. Create the Escalation", desc: "Go to the Escalations tab → click 'New Escalation' → select the agent, category, urgency level, and provide detailed evidence/context." },
                    { step: "3. Include Evidence", desc: "Document what you've already tried, specific data points, and why this needs leadership involvement. The more context, the faster resolution." },
                    { step: "4. Set Urgency Appropriately", desc: "Low = within a week. Medium = within 2-3 days. High = within 24 hours. Critical = immediate attention needed." },
                    { step: "5. Track Resolution", desc: "Leadership will update the escalation with their response. You'll see status changes and can add follow-up notes." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 7: Market Coverage */}
            <AccordionItem value="market-coverage">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  How to Use Market Coverage Data
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Market Coverage shows how well each geographic market is served by assigned agents.</p>
                <div className="space-y-2">
                  {[
                    { step: "Review Market Health", desc: "Each market shows its status (Healthy, Needs Attention, Understaffed, Overstaffed). Focus coaching resources on markets that are underperforming." },
                    { step: "Check Agent Distribution", desc: "Click into a market to see which agents are assigned and their individual production within that market." },
                    { step: "Identify Coaching Opportunities", desc: "If a market is underperforming, look at the agents assigned — are they new (need onboarding support), struggling (need skill coaching), or overwhelmed (need workload adjustment)?" },
                    { step: "Inform Goal Setting", desc: "Use market data when setting agent goals. An agent in a high-demand market should have different expectations than one in a slower market." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{item.step}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Guide 8: Reports */}
            <AccordionItem value="reports">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  How to Use Reports for Coaching Decisions
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Reports provide data-driven insights to improve your coaching effectiveness.</p>
                <div className="space-y-3">
                  {[
                    { report: "Executive Scorecard", use: "Share with leadership to demonstrate coaching program health and ROI. Shows portfolio-wide metrics at a glance." },
                    { report: "Coach Portfolio", use: "Compare your portfolio's performance against other coaches. Identify if certain agent segments need different approaches." },
                    { report: "New-Agent Cohort", use: "Track how new agents are progressing through their launch period. Identify who's ahead/behind on milestones." },
                    { report: "Coaching Effectiveness", use: "Measure whether your coaching is producing results — session frequency vs. production improvement correlation." },
                    { report: "Performance Movement", use: "See which agents moved between status levels (Green→Yellow, Yellow→Red, etc.) and what coaching interventions preceded the change." },
                    { report: "Market Coverage", use: "Identify geographic gaps and opportunities for agent placement or territory adjustments." },
                    { report: "Commitment Report", use: "Track commitment completion rates across your portfolio. Low rates may indicate commitments are too ambitious or accountability is lacking." },
                    { report: "Capacity Report", use: "Understand your coaching workload — how many high-priority agents you have vs. capacity. Use to justify escalations or portfolio rebalancing." },
                  ].map((item) => (
                    <div key={item.report} className="p-3 rounded-lg border">
                      <p className="font-medium">{item.report}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.use}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════════════════
function FAQSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>
            Common questions about using the Coaching Hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger className="text-sm">How often should I coach each agent?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                It depends on their performance status and priority. As a general guide: <strong>Red/High Priority</strong> agents need weekly sessions. <strong>Yellow/Medium Priority</strong> agents need bi-weekly sessions. <strong>Green/Low Priority</strong> agents need monthly check-ins. <strong>New/Launch</strong> agents need weekly sessions during their first 90 days. The system will flag agents who haven't been coached within their expected cadence in the Action Queues.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q2">
              <AccordionTrigger className="text-sm">What's the difference between a commitment and a task?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <strong>Commitments</strong> are coaching-specific action items that come out of coaching sessions. They represent what the agent agreed to do as part of their development. <strong>Tasks</strong> (in the Tasks module) are operational to-dos that may or may not be coaching-related. Commitments are tracked within the Coaching Hub and reviewed at each session. Tasks are tracked in the general task management system.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q3">
              <AccordionTrigger className="text-sm">When should I initiate a Performance Reset vs. continue coaching?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Continue coaching when: the agent is showing effort, has identifiable blockers you can help with, or has been in their current status for less than 60 days. Initiate a Performance Reset when: the agent has been Red for 60+ days despite documented coaching, shows no improvement trajectory, is not following through on commitments, or leadership has requested formal documentation. A reset is not a punishment — it's a structured last-chance support mechanism.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q4">
              <AccordionTrigger className="text-sm">How does the AI generate session summaries?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The AI reads your source notes from the session and combines them with the agent's current data (production, pipeline, goals, history). It then produces a structured summary that includes: key themes discussed, performance diagnosis, recommended next steps, and extracted commitments. The AI uses the COACH framework to structure its analysis. You should always review and edit the AI output — it's a starting point, not a final product.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q5">
              <AccordionTrigger className="text-sm">Can agents see their coaching profiles?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                No. The Coaching Hub is an admin-only tool. Agents cannot see their performance status, diagnosis, retention risk, or internal coaching notes. The only coaching-related content agents may see is their commitments (if you choose to share them) and any goals set collaboratively. Keep sensitive assessments (especially retention risk and coach-out considerations) strictly internal.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q6">
              <AccordionTrigger className="text-sm">What should I do if I disagree with the AI's diagnosis?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Trust your judgment. The AI provides a data-informed suggestion, but you know the agent personally. If the AI suggests "Skill Gap" but you know it's actually a confidence issue, override it. The AI doesn't have access to interpersonal dynamics, body language, or context from conversations that weren't documented. Always edit AI outputs to reflect your professional assessment.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q7">
              <AccordionTrigger className="text-sm">How do I handle an agent who refuses to engage with coaching?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Document everything. Note missed sessions, unfulfilled commitments, and lack of engagement in your session notes. After 2-3 documented attempts, have a direct conversation about expectations. If disengagement continues, escalate to leadership with your documentation. This may lead to a Performance Reset or, ultimately, a coach-out recommendation. The key is having a clear paper trail showing you provided support that was declined.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q8">
              <AccordionTrigger className="text-sm">How many agents should a coach manage?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                It depends on the mix of priorities. A general guideline: a coach can effectively manage 15-20 agents if most are Green/Low Priority. If you have more than 5 Red/High Priority agents simultaneously, you're likely at capacity and should escalate for portfolio rebalancing. Use the Capacity Report to make data-driven arguments about workload. Quality coaching for fewer agents beats superficial check-ins with many.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q9">
              <AccordionTrigger className="text-sm">What's the "Launch Phase" and how does it work?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The Launch Phase is the first 90 days after an agent joins Savvy. During this period, agents have different expectations and coaching needs. The system tracks their launch progress through phases: <strong>Onboarding</strong> (Week 1-2: systems setup, training), <strong>Ramp</strong> (Week 3-8: first activities, first leads), <strong>Producing</strong> (Week 9-12: first deals expected). Agents in launch phase appear with a blue "New" badge and have their own section in the Command Center action queues.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q10">
              <AccordionTrigger className="text-sm">How do I export data for leadership meetings?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Use the Reports tab for pre-built report formats. The Executive Scorecard is designed specifically for leadership presentations. For custom data, the Commitments view and Agent Portfolio both have CSV export capabilities. You can also screenshot specific sections of the Command Center for quick updates. For formal reviews, the Performance Movement report shows status changes over time with context.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q11">
              <AccordionTrigger className="text-sm">What happens to coaching data if a coach is reassigned?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                All coaching history stays with the agent, not the coach. When you reassign an agent to a new coach (via Edit Profile → Coach of Record), the new coach inherits the full history: all past sessions, commitments, assessments, and notes. This ensures continuity of care. The previous coach's sessions remain attributed to them in the history for accountability tracking.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q12">
              <AccordionTrigger className="text-sm">How do I use the Pre-Session Brief effectively?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Generate the brief 15-30 minutes before your session. Read it to refresh your memory on: what you discussed last time, what commitments were made, what's changed in their production/pipeline since then, and what the AI recommends discussing. Don't read the brief verbatim to the agent — use it as your private preparation. The best coaches walk into sessions already knowing the data so they can focus on the human conversation.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
