// Every Linear call the issues projection makes (PLAN wl-mv66ylim0gahog § 13.2): the operations the
// projector uses on GitHub, on Linear's GraphQL API. Each request goes through an injected `fetch`
// (tests fake it) with AbortSignal.timeout(NETWORK_MS), counted first against Linear's own caps
// (`Counted`, kind `linear`: its own 20/tick and 300/h). A GraphQL `errors` array on HTTP 200 is a
// failure, like a non-2xx status or a reply that is not JSON.
//
// The key is Jo's `LINEAR_API_KEY`, read from the environment by the row and handed in here. It goes
// only in the Authorization header: never in argv, never in a log line, and every error text this
// module returns has it replaced by `[redacted]` (`redact`). A missing key makes no request: every
// call fails with "LINEAR_API_KEY is not set".
import { Counted, type GhCallerOptions, NETWORK_MS } from "./github";
import { LABEL, PROJECTION_LABELS, type Rendered } from "./render";
import type { Sidecar } from "./sidecar";

export const LINEAR_KEY_ENV = "LINEAR_API_KEY";
export const LINEAR_URL = "https://api.linear.app/graphql";
/** Issues per page when listing a team's labelled issues (§ 13.2 reconcile). */
export const LINEAR_PAGE = 250;

/** The projection's labels on Linear: GitHub's set without `intake` (no Linear intake, § 13.2). */
export const LINEAR_LABELS: readonly string[] = PROJECTION_LABELS.filter((l) => l !== LABEL.intake);

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** `text` with every occurrence of `key` replaced; the key never reaches an error text or a notice. */
export function redact(text: string, key: string | null | undefined): string {
	return key ? text.split(key).join("[redacted]") : text;
}

export interface WorkflowState {
	id: string;
	name: string;
	/** Linear's workflow type: backlog, unstarted, started, completed, canceled, triage. */
	type: string;
}

export interface LinearTeam {
	id: string;
	key: string;
	states: WorkflowState[];
	labels: { id: string; name: string }[];
}

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string;
	state: WorkflowState | null;
	labels: { id: string; name: string }[];
}

export interface LinearIssueInput {
	title?: string;
	description?: string;
	labelIds?: string[];
	stateId?: string;
}

/**
 * The workflow state a render maps to, by type (§ 13.2): open ⇒ `started` "In Progress";
 * awaiting-merge ⇒ the `started` state "In Review" when the team has one, else "In Progress";
 * closed completed ⇒ `completed` (Done); not planned ⇒ `canceled` (Canceled). A team without the
 * named state gets the first of that type; none of the type ⇒ null.
 */
export function linearStateFor(r: Pick<Rendered, "state" | "reason" | "labels">, states: readonly WorkflowState[]): WorkflowState | null {
	const pick = (type: string, ...names: string[]): WorkflowState | null => {
		const ofType = states.filter((s) => s.type === type);
		for (const n of names) {
			const s = ofType.find((x) => x.name.toLowerCase() === n.toLowerCase());
			if (s) return s;
		}
		return ofType[0] ?? null;
	};
	if (r.state === "open") return r.labels.includes(LABEL.awaitingMerge) ? pick("started", "In Review", "In Progress") : pick("started", "In Progress");
	return r.reason === "not planned" ? pick("canceled", "Canceled") : pick("completed", "Done");
}

/** Labels per issue: the projection's own six plus room for Jo's; kept small because Linear caps one query's complexity at 10000 (live: 21560 was refused). */
const ISSUE_FIELDS = "id identifier title description state { id name type } labels(first: 20) { nodes { id name } }";

const at = (v: unknown, ...path: string[]): unknown => {
	let cur = v;
	for (const k of path) {
		if (cur === null || typeof cur !== "object" || !(k in cur)) return undefined;
		cur = (cur as Record<string, unknown>)[k];
	}
	return cur;
};

const str = (v: unknown): v is string => typeof v === "string";

function nodes(v: unknown): unknown[] {
	const n = at(v, "nodes");
	return Array.isArray(n) ? n : [];
}

function stateOf(v: unknown): WorkflowState | null {
	const id = at(v, "id");
	const name = at(v, "name");
	const type = at(v, "type");
	return str(id) && str(name) && str(type) ? { id, name, type } : null;
}

function labelsOf(v: unknown): { id: string; name: string }[] {
	return nodes(v).flatMap((l) => {
		const id = at(l, "id");
		const name = at(l, "name");
		return str(id) && str(name) ? [{ id, name }] : [];
	});
}

function issueOf(v: unknown): LinearIssue | null {
	const id = at(v, "id");
	const identifier = at(v, "identifier");
	const title = at(v, "title");
	if (!str(id) || !str(identifier) || !str(title)) return null;
	const description = at(v, "description");
	return { id, identifier, title, description: str(description) ? description : "", state: stateOf(at(v, "state")), labels: labelsOf(at(v, "labels")) };
}

/** The counted Linear caller one tick uses. */
export class Linear extends Counted {
	constructor(
		private readonly fetch: FetchLike,
		private readonly key: string | null,
		sidecar: Sidecar,
		o: GhCallerOptions,
	) {
		super(sidecar, o, "linear");
	}

	get hasKey(): boolean {
		return this.key !== null && this.key !== "";
	}

	/** One counted GraphQL request: `data`, or a failure (HTTP status, no JSON, or a GraphQL `errors` array on 200). Throws TickStop when it may not run. */
	async graphql(what: string, query: string, variables: Record<string, unknown>): Promise<Outcome<unknown>> {
		if (!this.hasKey) return { ok: false, error: `Linear ${what}: ${LINEAR_KEY_ENV} is not set` };
		this.count();
		const fail = (why: string): Outcome<unknown> => ({ ok: false, error: redact(`Linear ${what} ${why}`, this.key) });
		let res: Response;
		try {
			res = await this.fetch(LINEAR_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: this.key! },
				body: JSON.stringify({ query, variables }),
				signal: AbortSignal.timeout(NETWORK_MS),
			});
		} catch (err) {
			return fail(`failed: ${String(err instanceof Error ? err.message : err).split("\n")[0]}`);
		}
		let text: string;
		try {
			text = await res.text();
		} catch (err) {
			return fail(`failed reading the reply: ${String(err instanceof Error ? err.message : err).split("\n")[0]}`);
		}
		if (!res.ok) return fail(`HTTP ${res.status}: ${text.trim().split("\n")[0] || "no body"}`);
		let v: unknown;
		try {
			v = JSON.parse(text);
		} catch {
			return fail(`printed no JSON (${text.trim().split("\n")[0] || "no body"})`);
		}
		const errors = at(v, "errors");
		if (Array.isArray(errors) && errors.length > 0) {
			const msg = at(errors[0], "message");
			return fail(`GraphQL error: ${str(msg) ? msg : JSON.stringify(errors[0])}`);
		}
		const data = at(v, "data");
		if (data === undefined || data === null) return fail("replied with no data");
		return { ok: true, value: data };
	}

	/** The team with key `key`: its id, workflow states and labels. */
	async team(key: string): Promise<Outcome<LinearTeam>> {
		const r = await this.graphql(
			`team ${key}`,
			"query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes { id key states(first: 100) { nodes { id name type } } labels(first: 250) { nodes { id name } } } } }",
			{ key },
		);
		if (!r.ok) return r;
		const t = nodes(at(r.value, "teams"))[0];
		const id = at(t, "id");
		if (!str(id)) return { ok: false, error: `Linear has no team ${key}` };
		const states = nodes(at(t, "states")).flatMap((s) => {
			const x = stateOf(s);
			return x ? [x] : [];
		});
		return { ok: true, value: { id, key, states, labels: labelsOf(at(t, "labels")) } };
	}

	async createLabel(teamId: string, name: string): Promise<Outcome<{ id: string; name: string }>> {
		const r = await this.graphql(
			`label create ${name}`,
			"mutation($name: String!, $teamId: String!) { issueLabelCreate(input: { name: $name, teamId: $teamId }) { success issueLabel { id name } } }",
			{ name, teamId },
		);
		if (!r.ok) return r;
		const id = at(r.value, "issueLabelCreate", "issueLabel", "id");
		if (at(r.value, "issueLabelCreate", "success") !== true || !str(id)) return { ok: false, error: `Linear label create ${name} did not succeed` };
		return { ok: true, value: { id, name } };
	}

	/** The lost-create search (§ 3) on Linear: an `as2`-labelled issue in the team whose title starts `prefix`, or null. */
	async findByTitle(teamKey: string, prefix: string): Promise<Outcome<{ id: string; identifier: string } | null>> {
		const r = await this.graphql(
			"issue search",
			"query($team: String!, $prefix: String!, $label: String!) { issues(filter: { team: { key: { eq: $team } }, title: { startsWith: $prefix }, labels: { some: { name: { eq: $label } } } }, first: 50) { nodes { id identifier title } } }",
			{ team: teamKey, prefix, label: LABEL.as2 },
		);
		if (!r.ok) return r;
		for (const n of nodes(at(r.value, "issues"))) {
			const id = at(n, "id");
			const identifier = at(n, "identifier");
			const title = at(n, "title");
			if (str(id) && str(identifier) && str(title) && title.startsWith(prefix)) return { ok: true, value: { id, identifier } };
		}
		return { ok: true, value: null };
	}

	async create(teamId: string, input: Required<LinearIssueInput>): Promise<Outcome<{ id: string; identifier: string }>> {
		const r = await this.graphql("issue create", "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }", { input: { teamId, ...input } });
		if (!r.ok) return r;
		const id = at(r.value, "issueCreate", "issue", "id");
		const identifier = at(r.value, "issueCreate", "issue", "identifier");
		if (at(r.value, "issueCreate", "success") !== true || !str(id) || !str(identifier)) return { ok: false, error: "Linear issue create did not succeed" };
		return { ok: true, value: { id, identifier } };
	}

	async read(id: string): Promise<Outcome<LinearIssue>> {
		const r = await this.graphql(`issue read ${id}`, `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id });
		if (!r.ok) return r;
		const issue = issueOf(at(r.value, "issue"));
		return issue ? { ok: true, value: issue } : { ok: false, error: `Linear issue read ${id} printed no issue` };
	}

	async update(id: string, input: LinearIssueInput): Promise<Outcome<true>> {
		const r = await this.graphql(`issue update ${id}`, "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }", { id, input });
		if (!r.ok) return r;
		return at(r.value, "issueUpdate", "success") === true ? { ok: true, value: true } : { ok: false, error: `Linear issue update ${id} did not succeed` };
	}

	async comment(issueId: string, body: string): Promise<Outcome<true>> {
		const r = await this.graphql(`comment ${issueId}`, "mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }", { issueId, body });
		if (!r.ok) return r;
		return at(r.value, "commentCreate", "success") === true ? { ok: true, value: true } : { ok: false, error: `Linear comment on ${issueId} did not succeed` };
	}

	/** Every issue in the team labelled `label`, LINEAR_PAGE per request, following `hasNextPage` within this call. */
	async listLabelled(teamKey: string, label: string): Promise<Outcome<LinearIssue[]>> {
		const out: LinearIssue[] = [];
		let after: string | null = null;
		for (;;) {
			const r = await this.graphql(
				"labelled issue list",
				`query($team: String!, $label: String!, $after: String) { issues(filter: { team: { key: { eq: $team } }, labels: { some: { name: { eq: $label } } } }, first: ${LINEAR_PAGE}, after: $after) { nodes { ${ISSUE_FIELDS} } pageInfo { hasNextPage endCursor } } }`,
				{ team: teamKey, label, after },
			);
			if (!r.ok) return r;
			for (const n of nodes(at(r.value, "issues"))) {
				const issue = issueOf(n);
				if (issue) out.push(issue);
			}
			const more = at(r.value, "issues", "pageInfo", "hasNextPage");
			const cursor = at(r.value, "issues", "pageInfo", "endCursor");
			if (more !== true) return { ok: true, value: out };
			if (!str(cursor)) return { ok: false, error: "Linear labelled issue list has a next page but no cursor" };
			after = cursor;
		}
	}
}
