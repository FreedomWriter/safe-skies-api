export type ModAction =
	| "post_delete"
	| "post_restore"
	| "user_ban"
	| "user_unban"
	| "user_mute"
	| "user_unmute"
	| "mod_promote"
	| "mod_demote";

export interface ReportOption {
	id: string;
	title: string;
	description: string;
	reason: string;
}

export interface ModerationService {
	value: string;
	label: string;
	feed_gen_endpoint: string | null;
	admin_did?: string;
}

export interface Report {
	targetedPostUri: string;
	reason: string;
	toServices: ModerationService[];
	targetedUserDid: string;
	uri: string;
	feedName: string;
	additionalInfo: string;
	action: ModAction;
	targetedPost: string;
	targetedProfile: string;
}

export interface BanFromTV {
	did: string;
	reason?: string;
	tags?: string[];
}

export interface BannedFromTV {
	did: string;
	reason: string | null;
	createdAt: string | null;
	tags: string[] | null;
}

export interface MutedUser {
	did: string;
	reason: string | null;
	muted_at: Date;
	muted_by: string;
	last_synced_at: Date | null;
	sync_status: "synced" | "pending" | "failed";
	tags: string[] | null;
	record_key: string | null;
}

export interface MuteFilters {
	did?: string;
	muted_by?: string;
	sync_status?: "synced" | "pending" | "failed";
	tag?: string;
	limit?: number;
	offset?: number;
}

// Ozone moderation event types
export type OzoneEventType =
	| "takedown"
	| "reverseTakedown"
	| "acknowledge"
	| "escalate"
	| "comment"
	| "label"
	| "tag";
