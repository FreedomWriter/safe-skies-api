import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
	// Add new enum values to the existing moderation_action enum
	await knex.raw(`
		ALTER TYPE moderation_action ADD VALUE IF NOT EXISTS 'user_mute';
		ALTER TYPE moderation_action ADD VALUE IF NOT EXISTS 'user_unmute';
	`);
}


export async function down(knex: Knex): Promise<void> {
	// Note: PostgreSQL doesn't support removing enum values directly
	// This would require recreating the enum type, which is complex with existing data
	// For rollback, we'll leave the enum values in place since they don't break anything
	console.log("Note: Cannot remove enum values from moderation_action. Values 'user_mute' and 'user_unmute' will remain.");
}

