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
  GraduationCap,
  Compass,
  Heart,
  RotateCcw,
  Star,
} from "lucide-react";

// ─── Section navigation ─────────────────────────────────────────────────────
type Section = "onboarding" | "frameworks" | "definitions" | "howto" | "sessions" | "faq";

export default function CoachingHelpView() {
  const [section, setSection] = useState<Section>("onboarding");

  const sections: { id: Section; label: string; icon: any }[] = [
    { id: "onboarding", label: "New Coach Guide", icon: GraduationCap },
    { id: "frameworks", label: "Frameworks", icon: Compass },
    { id: "definitions", label: "Definitions", icon: BookOpen },
    { id: "sessions", label: "Session Templates", icon: CalendarDays },
    { id: "howto", label: "How-To Guides", icon: Lightbulb },
    { id: "faq", label: "FAQ", icon: HelpCircle },
  ];

  return (
    <div className="space-y-5">
      {/* Section toggle */}
      <div className="flex flex-wrap gap-2">
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

      {section === "onboarding" && <OnboardingSection />}
      {section === "frameworks" && <FrameworksSection />}
      {section === "definitions" && <DefinitionsSection />}
      {section === "sessions" && <SessionTemplatesSection />}
      {section === "howto" && <HowToSection />}
      {section === "faq" && <FAQSection />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW COACH ONBOARDING GUIDE
// ═══════════════════════════════════════════════════════════════════════════════
function OnboardingSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Welcome to the Savvy Coaching Hub
          </CardTitle>
          <CardDescription>
            Everything you need to know to start coaching effectively from Day 1. This guide is your training manual — read it thoroughly before your first coaching session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mission */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <h3 className="font-semibold text-sm mb-2">Your Mission as a Savvy Coach</h3>
            <p className="text-sm text-muted-foreground">
              Your role is to help every agent in your portfolio reach their full production potential while maintaining high retention. You are not a manager — you are a performance partner. You diagnose what's holding agents back, prescribe targeted interventions, hold them accountable to commitments, and celebrate their wins. The Coaching Hub gives you the data, AI tools, and workflows to do this systematically.
            </p>
          </div>

          {/* Week 1 Checklist */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Your First Week Checklist
            </h3>
            <div className="space-y-2">
              {[
                { task: "Read all sections of this Help page", desc: "Understand the COACH framework, Four-C Diagnosis, RESET process, and all session templates before meeting any agents." },
                { task: "Review your Agent Portfolio", desc: "Go to the Portfolio tab. Learn each agent's name, performance status, market, and current diagnosis. Sort by status to see who needs attention first." },
                { task: "Check the Command Center daily", desc: "This is your operational dashboard. It shows overdue commitments, agents needing sessions, retention alerts, and AI-generated priorities." },
                { task: "Review each agent's AI Insights", desc: "On each agent's profile, click the AI Insights tab. This gives you a comprehensive analysis of their situation without needing to read months of history." },
                { task: "Schedule your first sessions", desc: "Start with Red-status agents (weekly cadence), then Yellow (bi-weekly), then Green (monthly). Use the 'Standard COACH Session' type for initial meetings." },
                { task: "Upload any existing assessments", desc: "If agents have DISC, Kolbe, or other personality assessments, upload them in the Assessments tab. AI will analyze them and synthesize insights into the agent profile." },
                { task: "Set up your coaching cadence", desc: "Block recurring time on your calendar for each agent based on their priority level. The system will alert you if anyone falls behind cadence." },
              ].map((item) => (
                <div key={item.task} className="flex items-start gap-2 p-3 rounded-lg border">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{item.task}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Core Principles */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              Core Coaching Principles at Savvy
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { principle: "Data-Informed, Not Data-Driven", desc: "Use production data, pipeline metrics, and AI insights to inform your coaching — but always layer in your human judgment. Numbers tell you what; your conversations tell you why." },
                { principle: "Diagnose Before Prescribing", desc: "Never jump to solutions. Use the Four-C framework to identify the root cause first. A skill gap needs training; an effort gap needs accountability. Wrong diagnosis = wrong intervention." },
                { principle: "Commitments Over Advice", desc: "Every session should end with specific, measurable commitments. Advice without accountability is just conversation. Track completion rates — they're your coaching effectiveness metric." },
                { principle: "Document Everything", desc: "If it's not in the system, it didn't happen. Session notes, commitments, observations — all of it goes in SavvyOS. This protects you, the agent, and the company." },
                { principle: "Celebrate Wins Loudly", desc: "Recognition is retention. When an agent hits a milestone, close a deal, or complete commitments — acknowledge it in session and in the system. Positive reinforcement drives behavior." },
                { principle: "Escalate Early, Not Late", desc: "If a situation exceeds your coaching scope (retention risk, behavioral issues, resource needs), escalate immediately. Waiting makes problems worse. Use the Escalations feature." },
              ].map((item) => (
                <div key={item.principle} className="p-3 rounded-lg border">
                  <p className="font-medium text-sm">{item.principle}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Workflow */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Your Daily Coaching Workflow
            </h3>
            <div className="space-y-2">
              {[
                { time: "Morning (5 min)", action: "Check Command Center", desc: "Review metrics, action queues, and today's scheduled sessions. Note any overnight changes." },
                { time: "Before Each Session (10 min)", action: "Generate Pre-Session Brief", desc: "Click 'Generate Brief' on the session workspace. Read the AI summary of what's changed since last session, outstanding commitments, and suggested talking points." },
                { time: "During Session (30-60 min)", action: "Follow COACH Framework", desc: "Connect → Observe → Assess → Commit → Hold Accountable. Take raw notes in the Source Notes field." },
                { time: "After Session (5 min)", action: "Generate AI Summary", desc: "Click 'Generate Summary' to process your notes. Review the AI output, approve commitments, and schedule the next session." },
                { time: "End of Day (5 min)", action: "Review Tomorrow's Schedule", desc: "Check what's coming tomorrow. Flag any agents who need extra preparation or research." },
              ].map((item) => (
                <div key={item.time} className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="min-w-[100px]">
                    <Badge variant="outline" className="text-[10px]">{item.time}</Badge>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{item.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAMEWORKS (COACH, Four-C, RESET)
// ═══════════════════════════════════════════════════════════════════════════════
function FrameworksSection() {
  return (
    <div className="space-y-6">
      {/* COACH Framework */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            The COACH Framework
          </CardTitle>
          <CardDescription>
            The COACH framework is the structured methodology used for every standard coaching session at Savvy. Each letter represents a phase of the session. Master this framework and you'll run effective, consistent coaching sessions every time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="p-4 rounded-lg border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-blue-600 text-white text-xs">C</Badge>
                <h4 className="font-semibold text-sm">Connect (5-10 minutes)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Build rapport and understand the agent's current emotional state. This is not small talk — it's intentional relationship-building that creates psychological safety.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>What to do:</strong> Ask how they're doing personally and professionally. Listen for energy level, stress indicators, and mindset shifts since last session.</p>
                <p><strong>Key questions:</strong> "What's been your biggest win since we last talked?" / "What's weighing on you right now?" / "On a scale of 1-10, how energized are you about your business this week?"</p>
                <p><strong>Why it matters:</strong> An agent who's stressed about a personal issue won't absorb coaching on prospecting tactics. Connect first to know where they actually are.</p>
              </div>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-emerald-600 text-white text-xs">O</Badge>
                <h4 className="font-semibold text-sm">Observe (10-15 minutes)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Review data, metrics, and commitments from the previous session. This is where you hold up the mirror — showing the agent what the numbers say about their activity and results.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>What to do:</strong> Review production stats (YTD units, T90 GCI, pipeline), commitment completion from last session, lead activity, and any notable changes.</p>
                <p><strong>Key questions:</strong> "Your T90 units dropped from 4 to 2 — what happened?" / "You completed 3 of 5 commitments — let's talk about the 2 that didn't happen." / "Your pipeline has 8 stale leads over 30 days — what's the plan?"</p>
                <p><strong>Why it matters:</strong> Data removes subjectivity. Agents can't argue with numbers. This phase grounds the conversation in reality, not feelings.</p>
              </div>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-amber-600 text-white text-xs">A</Badge>
                <h4 className="font-semibold text-sm">Assess (10-15 minutes)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Diagnose the root cause of current performance using the Four-C framework (Commitment, Capability, Cadence, Capacity). This is the most critical coaching skill — accurate diagnosis leads to effective intervention.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>What to do:</strong> Based on the data observed and the agent's explanations, determine which of the Four C's is the primary blocker. Ask probing questions to confirm your hypothesis.</p>
                <p><strong>Key questions:</strong> "Do you know what to do but aren't doing it? (Commitment)" / "Are you doing the activities but not getting results? (Capability)" / "Are you inconsistent in your daily actions? (Cadence)" / "Are external factors limiting you? (Capacity)"</p>
                <p><strong>Why it matters:</strong> Wrong diagnosis = wrong prescription. If an agent lacks skill (Capability) but you push harder activity (Cadence), you'll frustrate them and waste time.</p>
              </div>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-violet-600 text-white text-xs">C</Badge>
                <h4 className="font-semibold text-sm">Commit (5-10 minutes)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Establish specific, measurable, time-bound commitments that address the diagnosed root cause. The agent must own these — they're not assignments from you, they're agreements.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>What to do:</strong> Collaboratively define 2-3 commitments that directly address the diagnosis. Each must have: a specific action, a measurable outcome, and a deadline.</p>
                <p><strong>Good commitment example:</strong> "I will make 10 prospecting calls per day, Monday-Friday, for the next 2 weeks, and log each call in SavvyOS by end of day."</p>
                <p><strong>Bad commitment example:</strong> "I'll try to prospect more." (Not specific, not measurable, no deadline)</p>
                <p><strong>Why it matters:</strong> Commitments are the bridge between insight and action. Without them, coaching is just conversation.</p>
              </div>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-rose-600 text-white text-xs">H</Badge>
                <h4 className="font-semibold text-sm">Hold Accountable (5 minutes)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Confirm the accountability structure — how and when you'll follow up, what happens if commitments aren't met, and when the next session is scheduled.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>What to do:</strong> Recap all commitments verbally. Confirm the agent understands and agrees. Set the next session date. Establish any mid-session check-in points if needed.</p>
                <p><strong>Key statements:</strong> "Let me recap what you've committed to..." / "I'll check in on [date] to see how the first week went." / "Our next full session is [date]. I expect to see [specific result] by then."</p>
                <p><strong>Why it matters:</strong> Accountability without follow-through is meaningless. This phase sets the expectation that commitments will be reviewed — creating healthy pressure to perform.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm font-medium">Session Duration Guide</p>
            <p className="text-xs text-muted-foreground mt-1">
              A standard COACH session takes 30-60 minutes depending on complexity. New agents and Red-status agents typically need the full 60 minutes. Green-status agents can often be covered in 30 minutes. The framework is flexible — spend more time on the phase that needs it most for each agent.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Four-C Diagnosis Framework */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            The Four-C Diagnosis Framework
          </CardTitle>
          <CardDescription>
            The Four-C framework is how you diagnose the root cause of an agent's performance. Every underperformance issue falls into one (or sometimes two) of these categories. Accurate diagnosis is the foundation of effective coaching — it determines what intervention you prescribe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-red-600 text-white">Commitment</Badge>
                <span className="text-xs text-muted-foreground italic">"They won't"</span>
              </div>
              <p className="text-sm font-medium mb-1">The agent's dedication, follow-through, and consistency of effort</p>
              <p className="text-sm text-muted-foreground mb-3">
                A Commitment issue means the agent has the skills and the time, but isn't putting in the work. This could be motivation, mindset, priorities, or engagement with the business.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Symptoms:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Missed commitments repeatedly</li>
                    <li>Low activity despite having time</li>
                    <li>Excuses that shift blame externally</li>
                    <li>Disengagement from team activities</li>
                    <li>Knows what to do but doesn't do it</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Interventions:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Accountability structures (daily check-ins)</li>
                    <li>Motivational exploration (what drives them?)</li>
                    <li>Consequence conversations (what's at stake?)</li>
                    <li>Goal reconnection (why did they start?)</li>
                    <li>Environment changes (accountability partner)</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-muted/50 text-xs">
                <strong>Diagnostic question:</strong> "If I gave you a perfect script and a list of 50 leads right now, would you actually call them today? Why or why not?"
              </div>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-amber-600 text-white">Capability</Badge>
                <span className="text-xs text-muted-foreground italic">"They can't (yet)"</span>
              </div>
              <p className="text-sm font-medium mb-1">The agent's skills, knowledge, and ability to execute</p>
              <p className="text-sm text-muted-foreground mb-3">
                A Capability issue means the agent is willing and putting in effort, but lacks the skills or knowledge to convert that effort into results. They need training, not motivation.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Symptoms:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>High activity but low conversion</li>
                    <li>Consistent effort without results</li>
                    <li>Struggles with specific skills (negotiation, presenting)</li>
                    <li>Asks "how do I...?" frequently</li>
                    <li>Loses deals at the same stage repeatedly</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Interventions:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Targeted skill training</li>
                    <li>Role-play and practice sessions</li>
                    <li>Shadowing top performers</li>
                    <li>Script development and rehearsal</li>
                    <li>Mentorship pairing</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-muted/50 text-xs">
                <strong>Diagnostic question:</strong> "Walk me through exactly what you say when a lead pushes back on price. What's your word-for-word response?"
              </div>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-blue-600 text-white">Cadence</Badge>
                <span className="text-xs text-muted-foreground italic">"They're inconsistent"</span>
              </div>
              <p className="text-sm font-medium mb-1">The agent's consistency, habits, and activity rhythms</p>
              <p className="text-sm text-muted-foreground mb-3">
                A Cadence issue means the agent has the skills and the motivation, but their activity is inconsistent. They have great weeks and terrible weeks. They lack the daily discipline and systems to maintain steady output.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Symptoms:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Feast-or-famine production pattern</li>
                    <li>Great weeks followed by dead weeks</li>
                    <li>No consistent daily routine</li>
                    <li>Reactive instead of proactive</li>
                    <li>Pipeline gaps from inconsistent prospecting</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Interventions:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Time-blocking implementation</li>
                    <li>Daily minimum activity standards</li>
                    <li>Habit stacking and routine design</li>
                    <li>Weekly planning sessions</li>
                    <li>Activity tracking and reporting</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-muted/50 text-xs">
                <strong>Diagnostic question:</strong> "Describe your typical Tuesday. What time do you start? What do you do first? When do you prospect? How many calls did you make each day last week?"
              </div>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-purple-600 text-white">Capacity</Badge>
                <span className="text-xs text-muted-foreground italic">"They're blocked"</span>
              </div>
              <p className="text-sm font-medium mb-1">External constraints limiting the agent's ability to perform</p>
              <p className="text-sm text-muted-foreground mb-3">
                A Capacity issue means the agent is willing, skilled, and consistent — but external factors are limiting their results. This could be lead volume, market conditions, tools, support systems, or personal circumstances.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Symptoms:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Doing everything right but results lag</li>
                    <li>Market conditions are genuinely difficult</li>
                    <li>Insufficient lead volume from company</li>
                    <li>Personal life circumstances (health, family)</li>
                    <li>Tool or system limitations</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Interventions:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    <li>Escalate for additional resources</li>
                    <li>Territory or market adjustment</li>
                    <li>Lead source diversification</li>
                    <li>Temporary expectation adjustment</li>
                    <li>Support resource connection</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-muted/50 text-xs">
                <strong>Diagnostic question:</strong> "If you had 20 more qualified leads per month, could you close them? What's actually preventing you from producing more right now that's outside your control?"
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Important: Dual Diagnosis</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Many agents have a primary AND secondary diagnosis. For example, an agent might have a primary Cadence issue (inconsistent activity) caused by a secondary Commitment issue (they're not motivated enough to maintain discipline). Always identify the primary driver — that's where you focus first. The AI will suggest both primary and secondary diagnoses based on data patterns.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* RESET Framework */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            The RESET Framework (Performance Reset Plans)
          </CardTitle>
          <CardDescription>
            The RESET framework is the formal 30-day performance improvement process for agents who are critically underperforming despite documented coaching efforts. It is a structured last-chance support mechanism — not a punishment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="p-4 rounded-lg border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-red-600 text-white text-xs">R</Badge>
                <h4 className="font-semibold text-sm">Recognize the Gap</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Document the specific performance gap between where the agent is and where they need to be. Use concrete data: "You've closed 1 unit in 90 days vs. the minimum benchmark of 3 units." Include the coaching history showing what's already been tried.
              </p>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Required fields: Current Result, Required Standard, Goal Gap, Evidence Summary
              </p>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-orange-600 text-white text-xs">E</Badge>
                <h4 className="font-semibold text-sm">Establish Requirements</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Define 3-5 specific, measurable requirements the agent must meet within 30 days. Each requirement must be objectively verifiable — no subjective assessments. Examples: "Close 2 transactions," "Make 50 prospecting calls per week (logged in CRM)," "Attend all scheduled coaching sessions."
              </p>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Each requirement has a status: Pending → Met or Missed
              </p>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-amber-600 text-white text-xs">S</Badge>
                <h4 className="font-semibold text-sm">Schedule Checkpoints</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Set weekly checkpoint meetings (typically 4 over 30 days) to evaluate progress. Each checkpoint reviews requirement status, documents agent effort, and provides additional coaching support. Use the "Performance Reset Checkpoint" session type.
              </p>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Checkpoints are mandatory — a missed checkpoint counts against the agent.
              </p>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-blue-600 text-white text-xs">E</Badge>
                <h4 className="font-semibold text-sm">Execute with Support</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                During the 30-day period, provide intensive coaching support. This is not "set it and forget it." You're actively helping the agent succeed — providing resources, removing obstacles, and coaching more frequently. Document all support provided.
              </p>
              <p className="text-xs text-muted-foreground mt-2 italic">
                The goal is for the agent to succeed. Document support so there's no question you gave them every chance.
              </p>
            </div>

            <div className="p-4 rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-emerald-600 text-white text-xs">T</Badge>
                <h4 className="font-semibold text-sm">Terminate or Transition</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                At the end of 30 days, evaluate: Did the agent meet requirements? If yes → mark "Recovered" and transition back to standard coaching with closer monitoring. If no → recommend "Coach-Out" and escalate to leadership for separation decision.
              </p>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Extensions are possible (30 more days) if the agent is showing genuine improvement but hasn't fully met requirements yet.
              </p>
            </div>
          </div>

          {/* Reset Status Flow */}
          <div className="mt-4">
            <h4 className="font-semibold text-sm mb-2">Reset Status Flow</h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {["Draft", "Pending Review", "Active", "Improving", "Recovered", "Extension Requested", "Extended", "Coach-Out Recommended", "Exited", "Canceled"].map((status, i) => (
                <div key={status} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{status}</Badge>
                  {i < 9 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">When to Initiate a RESET</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              Only initiate when: (1) Agent has been Red status for 60+ days, (2) You have documented coaching sessions showing interventions attempted, (3) Commitments have been consistently missed, (4) The agent is aware of the performance gap. Never use a RESET as a first intervention — it's a last resort after standard coaching has failed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
function SessionTemplatesSection() {
  const templates = [
    {
      name: "Standard COACH Session",
      duration: "30-60 min",
      frequency: "Based on agent status",
      purpose: "The primary coaching session type. Follows the full COACH framework (Connect, Observe, Assess, Commit, Hold Accountable). Used for ongoing development and accountability.",
      agenda: [
        "Connect: Check in on personal/professional state (5 min)",
        "Observe: Review production data, pipeline, and commitment completion (10-15 min)",
        "Assess: Diagnose current blockers using Four-C framework (10-15 min)",
        "Commit: Establish 2-3 specific, measurable commitments (5-10 min)",
        "Hold Accountable: Recap commitments, set next session, establish check-in points (5 min)",
      ],
    },
    {
      name: "Pipeline and Performance Session",
      duration: "45-60 min",
      frequency: "Monthly or as needed",
      purpose: "Deep dive into the agent's active pipeline — every deal, every lead, every opportunity. Identify stuck deals, quality issues, and conversion bottlenecks.",
      agenda: [
        "Review each active deal: status, next action, timeline, probability",
        "Identify stale leads (30+ days without activity) — decide: nurture, close, or re-engage",
        "Analyze conversion rates at each pipeline stage",
        "Review lead sources — which are producing quality vs. volume?",
        "Set pipeline-specific commitments (follow-up calls, presentations, etc.)",
      ],
    },
    {
      name: "Sales Capability Session",
      duration: "45-60 min",
      frequency: "As diagnosed",
      purpose: "Focused skill development session when the Four-C diagnosis indicates a Capability gap. Targeted training on a specific skill the agent needs to improve.",
      agenda: [
        "Identify the specific skill gap (negotiation, presenting, objection handling, etc.)",
        "Role-play the scenario where the agent struggles",
        "Provide framework/script for improvement",
        "Practice with feedback (repeat role-play with corrections)",
        "Set practice commitments for the coming week",
      ],
    },
    {
      name: "Culture and Accountability Session",
      duration: "30-45 min",
      frequency: "As needed",
      purpose: "Address behavioral, cultural, or accountability issues. Used when an agent is not meeting team expectations beyond production (attendance, communication, professionalism).",
      agenda: [
        "State the specific behavioral observation (facts, not judgments)",
        "Explain the impact on the team/company",
        "Listen to the agent's perspective",
        "Collaboratively define the expected standard going forward",
        "Set behavioral commitments with clear consequences",
      ],
    },
    {
      name: "New-Agent Launch Session",
      duration: "45-60 min",
      frequency: "Weekly during first 90 days",
      purpose: "Onboarding-focused session for agents in their Launch phase. Covers system setup, first activities, milestone tracking, and building foundational habits.",
      agenda: [
        "Review onboarding checklist progress",
        "Celebrate any first milestones (first call, first showing, first offer)",
        "Address questions and confusion about systems/processes",
        "Set activity-based commitments (not production-based yet)",
        "Ensure they're building daily habits that will compound",
      ],
    },
    {
      name: "30-Day Launch Review",
      duration: "45 min",
      frequency: "Once at 30 days",
      purpose: "Formal checkpoint at the 30-day mark of a new agent's launch. Evaluate whether they're on track, at risk, or critical in their ramp-up.",
      agenda: [
        "Review all onboarding milestones completed vs. expected",
        "Assess activity levels — are they building the right habits?",
        "Check CRM adoption and lead management quality",
        "Identify any early warning signs (disengagement, confusion, overwhelm)",
        "Set expectations for the next 30 days (transition from learning to producing)",
      ],
    },
    {
      name: "60-Day Launch Review",
      duration: "45 min",
      frequency: "Once at 60 days",
      purpose: "Mid-launch checkpoint. By 60 days, agents should be actively working leads and approaching their first deal. Evaluate trajectory and adjust support.",
      agenda: [
        "Review pipeline — do they have active opportunities?",
        "Assess skill development — can they run a showing, write an offer, negotiate?",
        "Check activity consistency — are daily habits established?",
        "Identify the biggest gap between current state and first closing",
        "Determine if additional training or support is needed",
      ],
    },
    {
      name: "90-Day Launch Review",
      duration: "60 min",
      frequency: "Once at 90 days",
      purpose: "Final launch evaluation. Determine if the agent transitions to standard coaching (Green/Yellow) or needs continued intensive support (Red). This is the 'graduation' decision.",
      agenda: [
        "Full production review — did they close their first deal?",
        "Pipeline health assessment — is there a sustainable funnel?",
        "Skill assessment — are they independently capable?",
        "Set annual goals collaboratively",
        "Transition to standard coaching cadence based on performance status assignment",
      ],
    },
    {
      name: "Performance Reset Session",
      duration: "60 min",
      frequency: "Once (kickoff)",
      purpose: "Formal initiation of a 30-day Performance Reset plan. This is a serious conversation that documents expectations, requirements, and consequences.",
      agenda: [
        "Present the performance gap with data (current vs. required)",
        "Review coaching history — what's been tried and hasn't worked",
        "Present the Reset plan: requirements, timeline, checkpoints",
        "Discuss consequences if requirements are not met",
        "Get verbal acknowledgment and commitment from the agent",
        "Schedule all 4 weekly checkpoint sessions",
      ],
    },
    {
      name: "Performance Reset Checkpoint",
      duration: "30 min",
      frequency: "Weekly during reset",
      purpose: "Mandatory weekly check-in during an active Performance Reset. Evaluate progress against requirements and provide support.",
      agenda: [
        "Review each requirement: Met, In Progress, or Behind",
        "Discuss specific actions taken since last checkpoint",
        "Identify and remove any obstacles",
        "Provide additional coaching support as needed",
        "Document progress and agent effort level",
      ],
    },
    {
      name: "Productive-Agent Strategy Session",
      duration: "45-60 min",
      frequency: "Monthly for Green/Elite agents",
      purpose: "Growth-focused session for high-performing agents. Instead of fixing problems, this session focuses on scaling, stretch goals, and skill refinement.",
      agenda: [
        "Celebrate recent wins and production milestones",
        "Review goal progress — are they on pace for annual target?",
        "Identify the next level: What would 2x production look like?",
        "Discuss market expansion, specialization, or team-building",
        "Set stretch commitments that push beyond comfort zone",
      ],
    },
    {
      name: "Stay and Retention Conversation",
      duration: "45-60 min",
      frequency: "As needed (triggered by risk signals)",
      purpose: "Proactive retention conversation when an agent shows signs of potential departure. The goal is to understand their concerns and address them before they leave.",
      agenda: [
        "Express genuine appreciation for their contribution",
        "Ask open-ended questions about satisfaction and career goals",
        "Listen for unspoken concerns (compensation, support, culture, growth)",
        "Identify what would make them stay long-term",
        "Commit to specific actions to address their concerns",
        "Escalate to leadership if resources/changes are needed",
      ],
    },
    {
      name: "Specialist Intervention",
      duration: "60 min",
      frequency: "As needed",
      purpose: "Bring in a specialist (top producer, market expert, trainer) for a targeted intervention on a specific challenge the agent faces.",
      agenda: [
        "Brief the specialist on the agent's situation beforehand",
        "Agent presents their specific challenge",
        "Specialist shares their approach and methodology",
        "Collaborative problem-solving and strategy development",
        "Agent commits to implementing specific specialist recommendations",
      ],
    },
    {
      name: "Market-Coverage Conversation",
      duration: "30-45 min",
      frequency: "Quarterly or as markets change",
      purpose: "Discuss the agent's market assignment, territory performance, and any needed adjustments to their geographic focus.",
      agenda: [
        "Review production by market/territory",
        "Discuss market conditions and trends",
        "Evaluate if current market assignment is optimal",
        "Identify expansion or contraction opportunities",
        "Set market-specific goals and strategies",
      ],
    },
    {
      name: "Coach-Out Conversation",
      duration: "30-45 min",
      frequency: "Once (final)",
      purpose: "The final conversation when a decision has been made to separate an agent from the company. Conducted with leadership present. Compassionate but clear.",
      agenda: [
        "Present the decision clearly and directly",
        "Review the documented coaching journey and reset outcome",
        "Explain next steps (timeline, transition, logistics)",
        "Offer support for their transition (references, etc.)",
        "Document the conversation thoroughly",
      ],
    },
    {
      name: "Tyler Strategy Session",
      duration: "30-60 min",
      frequency: "As scheduled by leadership",
      purpose: "Direct strategy session with company leadership (Tyler). Used for high-level strategic decisions, portfolio reviews, or agent situations requiring executive input.",
      agenda: [
        "Present the situation with data and context",
        "Discuss strategic options and implications",
        "Get leadership direction on next steps",
        "Align on communication plan to the agent",
        "Document decisions and action items",
      ],
    },
    {
      name: "Custom Coaching Session",
      duration: "Variable",
      frequency: "As needed",
      purpose: "A flexible session type for situations that don't fit other templates. Use when you need a unique agenda for a specific situation.",
      agenda: [
        "Define the specific purpose before the session",
        "Prepare relevant data and context",
        "Conduct the session with clear objectives",
        "End with commitments and next steps",
        "Document thoroughly for continuity",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            All Session Templates ({templates.length})
          </CardTitle>
          <CardDescription>
            Each session type has a specific purpose and structured agenda. Choose the right template based on the agent's needs and your coaching objective for that meeting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {templates.map((t, i) => (
              <AccordionItem key={i} value={`template-${i}`}>
                <AccordionTrigger className="text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span>{t.name}</span>
                    <Badge variant="outline" className="text-[10px] ml-2">{t.duration}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span><strong>Duration:</strong> {t.duration}</span>
                    <span><strong>Frequency:</strong> {t.frequency}</span>
                  </div>
                  <p className="text-muted-foreground">{t.purpose}</p>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</p>
                    {t.agenda.map((item, j) => (
                      <div key={j} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                        <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs">{item}</p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
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
            Every agent is assigned a performance status that reflects their current production level relative to company benchmarks. Status determines coaching cadence and priority.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <Badge className="bg-blue-600 text-white mt-0.5">Launch</Badge>
              <div>
                <p className="font-medium text-sm">New Agent (First 90 Days)</p>
                <p className="text-sm text-muted-foreground">Agent is within their launch period. Coaching focus: onboarding, first-deal milestones, building foundational habits. Cadence: weekly. Sub-statuses: On Track, At Risk, Critical.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
              <Badge className="bg-red-600 text-white mt-0.5">Red</Badge>
              <div>
                <p className="font-medium text-sm">Critical / Underperforming</p>
                <p className="text-sm text-muted-foreground">Agent is significantly below benchmark with no clear improvement trajectory. May require Performance Reset. Cadence: weekly with documented commitments. Typical trigger: &lt;2 units in trailing 90 days.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
              <Badge className="bg-yellow-600 text-white mt-0.5">Yellow</Badge>
              <div>
                <p className="font-medium text-sm">Needs Attention</p>
                <p className="text-sm text-muted-foreground">Agent is below benchmark but showing effort or has identifiable blockers. Coaching focus: diagnosis, accountability, targeted interventions. Cadence: bi-weekly. Typical trigger: 2-3 units in trailing 90 days.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <Badge className="bg-green-600 text-white mt-0.5">Green</Badge>
              <div>
                <p className="font-medium text-sm">On Track / Meeting Expectations</p>
                <p className="text-sm text-muted-foreground">Agent is meeting production benchmarks. Coaching focus: growth, stretch goals, skill refinement, retention. Cadence: monthly check-ins. Typical trigger: 4+ units in trailing 90 days.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900">
              <Badge className="bg-violet-600 text-white mt-0.5">Elite</Badge>
              <div>
                <p className="font-medium text-sm">Top Performer</p>
                <p className="text-sm text-muted-foreground">Agent is significantly exceeding benchmarks and is a top producer. Coaching focus: scaling, leadership development, retention, mentorship opportunities. Cadence: monthly or as-needed. These agents are high retention priority.</p>
              </div>
            </div>
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
            Retention risk indicates the likelihood an agent may leave the brokerage. This is a coach assessment informed by engagement signals, satisfaction indicators, and market intelligence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { level: "Low", color: "bg-green-100 text-green-800", desc: "Agent is engaged, satisfied, and showing no signs of departure. No action needed beyond standard coaching.", action: "Continue standard coaching cadence." },
              { level: "Watch", color: "bg-yellow-100 text-yellow-800", desc: "Minor warning signs — decreased engagement, occasional frustration, or general market awareness. Not urgent but worth monitoring.", action: "Increase check-in frequency. Ask satisfaction questions in next session." },
              { level: "Elevated", color: "bg-orange-100 text-orange-800", desc: "Clear indicators of potential departure — actively exploring options, expressing dissatisfaction, or disengaging from team activities.", action: "Schedule a Stay & Retention Conversation within 48 hours. Escalate to leadership." },
              { level: "Critical", color: "bg-red-100 text-red-800", desc: "Agent has expressed intent to leave, received an outside offer, or is actively interviewing. Immediate intervention required.", action: "Escalate to leadership IMMEDIATELY. Schedule emergency retention conversation with leadership present." },
            ].map((item) => (
              <div key={item.level} className="flex items-start gap-3 p-3 rounded-lg border">
                <Badge className={`${item.color} mt-0.5`}>{item.level}</Badge>
                <div>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                  <p className="text-xs font-medium mt-1">Action: {item.action}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Market Protection Statuses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Market Protection Statuses
          </CardTitle>
          <CardDescription>
            Each market has a protection status that indicates whether additional agents can be assigned to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { status: "Protected", desc: "Market is fully staffed and performing well. No additional agents will be assigned. Existing agents have exclusive territory." },
              { status: "Conditional", desc: "Market is protected but with conditions — existing agents must maintain minimum production to keep exclusivity." },
              { status: "Open for Additional Coverage", desc: "Market can support more agents. Existing agents are not at risk of losing territory, but new agents may be added." },
              { status: "Recruiting Active", desc: "Company is actively recruiting agents for this market. High priority for new agent placement." },
              { status: "Exit Pending", desc: "An agent is leaving this market (transfer, termination, or voluntary exit). Transition planning in progress." },
              { status: "Unassigned", desc: "Market has no agents assigned. May be a new market or one where all agents have departed." },
              { status: "Leadership Review", desc: "Market assignment is under leadership review due to performance concerns, conflicts, or strategic changes." },
            ].map((item) => (
              <div key={item.status} className="p-3 rounded-lg border">
                <p className="font-medium text-sm">{item.status}</p>
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
            Commitments are specific, time-bound action items from coaching sessions. They flow through a lifecycle from creation to resolution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { status: "Active", color: "bg-blue-100 text-blue-800", desc: "Current and the agent is expected to be working on it." },
              { status: "Completed", color: "bg-green-100 text-green-800", desc: "Agent fulfilled the commitment and it's been verified." },
              { status: "Overdue", color: "bg-red-100 text-red-800", desc: "Due date passed without completion. Requires follow-up." },
              { status: "Submitted for Verification", color: "bg-cyan-100 text-cyan-800", desc: "Agent says it's done — coach needs to verify." },
              { status: "Partially Completed", color: "bg-yellow-100 text-yellow-800", desc: "Some progress made but not fully met." },
              { status: "Deferred", color: "bg-gray-100 text-gray-800", desc: "Intentionally postponed with coach agreement." },
              { status: "Waived", color: "bg-gray-100 text-gray-800", desc: "Removed due to changed circumstances — not the agent's fault." },
              { status: "No Longer Relevant", color: "bg-gray-100 text-gray-800", desc: "Situation changed and commitment no longer applies." },
              { status: "AI Suggested", color: "bg-purple-100 text-purple-800", desc: "Auto-extracted by AI from session notes. Needs coach review before becoming Active." },
              { status: "Canceled", color: "bg-gray-100 text-gray-800", desc: "Removed — either replaced by a different action or no longer needed." },
            ].map((item) => (
              <div key={item.status} className="flex items-start gap-3 p-3 rounded-lg border">
                <Badge className={`${item.color} mt-0.5 text-xs`}>{item.status}</Badge>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Escalation Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Escalation Types
          </CardTitle>
          <CardDescription>
            When a situation exceeds coaching scope, escalate to leadership. Always include evidence and context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { type: "Capacity", desc: "Coach has too many high-priority agents and cannot provide adequate attention to all. Request portfolio rebalancing." },
              { type: "Performance", desc: "Agent's performance issues require leadership involvement beyond coaching (e.g., coach-out recommendation)." },
              { type: "Behavioral", desc: "Agent conduct issues (compliance, professionalism, team dynamics) that need HR/leadership intervention." },
              { type: "Retention", desc: "High-value agent at risk of leaving — needs leadership retention intervention (compensation, role changes, etc.)." },
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
                    { step: "Check Metrics First", desc: "The top grid shows portfolio-level metrics. Red numbers indicate areas needing attention. Focus on 'Overdue Commitments', 'No Session in 14 Days', and 'Active Resets' first." },
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
                    { step: "6. Communicate to Agent", desc: "Hold a formal session (use 'Performance Reset Session' type) to walk the agent through the plan, expectations, and consequences." },
                    { step: "7. Track Progress", desc: "At each checkpoint, update requirement statuses and add notes. The system tracks completion percentage automatically." },
                    { step: "8. Resolve the Reset", desc: "At the end of 30 days, mark as 'Recovered' (requirements met) or 'Coach-Out Recommended' (requirements not met, escalate to leadership)." },
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

            <AccordionItem value="assessments">
              <AccordionTrigger className="text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  How to Upload and Use Assessments
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Assessments (DISC, Kolbe, Myers-Briggs, etc.) provide personality insights that inform your coaching approach.</p>
                <div className="space-y-2">
                  {[
                    { step: "1. Navigate to Assessments Tab", desc: "On the agent's coaching page, click the 'Assessments' tab." },
                    { step: "2. Click 'Add Assessment'", desc: "Select the assessment type, date, and provider." },
                    { step: "3. Upload the File", desc: "Upload the PDF/DOC report file for reference. Supported formats: PDF, DOC, DOCX, TXT, and images." },
                    { step: "4. Paste the Raw Text", desc: "Copy and paste the full assessment results text. This is what AI will analyze — the more detail, the better the insights." },
                    { step: "5. Save & Analyze", desc: "Click 'Save & Analyze'. AI will automatically process the text and generate coaching insights: communication style, motivators, stress behaviors, preferred coaching approach, and potential risks." },
                    { step: "6. Review AI Insights", desc: "Expand the assessment card to see AI-generated insights. These are synthesized into the agent's AI Insights tab for holistic coaching recommendations." },
                    { step: "7. Use in Coaching", desc: "Reference assessment insights when planning sessions. For example, if DISC shows the agent is a high-D, use direct communication and focus on results, not process." },
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
                  {[
                    { name: "Pre-Session Brief", desc: "Generated before a session, this pulls the agent's recent data (production, pipeline, commitments, history) into a coaching preparation document. It highlights what's changed since last session and suggests talking points." },
                    { name: "Session Summary", desc: "After you complete a session and write notes, AI generates a structured summary including: key themes discussed, Four-C diagnosis, recommended next steps, and extracted commitments." },
                    { name: "Commitment Extraction", desc: "AI reads your session notes and identifies specific action items the agent committed to. These are suggested with a confidence score — you approve, edit, or reject each one." },
                    { name: "Agent Intelligence (AI Insights Tab)", desc: "On each agent's profile, the AI Insights tab provides a holistic analysis combining production data, pipeline health, goal progress, coaching history, assessment data, and commitment patterns into actionable recommendations." },
                    { name: "Command Center Brief", desc: "A portfolio-level AI summary that tells you what to focus on today across all your agents. Identifies the highest-priority actions and patterns across your coaching portfolio." },
                    { name: "Assessment Analysis", desc: "When you upload personality assessments (DISC, Kolbe, etc.), AI extracts coaching-relevant insights: communication style, motivators, stress behaviors, and recommended coaching approach." },
                  ].map((item) => (
                    <div key={item.name} className="p-3 rounded-lg border">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Remember</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    AI is a tool, not a replacement for coaching judgment. Always review AI outputs before acting on them. The AI doesn't know context that wasn't captured in notes — your human insight is irreplaceable.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

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
                    { step: "Review Market Health", desc: "Each market shows its protection status and agent count. Focus coaching resources on markets that are underperforming." },
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
                It depends on their performance status and priority. As a general guide: <strong>Red/High Priority</strong> agents need weekly sessions. <strong>Yellow/Medium Priority</strong> agents need bi-weekly sessions. <strong>Green/Low Priority</strong> agents need monthly check-ins. <strong>Elite</strong> agents need monthly or as-needed. <strong>New/Launch</strong> agents need weekly sessions during their first 90 days. The system will flag agents who haven't been coached within their expected cadence in the Action Queues.
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
                Continue coaching when: the agent is showing effort, has identifiable blockers you can help with, or has been in their current status for less than 60 days. Initiate a Performance Reset when: the agent has been Red for 60+ days despite documented coaching, shows no improvement trajectory, is not following through on commitments, or leadership has requested formal documentation. A reset is not a punishment — it's a structured last-chance support mechanism with the RESET framework (Recognize, Establish, Schedule, Execute, Terminate/Transition).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q4">
              <AccordionTrigger className="text-sm">How does the AI generate session summaries?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The AI reads your source notes from the session and combines them with the agent's current data (production, pipeline, goals, history). It then produces a structured summary that includes: key themes discussed, Four-C diagnosis (Commitment, Capability, Cadence, or Capacity), recommended next steps, and extracted commitments. The AI uses the COACH framework to structure its analysis. You should always review and edit the AI output — it's a starting point, not a final product.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q5">
              <AccordionTrigger className="text-sm">Can agents see their coaching profiles?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                No. The Coaching Hub is an admin/coach-only tool. Agents cannot see their performance status, diagnosis, retention risk, or internal coaching notes. The only coaching-related content agents may see is their commitments (if you choose to share them) and any goals set collaboratively. Keep sensitive assessments (especially retention risk and coach-out considerations) strictly internal.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q6">
              <AccordionTrigger className="text-sm">What's the difference between the Four-C Diagnosis and the old "Diagnosis Categories"?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                They're the same framework, just named differently in some places. The Four-C Diagnosis Framework has four categories: <strong>Commitment</strong> (won't do it — motivation/dedication issue), <strong>Capability</strong> (can't do it yet — skill/knowledge gap), <strong>Cadence</strong> (inconsistent — lacks daily discipline/habits), and <strong>Capacity</strong> (blocked — external constraints limiting performance). Every underperformance issue maps to one or two of these. The AI uses this framework to diagnose agents automatically based on data patterns.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q7">
              <AccordionTrigger className="text-sm">What should I do if I disagree with the AI's diagnosis?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Trust your judgment. The AI provides a data-informed suggestion, but you know the agent personally. If the AI suggests "Capability" but you know it's actually a "Commitment" issue (they have the skills but aren't applying them), override it. The AI doesn't have access to interpersonal dynamics, body language, or context from conversations that weren't documented. Always edit AI outputs to reflect your professional assessment.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q8">
              <AccordionTrigger className="text-sm">How do I handle an agent who refuses to engage with coaching?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Document everything. Note missed sessions, unfulfilled commitments, and lack of engagement in your session notes. After 2-3 documented attempts, have a direct conversation about expectations (use "Culture and Accountability Session" type). If disengagement continues, escalate to leadership with your documentation. This may lead to a Performance Reset or, ultimately, a coach-out recommendation. The key is having a clear paper trail showing you provided support that was declined.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q9">
              <AccordionTrigger className="text-sm">How many agents should a coach manage?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                It depends on the mix of priorities. A general guideline: a coach can effectively manage 15-20 agents if most are Green/Low Priority. If you have more than 5 Red/High Priority agents simultaneously, you're likely at capacity and should escalate for portfolio rebalancing. Use the Capacity Report to make data-driven arguments about workload. Quality coaching for fewer agents beats superficial check-ins with many.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q10">
              <AccordionTrigger className="text-sm">What's the "Launch Phase" and how does it work?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The Launch Phase is the first 90 days after an agent joins Savvy. During this period, agents have different expectations and coaching needs. The system tracks their launch progress through phases: <strong>Onboarding</strong> (Week 1-2: systems setup, training), <strong>Ramp</strong> (Week 3-8: first activities, first leads), <strong>Producing</strong> (Week 9-12: first deals expected). Agents in launch phase appear with a blue "Launch" badge and have their own section in the Command Center action queues. Use the 30/60/90-Day Launch Review session types at each milestone.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q11">
              <AccordionTrigger className="text-sm">How do assessments get synthesized into the agent profile?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                When you upload an assessment and paste the raw text, AI automatically analyzes it and extracts: communication style, decision-making approach, motivators, stress behaviors, accountability preferences, likely strengths, likely blind spots, preferred coaching style, and potential coaching risks. These insights are stored on the assessment record AND factored into the AI Insights tab analysis. When the AI generates coaching recommendations, it considers all assessment data to personalize its suggestions for that specific agent's personality type.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q12">
              <AccordionTrigger className="text-sm">How do I use the Pre-Session Brief effectively?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Generate the brief 15-30 minutes before your session. Read it to refresh your memory on: what you discussed last time, what commitments were made, what's changed in their production/pipeline since then, and what the AI recommends discussing. Don't read the brief verbatim to the agent — use it as your private preparation. The best coaches walk into sessions already knowing the data so they can focus on the human conversation.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q13">
              <AccordionTrigger className="text-sm">What happens to coaching data if a coach is reassigned?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                All coaching history stays with the agent, not the coach. When you reassign an agent to a new coach (via Edit Profile → Coach of Record), the new coach inherits the full history: all past sessions, commitments, assessments, and notes. This ensures continuity of care. The previous coach's sessions remain attributed to them in the history for accountability tracking.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q14">
              <AccordionTrigger className="text-sm">How do market assignments affect coaching?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Each agent is assigned to one or more markets (geographic territories). The primary market appears in their portfolio view and on their profile. Market data informs coaching in several ways: (1) Production expectations should account for market conditions, (2) Market protection status affects agent security and motivation, (3) Agents in "Recruiting Active" markets may face increased competition, (4) Market coverage data helps identify if underperformance is agent-specific or market-wide. Use the Market Coverage tab to see the full picture.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q15">
              <AccordionTrigger className="text-sm">How do I export data for leadership meetings?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Use the Reports tab for pre-built report formats. The Executive Scorecard is designed specifically for leadership presentations. For custom data, the Commitments view and Agent Portfolio both have CSV export capabilities. You can also screenshot specific sections of the Command Center for quick updates. For formal reviews, the Performance Movement report shows status changes over time with context.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
