-- Pulse To-Dos and Issues now use one workflow status vocabulary.
-- Rocks retain their separate health status model and are intentionally excluded.
ALTER TABLE `pulse_work_items` DROP CHECK `pulse_work_items_status_matches_type`;

UPDATE `pulse_work_items`
SET `status` = CASE `status`
  WHEN 'open' THEN 'not_started'
  WHEN 'discussing' THEN 'in_progress'
  WHEN 'done' THEN 'completed'
  WHEN 'solved' THEN 'completed'
  WHEN 'dropped' THEN 'blocked'
  ELSE `status`
END
WHERE `type` IN ('todo', 'issue')
  AND `status` IN ('open', 'discussing', 'done', 'solved', 'dropped');

ALTER TABLE `pulse_work_items`
  ADD CONSTRAINT `pulse_work_items_status_matches_type`
  CHECK (
    (`type` IN ('todo', 'issue') AND `status` IN ('not_started', 'in_progress', 'blocked', 'completed'))
    OR (`type` = 'rock' AND `status` IN ('on_track', 'at_risk', 'off_track', 'done', 'dropped'))
  );

UPDATE `pulse_work_item_status_notes`
SET `fromStatus` = CASE `fromStatus`
  WHEN 'open' THEN 'not_started'
  WHEN 'discussing' THEN 'in_progress'
  WHEN 'done' THEN 'completed'
  WHEN 'solved' THEN 'completed'
  WHEN 'dropped' THEN 'blocked'
  ELSE `fromStatus`
END,
`toStatus` = CASE `toStatus`
  WHEN 'open' THEN 'not_started'
  WHEN 'discussing' THEN 'in_progress'
  WHEN 'done' THEN 'completed'
  WHEN 'solved' THEN 'completed'
  WHEN 'dropped' THEN 'blocked'
  ELSE `toStatus`
END
WHERE `workItemId` IN (SELECT `id` FROM `pulse_work_items` WHERE `type` IN ('todo', 'issue'));
