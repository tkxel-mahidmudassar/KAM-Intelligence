CREATE TABLE `notifications` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `role` ENUM('ASSOCIATE', 'KAM', 'MANAGER', 'EXECUTIVE', 'ADMIN') NULL,
  `accountId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `detail` TEXT NOT NULL,
  `href` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(191) NOT NULL DEFAULT 'info',
  `isRead` BOOLEAN NOT NULL DEFAULT false,
  `isDismissed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `notifications_userId_isDismissed_createdAt_idx` ON `notifications`(`userId`, `isDismissed`, `createdAt`);
CREATE INDEX `notifications_role_isDismissed_createdAt_idx` ON `notifications`(`role`, `isDismissed`, `createdAt`);
CREATE INDEX `notifications_accountId_idx` ON `notifications`(`accountId`);

ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
