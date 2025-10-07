export type ModAction =
	| "post_delete"
	| "post_restore"
	| "user_ban"
	| "user_unban"
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
