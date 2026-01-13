import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable("oauth_keys", (table) => {
		table.text("key_id").primary();
		table.text("private_key").notNullable();
		table.text("public_key").notNullable();
		table.text("algorithm").notNullable().defaultTo("ES256");
		table.boolean("is_active").notNullable().defaultTo(true);
		table.timestamp("created_at").defaultTo(knex.fn.now());

		table.index("is_active", "idx_oauth_keys_active");
		table.index("created_at", "idx_oauth_keys_created_at");
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTableIfExists("oauth_keys");
}

