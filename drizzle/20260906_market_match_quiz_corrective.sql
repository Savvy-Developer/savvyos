-- Correct the initial Market Match follow-up plan created by the first release.
-- Preserve all unrelated Smart Plans and leave the plan editable through SavvyOS.

UPDATE `smart_plans`
SET `name` = 'Market Match - Finish Your Match'
WHERE `name` = 'Market Match — Finish Your Match';

UPDATE `smart_plan_steps` AS steps
INNER JOIN `smart_plans` AS plans ON plans.`id` = steps.`planId`
SET
  steps.`delayDays` = 0,
  steps.`delayHours` = 1,
  steps.`subject` = 'Your Savvy market matches are waiting',
  steps.`body` = 'Hi {{first_name}},\n\nYou are close to seeing STR markets matched to the goals and budget you shared. Your answers are saved.\n\nContinue your Market Match: {{market_match_resume_url}}\n\nSavvy STR Agents'
WHERE plans.`name` = 'Market Match - Finish Your Match'
  AND steps.`stepOrder` = 1
  AND steps.`subject` = 'Your Savvy market matches are waiting';

UPDATE `smart_plan_steps` AS steps
INNER JOIN `smart_plans` AS plans ON plans.`id` = steps.`planId`
SET
  steps.`delayDays` = 1,
  steps.`delayHours` = 0,
  steps.`subject` = 'Still exploring your STR market match?',
  steps.`body` = 'Hi {{first_name}},\n\nWhen the timing is right, finish your Market Match to see a current shortlist and your STR BUYBOX.\n\nContinue your Market Match: {{market_match_resume_url}}\n\nSavvy STR Agents'
WHERE plans.`name` = 'Market Match - Finish Your Match'
  AND steps.`stepOrder` = 2
  AND steps.`subject` = 'Still exploring your STR market match?';
