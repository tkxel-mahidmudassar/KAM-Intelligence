-- Phase 3 Module 1: global playbook library foundation

CREATE TABLE `playbooks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `scope` ENUM('GLOBAL') NOT NULL DEFAULT 'GLOBAL',
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `fileSize` INTEGER NOT NULL,
    `storagePath` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `status` ENUM('PROCESSING', 'ACTIVE', 'FAILED', 'ARCHIVED') NOT NULL DEFAULT 'PROCESSING',
    `extractedText` LONGTEXT NULL,
    `processingError` TEXT NULL,
    `processedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `playbook_rules` (
    `id` VARCHAR(191) NOT NULL,
    `playbookId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `condition` TEXT NOT NULL,
    `recommendation` TEXT NOT NULL,
    `correctiveMeasure` TEXT NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `sourceTitle` VARCHAR(191) NOT NULL,
    `sourcePage` INTEGER NULL,
    `sourceSection` VARCHAR(191) NULL,
    `sourceSheet` VARCHAR(191) NULL,
    `sourceExcerpt` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `playbook_rules_playbookId_idx`(`playbookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `playbooks` ADD CONSTRAINT `playbooks_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `playbook_rules` ADD CONSTRAINT `playbook_rules_playbookId_fkey` FOREIGN KEY (`playbookId`) REFERENCES `playbooks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
