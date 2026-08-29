-- Keep SMS plans at their unsent step until documented marketing consent exists.
ALTER TABLE `smart_plan_enrollments`
  ADD COLUMN `pauseReason` varchar(255) NULL;
