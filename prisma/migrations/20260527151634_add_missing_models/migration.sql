-- AlterTable
ALTER TABLE `documents` ADD COLUMN `affectedKycSections` JSON NULL,
    ADD COLUMN `affectedScores` JSON NULL,
    ADD COLUMN `extractedSignals` JSON NULL,
    ADD COLUMN `signalStatus` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `qbr_sessions` ADD COLUMN `audience` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `touchpoints` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `loggedBy` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `linkedDocumentId` VARCHAR(191) NULL,
    `stakeholders` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `kpiKey` VARCHAR(191) NOT NULL,
    `previousValue` DOUBLE NOT NULL,
    `requestedValue` DOUBLE NOT NULL,
    `approvedValue` DOUBLE NULL,
    `reason` TEXT NOT NULL,
    `requestedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questionnaire_responses` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `response` TEXT NOT NULL,
    `inputType` VARCHAR(191) NOT NULL,
    `prepopulated` BOOLEAN NOT NULL DEFAULT false,
    `confidence` DOUBLE NULL,
    `confirmedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `escalations` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `description` TEXT NOT NULL,
    `linkedProject` VARCHAR(191) NULL,
    `openedById` VARCHAR(191) NULL,
    `resolutionNotes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `serviceLine` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `estimatedValue` DOUBLE NULL,
    `effort` VARCHAR(191) NULL,
    `probability` DOUBLE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'IDENTIFIED',
    `source` VARCHAR(191) NOT NULL DEFAULT 'AI',
    `nextAction` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `touchpoints` ADD CONSTRAINT `touchpoints_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_overrides` ADD CONSTRAINT `score_overrides_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questionnaire_responses` ADD CONSTRAINT `questionnaire_responses_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `escalations` ADD CONSTRAINT `escalations_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
