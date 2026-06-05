-- AI review gate: pending review flag for AI-generated signals and opportunities
-- resolvedNote for signal resolution context

ALTER TABLE `signals`
  ADD COLUMN `pendingReview` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `resolvedNote` TEXT NULL;

ALTER TABLE `opportunities`
  ADD COLUMN `pendingReview` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `reviewedAt`    DATETIME NULL,
  ADD COLUMN `reviewNote`    TEXT NULL;
