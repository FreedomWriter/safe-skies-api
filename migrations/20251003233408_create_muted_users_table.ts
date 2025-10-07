import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable("muted_users", (table) => {
		table.text("did").primary();
		table.text("reason");
		table.timestamp("muted_at").defaultTo(knex.fn.now());
		table.text("muted_by").notNullable();
		table.timestamp("last_synced_at");
		table.text("sync_status").notNullable().defaultTo("synced");
		table.specificType("tags", "text[]");
		table.text("record_key");
		table.index("sync_status");
		table.index("muted_at");
	});
}


export async function down(knex: Knex): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[-T:]|\.\d{3}Z$/g, "");

	// Backup the table before dropping
	await knex.raw(
		`CREATE TABLE muted_users_backup_${timestamp} AS TABLE muted_users`,
	);

	// Drop the table
	await knex.schema.dropTableIfExists("muted_users");

	console.log(`Backup created with timestamp: ${timestamp}`);
}

