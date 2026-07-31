-- Savvy Talent Profile — Item Bank Seed
-- All items are original. No proprietary vendor questions are used.
-- 6-point Likert scale: 1=Strongly Disagree, 6=Strongly Agree
-- isReversed=1 means high agreement = LOW dimension score (reverse-keyed)

-- ── DIMENSION 1: LEADERSHIP DRIVE ────────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('leadership_drive', 'I naturally step up to lead when a group needs direction.', 0, 10, 'original'),
('leadership_drive', 'I prefer to make the final call on decisions rather than defer to others.', 0, 11, 'original'),
('leadership_drive', 'I feel comfortable challenging a direction I believe is wrong, even with senior people.', 0, 12, 'original'),
('leadership_drive', 'I initiate action on projects without waiting to be asked.', 0, 13, 'original'),
('leadership_drive', 'I enjoy having authority over how work gets done.', 0, 14, 'original'),
('leadership_drive', 'When I see a problem, I take ownership of solving it rather than waiting for someone else.', 0, 15, 'original'),
('leadership_drive', 'I prefer to reach agreement with others before moving forward on a decision.', 1, 16, 'original'),
('leadership_drive', 'I am more comfortable supporting a leader than being the one in charge.', 1, 17, 'original'),
('leadership_drive', 'I would rather influence outcomes through collaboration than direct authority.', 1, 18, 'original'),
('leadership_drive', 'I tend to wait until I have clear direction before taking action.', 1, 19, 'original');

-- ── DIMENSION 2: SOCIAL EXPRESSION ───────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('social_expression', 'I find it easy to strike up conversations with people I have just met.', 0, 20, 'original'),
('social_expression', 'I energize others through my enthusiasm and verbal communication.', 0, 21, 'original'),
('social_expression', 'I enjoy persuading others to see things from my perspective.', 0, 22, 'original'),
('social_expression', 'I prefer working in environments with frequent social interaction.', 0, 23, 'original'),
('social_expression', 'I process my thoughts best by talking them through with others.', 0, 24, 'original'),
('social_expression', 'I am comfortable presenting ideas to a group on short notice.', 0, 25, 'original'),
('social_expression', 'I prefer to think through ideas privately before sharing them.', 1, 26, 'original'),
('social_expression', 'I find extended social interaction draining and need time alone to recharge.', 1, 27, 'original'),
('social_expression', 'I communicate more effectively in writing than in conversation.', 1, 28, 'original'),
('social_expression', 'I prefer to listen and observe before contributing to a group discussion.', 1, 29, 'original');

-- ── DIMENSION 3: OPERATING TEMPO ─────────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('operating_tempo', 'I thrive when I am juggling multiple tasks at a fast pace.', 0, 30, 'original'),
('operating_tempo', 'I prefer working environments where priorities shift frequently.', 0, 31, 'original'),
('operating_tempo', 'I get restless when work moves too slowly.', 0, 32, 'original'),
('operating_tempo', 'I am energized by urgent deadlines and rapid turnaround.', 0, 33, 'original'),
('operating_tempo', 'I adapt quickly when the plan changes without much notice.', 0, 34, 'original'),
('operating_tempo', 'I prefer to complete one task fully before moving to the next.', 1, 35, 'original'),
('operating_tempo', 'I work best when I have a consistent, predictable routine.', 1, 36, 'original'),
('operating_tempo', 'I find frequent interruptions disruptive to my productivity.', 1, 37, 'original'),
('operating_tempo', 'I prefer steady, measured progress over rapid-fire activity.', 1, 38, 'original'),
('operating_tempo', 'I do my best work when I can focus deeply on one area for an extended period.', 1, 39, 'original');

-- ── DIMENSION 4: EXECUTION STRUCTURE ─────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('execution_structure', 'I create detailed plans before starting a project.', 0, 40, 'original'),
('execution_structure', 'I follow through on commitments even when circumstances change.', 0, 41, 'original'),
('execution_structure', 'I prefer working within clearly defined processes and standards.', 0, 42, 'original'),
('execution_structure', 'Completing tasks to a high standard matters more to me than finishing quickly.', 0, 43, 'original'),
('execution_structure', 'I keep detailed records and documentation of my work.', 0, 44, 'original'),
('execution_structure', 'I feel uncomfortable leaving tasks unfinished.', 0, 45, 'original'),
('execution_structure', 'I prefer flexibility to adapt my approach as situations evolve.', 1, 46, 'original'),
('execution_structure', 'I find rigid procedures limiting and prefer to improvise.', 1, 47, 'original'),
('execution_structure', 'I am comfortable moving on before every detail is finalized.', 1, 48, 'original'),
('execution_structure', 'I tend to start new things before completing what is already in progress.', 1, 49, 'original');

-- ── DIMENSION 5: EVIDENCE ORIENTATION ────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('evidence_orientation', 'I research thoroughly before making a recommendation.', 0, 50, 'original'),
('evidence_orientation', 'I prefer to have comprehensive data before committing to a decision.', 0, 51, 'original'),
('evidence_orientation', 'I notice details that others often overlook.', 0, 52, 'original'),
('evidence_orientation', 'I document my findings carefully so others can verify my reasoning.', 0, 53, 'original'),
('evidence_orientation', 'I feel uneasy making decisions without sufficient supporting evidence.', 0, 54, 'original'),
('evidence_orientation', 'I ask many clarifying questions before starting a new task.', 0, 55, 'original'),
('evidence_orientation', 'I make quick decisions based on the most essential information available.', 1, 56, 'original'),
('evidence_orientation', 'I trust my instincts more than extensive data analysis.', 1, 57, 'original'),
('evidence_orientation', 'I prefer a concise summary over a detailed report.', 1, 58, 'original'),
('evidence_orientation', 'I am comfortable acting on incomplete information when speed is required.', 1, 59, 'original');

-- ── DIMENSION 6: CHANGE AND EXPERIMENTATION ───────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('change_experimentation', 'I enjoy testing new approaches even when the outcome is uncertain.', 0, 60, 'original'),
('change_experimentation', 'I am comfortable starting something before I have a complete plan.', 0, 61, 'original'),
('change_experimentation', 'I find ambiguity energizing rather than stressful.', 0, 62, 'original'),
('change_experimentation', 'I regularly propose new ideas or ways of doing things.', 0, 63, 'original'),
('change_experimentation', 'I adapt easily when the direction changes significantly.', 0, 64, 'original'),
('change_experimentation', 'I prefer to use methods that have been proven to work.', 1, 65, 'original'),
('change_experimentation', 'I feel more confident when I have a clear, established process to follow.', 1, 66, 'original'),
('change_experimentation', 'I prefer to minimize risk by sticking to what has worked before.', 1, 67, 'original'),
('change_experimentation', 'I find frequent changes in direction unsettling.', 1, 68, 'original'),
('change_experimentation', 'I prefer to fully understand a situation before taking action.', 1, 69, 'original');

-- ── DIMENSION 7: PRESSURE STABILITY ──────────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('pressure_stability', 'I remain calm and focused when work becomes stressful.', 0, 70, 'original'),
('pressure_stability', 'I recover quickly after a setback or disappointment at work.', 0, 71, 'original'),
('pressure_stability', 'I maintain perspective when multiple things go wrong at the same time.', 0, 72, 'original'),
('pressure_stability', 'I can set aside personal frustration to keep a project moving forward.', 0, 73, 'original'),
('pressure_stability', 'I rarely let workplace tension affect the quality of my work.', 0, 74, 'original'),
('pressure_stability', 'I am sensitive to changes in the mood or energy of the people around me.', 1, 75, 'original'),
('pressure_stability', 'I find it difficult to move on quickly after a conflict or criticism.', 1, 76, 'original'),
('pressure_stability', 'High-pressure situations significantly affect my focus and output.', 1, 77, 'original'),
('pressure_stability', 'I tend to feel the urgency of a situation more intensely than others around me.', 1, 78, 'original'),
('pressure_stability', 'I sometimes need time to process difficult feedback before I can respond constructively.', 1, 79, 'original');

-- ── DIMENSION 8: INTERPERSONAL APPROACH ──────────────────────────────────────
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('interpersonal_approach', 'I prioritize maintaining harmony in working relationships.', 0, 80, 'original'),
('interpersonal_approach', 'I consider how my words will land emotionally before speaking.', 0, 81, 'original'),
('interpersonal_approach', 'I go out of my way to make others feel heard and supported.', 0, 82, 'original'),
('interpersonal_approach', 'I prefer to find common ground rather than win an argument.', 0, 83, 'original'),
('interpersonal_approach', 'I give people the benefit of the doubt when their intentions are unclear.', 0, 84, 'original'),
('interpersonal_approach', 'I share direct feedback even when it may be uncomfortable to hear.', 1, 85, 'original'),
('interpersonal_approach', 'I am comfortable challenging someone else''s idea in a group setting.', 1, 86, 'original'),
('interpersonal_approach', 'I believe productive disagreement leads to better outcomes.', 1, 87, 'original'),
('interpersonal_approach', 'I am skeptical of ideas until I see clear evidence they will work.', 1, 88, 'original'),
('interpersonal_approach', 'I would rather surface a difficult truth than avoid an uncomfortable conversation.', 1, 89, 'original');

-- ── CONSISTENCY CHECK PAIRS ───────────────────────────────────────────────────
-- These pairs test for contradictory responses; not used for scoring dimensions
INSERT INTO stp_items (dimension, itemText, isReversed, sortOrder, sourceNote) VALUES
('consistency', 'I always complete every task I start, no matter what.', 0, 200, 'consistency_check_pair_1a'),
('consistency', 'There are times when I have left a task unfinished to focus on something more important.', 0, 201, 'consistency_check_pair_1b'),
('consistency', 'I never feel stressed at work.', 0, 202, 'consistency_check_pair_2a'),
('consistency', 'I sometimes feel pressure or tension in my work environment.', 0, 203, 'consistency_check_pair_2b'),
('consistency', 'I always prefer working alone over working with others.', 0, 204, 'consistency_check_pair_3a'),
('consistency', 'I sometimes enjoy collaborating with a team on a project.', 0, 205, 'consistency_check_pair_3b');

-- ── MOTIVATOR MODULE ──────────────────────────────────────────────────────────
-- These use a forced-choice / ranking format; itemText is the motivator label + description
INSERT INTO stp_items (dimension, itemText, responseScale, isReversed, sortOrder, sourceNote) VALUES
('motivator', 'Achievement — Reaching ambitious goals and seeing measurable results from your effort.', 'ranking', 0, 300, 'original'),
('motivator', 'Autonomy — Having the freedom to decide how and when you do your work.', 'ranking', 0, 301, 'original'),
('motivator', 'Mastery — Continuously developing deep expertise and getting better at your craft.', 'ranking', 0, 302, 'original'),
('motivator', 'Recognition — Receiving acknowledgment and appreciation for your contributions.', 'ranking', 0, 303, 'original'),
('motivator', 'Influence — Shaping decisions, strategies, or the direction of the organization.', 'ranking', 0, 304, 'original'),
('motivator', 'Connection — Building meaningful relationships and a sense of belonging at work.', 'ranking', 0, 305, 'original'),
('motivator', 'Service — Helping others and contributing to something larger than yourself.', 'ranking', 0, 306, 'original'),
('motivator', 'Stability — Having predictability, security, and a clear sense of what to expect.', 'ranking', 0, 307, 'original'),
('motivator', 'Creativity — Generating new ideas, solving problems in original ways, and expressing yourself.', 'ranking', 0, 308, 'original'),
('motivator', 'Purpose — Doing work that aligns with your values and feels genuinely meaningful.', 'ranking', 0, 309, 'original');

-- ── SJT TEMPLATES ─────────────────────────────────────────────────────────────
INSERT INTO stp_sjt_templates (roleCategory, name, description, estimatedMinutes) VALUES
('operations', 'Operations & Project Coordination SJT', 'Situational judgment scenarios for operations, project management, and transaction coordination roles.', 10),
('marketing', 'Marketing, Content & Social Media SJT', 'Situational judgment scenarios for marketing, content creation, and social media roles.', 10),
('executive_support', 'Executive & Administrative Support SJT', 'Situational judgment scenarios for executive assistants and administrative support roles.', 10),
('events', 'Events & Strategic Partnerships SJT', 'Situational judgment scenarios for events management and strategic partnerships roles.', 10),
('recruiting', 'Recruiting & People Operations SJT', 'Situational judgment scenarios for recruiting, HR, and people operations roles.', 10);

-- ── SJT SCENARIOS: Operations ─────────────────────────────────────────────────
INSERT INTO stp_sjt_scenarios (templateId, scenarioText, competency, optionsJson, interviewFollowUp, sortOrder) VALUES
(1, 'You are managing three active projects. On Monday morning you learn that a key vendor has missed a critical deadline, a client is requesting an urgent change to a deliverable due Friday, and your manager has asked you to prepare a summary report by end of day. You cannot complete all three at the same priority level. What do you do first?',
'prioritization',
'[{"text":"Contact the vendor immediately to understand the delay and its downstream impact, then assess which of the other two tasks can be adjusted before responding to anyone.","score":4,"rationale":"Best: gathers facts before committing, protects downstream work"},{"text":"Start the manager''s report since it is due today and address the other issues afterward.","score":2,"rationale":"Adequate: meets one deadline but may miss higher-impact issues"},{"text":"Email all three parties simultaneously explaining you are overloaded and ask each to adjust their expectations.","score":1,"rationale":"Poor: reactive, does not triage by impact"},{"text":"Focus on the client change request because client satisfaction is the highest priority.","score":3,"rationale":"Good: client-focused but skips impact assessment of vendor delay"}]',
'Tell me about a time you had to triage competing urgent priorities. How did you decide what to handle first?', 1),
(1, 'A project you are coordinating is two days behind schedule. The delay was caused by a team member who did not complete their portion on time. Your manager is not yet aware. What do you do?',
'ownership',
'[{"text":"Inform your manager immediately with a clear summary of the delay, its cause, and a proposed recovery plan.","score":4,"rationale":"Best: transparent, proactive, solution-oriented"},{"text":"Work extra hours to try to recover the schedule before telling anyone.","score":2,"rationale":"Adequate: shows effort but delays necessary communication"},{"text":"Send an email to the team member asking them to explain the delay before you take any other action.","score":3,"rationale":"Good: gathers information but delays upward communication"},{"text":"Wait to see if the project can still finish on time before raising the issue.","score":1,"rationale":"Poor: avoids accountability and delays course correction"}]',
'Describe a situation where a project you were responsible for ran into a problem. How did you handle communicating that upward?', 2);

-- ── SJT SCENARIOS: Marketing ──────────────────────────────────────────────────
INSERT INTO stp_sjt_scenarios (templateId, scenarioText, competency, optionsJson, interviewFollowUp, sortOrder) VALUES
(2, 'Your team is about to launch a social media campaign. The day before launch, you notice that one of the key visuals uses a stock image that may have licensing restrictions. The campaign manager is traveling and unreachable for four hours. What do you do?',
'quality_control',
'[{"text":"Pause the launch, document the concern, and reach out to the campaign manager via every available channel while sourcing an alternative image.","score":4,"rationale":"Best: protects the company, communicates proactively, finds a solution"},{"text":"Launch on schedule because the risk is probably low and the campaign manager approved everything.","score":1,"rationale":"Poor: ignores a real legal risk"},{"text":"Replace the image with a free-license alternative on your own authority and proceed with the launch.","score":3,"rationale":"Good: takes action but skips communication with decision-maker"},{"text":"Delay the launch and send an email to the legal team asking for guidance before doing anything else.","score":2,"rationale":"Adequate: cautious but may cause unnecessary delay"}]',
'Tell me about a time you caught a potential problem just before something was about to go out. What did you do?', 1),
(2, 'A content piece you published receives unexpected negative comments from the audience. The feedback is not abusive, but it suggests the messaging missed the mark. Your manager asks you to respond. What is your approach?',
'communication',
'[{"text":"Acknowledge the feedback publicly with a brief, respectful response, then bring the comments to your team to evaluate whether a content adjustment is warranted.","score":4,"rationale":"Best: transparent, constructive, uses feedback productively"},{"text":"Delete the negative comments to protect the brand image.","score":1,"rationale":"Poor: suppresses legitimate feedback, damages trust"},{"text":"Respond defensively explaining why the content was correct.","score":1,"rationale":"Poor: escalates tension, misses learning opportunity"},{"text":"Do nothing publicly but share the feedback internally for future reference.","score":2,"rationale":"Adequate: avoids conflict but misses an engagement opportunity"}]',
'How do you typically respond when content you created receives critical feedback?', 2);

-- ── SJT SCENARIOS: Executive Support ─────────────────────────────────────────
INSERT INTO stp_sjt_scenarios (templateId, scenarioText, competency, optionsJson, interviewFollowUp, sortOrder) VALUES
(3, 'Your executive has back-to-back meetings all day. At 9am you receive a message from a board member requesting an urgent call with the executive before 2pm. The executive''s calendar shows no available slots. What do you do?',
'escalation_judgment',
'[{"text":"Immediately notify the executive via their preferred urgent channel, present the request with context, and ask how they want to handle it before making any calendar changes.","score":4,"rationale":"Best: respects executive authority, communicates urgency, does not act unilaterally"},{"text":"Decline the board member''s request politely and offer the next available slot tomorrow.","score":1,"rationale":"Poor: does not escalate a high-priority request"},{"text":"Move a lower-priority meeting to create a slot and inform the executive afterward.","score":2,"rationale":"Adequate: takes initiative but bypasses executive decision-making"},{"text":"Ask the board member to send their questions in writing so the executive can respond when available.","score":3,"rationale":"Good: buys time but may not meet the urgency of the request"}]',
'Tell me about a time you had to manage a high-priority unexpected request for an executive. How did you handle it?', 1),
(3, 'You are drafting a communication on behalf of your executive to a key external partner. You realize the tone your executive prefers may come across as curt to this particular partner. What do you do?',
'communication',
'[{"text":"Draft two versions — one in the executive''s standard tone and one slightly warmer — and present both with a brief note explaining your reasoning.","score":4,"rationale":"Best: respects executive authority while flagging a potential risk"},{"text":"Send the communication in the executive''s standard tone without raising the issue.","score":2,"rationale":"Adequate: follows instructions but misses an opportunity to add value"},{"text":"Rewrite the communication in a warmer tone and send it without mentioning the change.","score":1,"rationale":"Poor: acts outside your authority"},{"text":"Ask the executive directly whether they want a warmer tone for this particular partner.","score":3,"rationale":"Good: communicates proactively but adds a step that could be handled more efficiently"}]',
'How do you balance following an executive''s preferences with your own judgment about what will land well?', 2);

-- ── SJT SCENARIOS: Events ─────────────────────────────────────────────────────
INSERT INTO stp_sjt_scenarios (templateId, scenarioText, competency, optionsJson, interviewFollowUp, sortOrder) VALUES
(4, 'Two hours before a company event begins, you learn the keynote speaker has canceled due to a personal emergency. You have 150 attendees arriving and no backup speaker confirmed. What do you do?',
'adaptability',
'[{"text":"Immediately assess your internal network for a qualified substitute, contact the most viable option, and prepare a brief agenda adjustment to fill the time if no speaker is available.","score":4,"rationale":"Best: takes decisive action, has a contingency plan, communicates proactively"},{"text":"Inform attendees immediately that the keynote has been canceled and offer refunds.","score":1,"rationale":"Poor: premature escalation before exploring alternatives"},{"text":"Restructure the agenda to extend networking and panel time, removing the keynote slot entirely.","score":3,"rationale":"Good: practical solution but skips the attempt to find a replacement"},{"text":"Contact your manager and wait for their direction before taking any action.","score":2,"rationale":"Adequate: appropriate escalation but loses critical response time"}]',
'Tell me about a time something went wrong at an event you were managing. How did you respond in the moment?', 1);

-- ── SJT SCENARIOS: Recruiting ─────────────────────────────────────────────────
INSERT INTO stp_sjt_scenarios (templateId, scenarioText, competency, optionsJson, interviewFollowUp, sortOrder) VALUES
(5, 'You are reviewing a candidate pipeline for a role that has been open for 60 days. You have five candidates at different stages. The hiring manager is pushing to make an offer quickly. One candidate is strong but has not completed a reference check. Another is a safer choice but clearly second-best. What do you recommend?',
'strategic_thinking',
'[{"text":"Recommend completing the reference check on the stronger candidate within 48 hours before making any offer, and communicate a clear timeline to the hiring manager.","score":4,"rationale":"Best: balances urgency with due diligence, communicates proactively"},{"text":"Recommend the safer candidate immediately to close the role quickly.","score":2,"rationale":"Adequate: resolves urgency but may result in a suboptimal hire"},{"text":"Recommend the stronger candidate and skip the reference check to move faster.","score":1,"rationale":"Poor: skips a critical risk-mitigation step"},{"text":"Ask the hiring manager to extend the search for two more weeks to find a better candidate.","score":1,"rationale":"Poor: ignores the urgency and existing strong candidate"}]',
'How do you handle pressure from a hiring manager to move faster than your process recommends?', 1);

-- ── WORK SAMPLE TEMPLATES ─────────────────────────────────────────────────────
INSERT INTO stp_work_sample_templates (roleCategory, title, promptText, rubricJson, estimatedMinutes) VALUES
('operations', 'Competing Deadline Prioritization', 'You have just started your workday. Below is a list of 8 tasks that have arrived in your inbox. You have approximately 4 hours of productive time today. Please: (1) Rank the tasks in the order you would address them, (2) Briefly explain your prioritization logic for the top 3, and (3) Identify any tasks you would delegate or defer and explain why.\n\nTasks:\n- Respond to a client email asking for a project status update (sent 2 days ago)\n- Review and approve a vendor invoice due for payment today\n- Attend a recurring 1-hour team meeting in 30 minutes\n- Complete a quarterly report your manager needs by end of week\n- Respond to a new inbound inquiry from a prospective client\n- Fix a data error in a report that was sent to a client yesterday\n- Prepare talking points for a presentation next Tuesday\n- Review a contract draft that legal sent over this morning',
'[{"criterion":"Prioritization logic","anchors":{"1":"No clear rationale provided","3":"Some rationale but inconsistent with urgency/impact","5":"Clear, defensible logic that balances urgency, impact, and stakeholder needs"}},{"criterion":"Client and stakeholder awareness","anchors":{"1":"Client needs deprioritized or ignored","3":"Client needs considered but not systematically","5":"Client and stakeholder needs clearly weighted in decision-making"}},{"criterion":"Delegation and deferral judgment","anchors":{"1":"No delegation or deferral identified","3":"Some tasks deferred but rationale unclear","5":"Appropriate tasks delegated or deferred with clear reasoning"}},{"criterion":"Communication clarity","anchors":{"1":"Response is disorganized or hard to follow","3":"Response is understandable but lacks structure","5":"Response is clear, organized, and easy to act on"}}]',
25),
('marketing', 'Campaign Brief Improvement', 'Below is a campaign brief for a new property investment content series. The brief has several weaknesses. Please: (1) Identify the 3 most significant problems with the brief, (2) Rewrite the brief to address those problems, and (3) Suggest one additional content angle that would strengthen the campaign.\n\nOriginal Brief:\nCampaign: STR Investment Content\nGoal: Get more leads\nAudience: People interested in real estate\nChannels: Social media and email\nTimeline: Start soon\nKey message: Investing in short-term rentals is a good idea\nCall to action: Contact us',
'[{"criterion":"Problem identification accuracy","anchors":{"1":"Problems identified are superficial or incorrect","3":"1-2 real problems identified with partial explanation","5":"3 substantive problems identified with clear explanation of why each matters"}},{"criterion":"Brief rewrite quality","anchors":{"1":"Rewrite does not address identified problems","3":"Rewrite improves some elements but remains vague","5":"Rewrite is specific, actionable, and addresses all identified problems"}},{"criterion":"Strategic thinking","anchors":{"1":"Suggested angle is generic or unrelated","3":"Suggested angle is relevant but not differentiated","5":"Suggested angle is original, audience-specific, and clearly explained"}},{"criterion":"Writing clarity","anchors":{"1":"Response is difficult to follow","3":"Response is readable but loosely organized","5":"Response is well-structured, concise, and professional"}}]',
30);

-- ── DEFAULT ASSESSMENT TEMPLATE ───────────────────────────────────────────────
-- Items 1-80 (workstyle) + 200-205 (consistency) + 300-309 (motivators)
-- We store the item IDs in order; actual IDs will be assigned by auto-increment
-- This will be updated after seeding via a separate query
INSERT INTO stp_assessment_templates (name, version, itemsJson, isActive, notes) VALUES
('Savvy Talent Profile v1', 1, '[]', 1, 'Default universal assessment. Item list populated after seed.');

SELECT 'Item bank seeded successfully.' AS status;
SELECT dimension, COUNT(*) AS item_count FROM stp_items GROUP BY dimension ORDER BY dimension;
