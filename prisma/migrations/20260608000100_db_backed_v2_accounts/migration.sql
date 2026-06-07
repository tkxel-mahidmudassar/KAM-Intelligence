-- Extend accounts with V2 profile fields and ownership.
ALTER TABLE `accounts`
  ADD COLUMN `sourceKey` VARCHAR(191) NULL,
  ADD COLUMN `deliveryModel` VARCHAR(191) NULL,
  ADD COLUMN `currentWork` TEXT NULL,
  ADD COLUMN `relationshipSignal` TEXT NULL,
  ADD COLUMN `associateOwnerId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `accounts_sourceKey_key` ON `accounts`(`sourceKey`);
CREATE INDEX `accounts_associateOwnerId_idx` ON `accounts`(`associateOwnerId`);
ALTER TABLE `accounts`
  ADD CONSTRAINT `accounts_associateOwnerId_fkey`
  FOREIGN KEY (`associateOwnerId`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend account contacts with V2 profile details.
ALTER TABLE `account_contacts`
  ADD COLUMN `location` VARCHAR(191) NULL,
  ADD COLUMN `timeZone` VARCHAR(191) NULL,
  ADD COLUMN `hierarchyRank` INTEGER NULL;

-- Persist Tkxel account resources.
CREATE TABLE `account_resources` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NULL,
  `pod` VARCHAR(191) NULL,
  `location` VARCHAR(191) NULL,
  `startDate` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `account_resources`
  ADD CONSTRAINT `account_resources_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `account_resources_accountId_idx` ON `account_resources`(`accountId`);

-- Persist account journey items.
CREATE TABLE `account_journey_items` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `dateLabel` VARCHAR(191) NULL,
  `detail` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'UPCOMING',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `completedAt` DATETIME(3) NULL,
  `dismissReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `account_journey_items`
  ADD CONSTRAINT `account_journey_items_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `account_journey_items_accountId_idx` ON `account_journey_items`(`accountId`);
