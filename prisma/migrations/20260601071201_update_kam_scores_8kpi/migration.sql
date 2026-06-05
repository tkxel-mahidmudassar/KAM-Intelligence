/*
  Warnings:

  - You are about to drop the column `engagement` on the `kam_scores` table. All the data in the column will be lost.
  - You are about to drop the column `strategic` on the `kam_scores` table. All the data in the column will be lost.
  - You are about to drop the column `support` on the `kam_scores` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `kam_scores` DROP COLUMN `engagement`,
    DROP COLUMN `strategic`,
    DROP COLUMN `support`,
    ADD COLUMN `contractHealth` DOUBLE NULL,
    ADD COLUMN `csat` DOUBLE NULL,
    ADD COLUMN `projectHealth` DOUBLE NULL,
    ADD COLUMN `resourceHealth` DOUBLE NULL,
    ADD COLUMN `risk` DOUBLE NULL,
    ADD COLUMN `whitespace` DOUBLE NULL;

-- AlterTable
ALTER TABLE `kyc_versions` ADD COLUMN `competitiveLandscape` TEXT NULL,
    ADD COLUMN `csatHistory` TEXT NULL,
    ADD COLUMN `financialOverview` TEXT NULL;

-- AlterTable
ALTER TABLE `signals` MODIFY `type` ENUM('REVENUE_DROP', 'ENGAGEMENT_LOW', 'TICKET_SPIKE', 'NPS_DECLINE', 'CONTRACT_EXPIRY', 'CHURN_RISK', 'UPSELL_OPPORTUNITY', 'RELATIONSHIP_CHANGE', 'HEALTH_ALERT', 'CUSTOM') NOT NULL;

-- CreateTable
CREATE TABLE `app_config` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'global',
    `scoreWeights` JSON NULL,
    `notificationPrefs` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
