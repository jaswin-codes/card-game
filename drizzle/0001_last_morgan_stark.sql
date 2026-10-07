CREATE TABLE `gameActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`actionType` varchar(64) NOT NULL,
	`actionData` json DEFAULT (JSON_OBJECT()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gameActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gamePlayers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`playerIndex` int NOT NULL,
	`cards` json DEFAULT (JSON_ARRAY()),
	`score` int DEFAULT 0,
	`hasCalled` boolean DEFAULT false,
	`mistakeCount` int DEFAULT 0,
	`isEliminated` boolean DEFAULT false,
	`hasSeenBottomCards` boolean DEFAULT false,
	`hasTakenFinalTurn` boolean DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastActionAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gamePlayers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` varchar(36) NOT NULL,
	`roomCode` varchar(8) NOT NULL,
	`status` enum('lobby','playing','finished') NOT NULL DEFAULT 'lobby',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`currentTurnPlayerId` int,
	`gamePhase` enum('setup','playing','calling','finalTurns','scoring') DEFAULT 'setup',
	`calledByPlayerId` int,
	`drawPile` json DEFAULT (JSON_ARRAY()),
	`discardPile` json DEFAULT (JSON_ARRAY()),
	`playerCount` int DEFAULT 0,
	`maxPlayers` int DEFAULT 4,
	CONSTRAINT `games_id` PRIMARY KEY(`id`),
	CONSTRAINT `games_roomCode_unique` UNIQUE(`roomCode`)
);
--> statement-breakpoint
CREATE TABLE `mistakeReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` varchar(36) NOT NULL,
	`reportedByUserId` int NOT NULL,
	`offendingUserId` int NOT NULL,
	`mistakeType` varchar(64) NOT NULL,
	`description` text,
	`resolved` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mistakeReports_id` PRIMARY KEY(`id`)
);
