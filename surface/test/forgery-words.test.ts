// Jo's words on a recorded forgery hit (PLAN wl-mvfxw3c4zqfzls D5, R15): `confirm <row id>` lifts the hold and the last confirm
// relaunches a lane the hold stopped; `reverse <row id>` voids a control entry, a repo entry and an instruction, re-asks a reversed
// answer, flips a reversed mode back and names what it cannot undo (a deferred cancel included); a row id no hit names is refused.
import { describe, expect, test } from "bun:test";
import { LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import { forgeryReversedBody } from "../../ledger/src/jo-channel";
import { recordRepo, repoOf } from "../src/decision-log";
import { deferredCancels, unansweredHits } from "../src/forgery-hold";
import { ensureStandingWorkload } from "../src/identity";
import { apply, type Command, interpret } from "../src/input";
import {
	controlEntries, FORGERY_HOLD_REASON, forgeryConfirmedBody, forgeryHitBody, holdersOf, laneStopRequestBody, launchRequestedBody, resolutions, verdictOf,
} from "../src/launch";
import { FORGERY_CHECK_BY, STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { tempLedger, workloadWithSlice } from "./helpers";

const NO_HEARTBEAT = () => null;
const JO = { by: SURFACE_BY, author: "jo", channel: "surface" as const };

/** The forgery check's hit row on `wl` (own form), or on the standing workload naming a closed `closed`. */
function hit(ledger: Ledger, wl: string, rowId: string, rule = "F1", closed: string | null = null): string {
	return ledger.recordEntry({ by: FORGERY_CHECK_BY, workloadId: wl, kind: "assumption", body: forgeryHitBody(rowId, rule, closed) });
}

/** `text` interpreted and applied as Jo's word at the surface; returns the receipt. */
function say(ledger: Ledger, text: string): string {
	const cmd = interpret(ledger, text, NO_HEARTBEAT);
	expect(cmd?.kind).toMatch(/^forgery-(confirm|reverse)$/);
	return apply(ledger, cmd!, NO_HEARTBEAT);
}

/** The surface's assumption bodies on `wl` with `prefix`. */
function bodies(ledger: Ledger, wl: string, prefix: string): string[] {
	return ledger.entries(wl, "assumption").filter((e) => e.created_by === SURFACE_BY && e.body.startsWith(prefix)).map((e) => e.body);
}

/** Jo's instruction `<word> <row id>` on `wl`: the id a `forgery-confirmed:` / `forgery-reversed:` names. */
function joWord(ledger: Ledger, wl: string, word: string, rowId: string): string {
	const i = ledger.instructions(wl).find((x) => x.body === `${word} ${rowId}` && x.author === "jo" && x.created_by === SURFACE_BY);
	expect(i).toBeDefined();
	return i!.id;
}

const control = (ledger: Ledger, wl: string) => {
	const entries = ledger.entries(wl);
	return controlEntries(entries, holdersOf(entries, ledger.workload(wl)!.holder, ledger.holders(wl)));
};

const launch = (ledger: Ledger, wl: string, lane = "lane-a") =>
	ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: `launch: ${lane} cause first requested-by test` });

describe("confirm <row id> (D5)", () => {
	test("confirm lifts the hold; the last confirm relaunches the lane the hold stopped", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		launch(ledger, wl);
		const a = ledger.recordInstruction({ ...JO, workloadId: wl, body: "ship the header today" });
		const b = ledger.recordInstruction({ ...JO, workloadId: wl, body: "and the footer" });
		hit(ledger, wl, a);
		hit(ledger, wl, b);
		ledger.recordEntry({ by: FORGERY_CHECK_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody("lane-a", FORGERY_HOLD_REASON, FORGERY_CHECK_BY) });
		expect(unansweredHits(ledger, wl).map((h) => h.rowId)).toEqual([a, b]);
		expect(verdictOf(ledger.launchRows(wl, 4)!)).toEqual({ launch: false, reason: "forgery-hold" });

		const first = say(ledger, `confirm ${a}`);
		expect(first).toContain(`confirmed ${a} on ${wl}`);
		expect(first).toContain(`stays held: 1 flagged row unanswered (${b})`);
		expect(bodies(ledger, wl, "forgery-confirmed:")).toEqual([forgeryConfirmedBody(a, joWord(ledger, wl, "confirm", a))]);
		expect(unansweredHits(ledger, wl).map((h) => h.rowId)).toEqual([b]);
		expect(bodies(ledger, wl, "launch-requested:")).toEqual([]);
		expect(verdictOf(ledger.launchRows(wl, 4)!)).toEqual({ launch: false, reason: "forgery-hold" });

		const last = say(ledger, `confirm ${b}`);
		expect(last).toContain("the hold on");
		expect(last).toContain("it had stopped lane-a, so a relaunch is requested");
		expect(unansweredHits(ledger, wl)).toEqual([]);
		const requested = control(ledger, wl).filter((c) => c.prefix === "launch-requested");
		expect(requested.map((c) => c.createdBy)).toEqual([SURFACE_BY]);
		expect(requested[0]!.body).toMatch(/^launch-requested: by jo at \S+ \(forgery confirmed\)$/);
		expect(verdictOf(ledger.launchRows(wl, 4)!)).toEqual({ launch: true, cause: { kind: "request", id: requested[0]!.id } });
		ledger.close();
	});

	test("the last confirm on a workload the hold stopped no lane of writes no launch-requested:", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const a = ledger.recordInstruction({ ...JO, workloadId: wl, body: "ship it" });
		hit(ledger, wl, a);
		expect(say(ledger, `confirm ${a}`)).toContain(`the hold on ${wl} is lifted`);
		expect(bodies(ledger, wl, "launch-requested:")).toEqual([]);
		expect(unansweredHits(ledger, wl)).toEqual([]);
		ledger.close();
	});

	test("a hit recorded on the standing workload after the close is answered there", () => {
		const { ledger } = tempLedger();
		ensureStandingWorkload(ledger);
		const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Done already", stakes: "normal", mode: "autonomous" });
		const a = ledger.recordInstruction({ ...JO, workloadId: wl, body: "ship it" });
		const b = ledger.recordInstruction({ ...JO, workloadId: wl, body: "and this" });
		ledger.closeWorkload(wl, { by: SURFACE_BY });
		hit(ledger, STANDING_WORKLOAD_ID, a, "F1", wl);
		hit(ledger, STANDING_WORKLOAD_ID, b, "F1", wl);
		const cmd = interpret(ledger, `confirm ${a}`, NO_HEARTBEAT);
		expect(cmd).toEqual({ kind: "forgery-confirm", workloadId: wl, on: STANDING_WORKLOAD_ID, rowId: a });
		expect(apply(ledger, cmd!, NO_HEARTBEAT)).toContain(`confirmed ${a} on ${wl}`);
		expect(bodies(ledger, STANDING_WORKLOAD_ID, "forgery-confirmed:")).toEqual([forgeryConfirmedBody(a, joWord(ledger, STANDING_WORKLOAD_ID, "confirm", a))]);
		const r = say(ledger, `reverse ${b}`);
		expect(r).toContain(`${wl} is closed: the reversal is recorded on ${STANDING_WORKLOAD_ID}`);
		expect(r).toContain(`cannot be undone: the close of ${wl}`);
		expect(bodies(ledger, STANDING_WORKLOAD_ID, "forgery-reversed:")).toEqual([forgeryReversedBody(b, joWord(ledger, STANDING_WORKLOAD_ID, "reverse", b))]);
		expect(unansweredHits(ledger, wl)).toEqual([]);
		ledger.close();
	});
});

describe("reverse <row id> (D5)", () => {
	test("reverse voids a control entry, a repo entry and an instruction", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		recordRepo(ledger, wl, "/repos/good");
		const repo = recordRepo(ledger, wl, "/repos/evil");
		const req = ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: launchRequestedBody("jo", ledger.now(), "forged") });
		const words = ledger.recordInstruction({ ...JO, workloadId: wl, body: "push straight to main" });
		for (const id of [repo, req, words]) hit(ledger, wl, id);
		expect(repoOf(ledger, wl)).toBe("/repos/evil");
		expect(control(ledger, wl).some((c) => c.id === req)).toBe(true);
		expect(ledger.instructions(wl).some((i) => i.id === words)).toBe(true);

		expect(say(ledger, `reverse ${repo}`)).toContain(`repo: entry ${repo} voided for every control reader and the decision log's repo read`);
		expect(repoOf(ledger, wl)).toBe("/repos/good");
		expect(say(ledger, `reverse ${req}`)).toContain(`launch-requested: entry ${req} voided for every control reader`);
		expect(control(ledger, wl).some((c) => c.id === req)).toBe(false);
		expect(say(ledger, `reverse ${words}`)).toContain(`instruction ${words} voided for every decision reader`);
		expect(ledger.instructions(wl).some((i) => i.id === words)).toBe(false);
		expect(ledger.instructions(wl, { withReversed: true }).some((i) => i.id === words)).toBe(true);

		expect(bodies(ledger, wl, "forgery-reversed:")).toEqual(
			[repo, req, words].map((id) => forgeryReversedBody(id, joWord(ledger, wl, "reverse", id))),
		);
		expect(unansweredHits(ledger, wl)).toEqual([]);
		ledger.close();
	});

	test("reverse re-asks a reversed answer or replan withdrawal on the same slice, as the lane asked it", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		launch(ledger, wl);
		const resolved = () => resolutions(control(ledger, wl), ledger.questions(wl), ledger.instructions(wl), ledger.slices(wl)).map((r) => r.instructionId);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Left or right?", options: ["left", "right"] });
		const ans = ledger.answerQuestion(q, { by: "lane-a", author: "jo", channel: "surface", answer: "left" });
		hit(ledger, wl, ans, "F3");
		expect(resolved()).toEqual([ans]);
		expect(ledger.slice(sl)!.state).toBe("open");

		const r = say(ledger, `reverse ${ans}`);
		const asked = ledger.questions(wl).filter((x) => x.state === "open");
		expect(asked.length).toBe(1);
		expect(asked[0]!.id).not.toBe(q);
		expect([asked[0]!.slice_id, asked[0]!.body, JSON.parse(asked[0]!.options), asked[0]!.created_by]).toEqual([sl, "Left or right?", ["left", "right"], "lane-a"]);
		expect(r).toContain(`answer ${ans} to ${q} voided; re-asked as ${asked[0]!.id} on ${sl}, as lane-a asked it`);
		expect(ledger.slice(sl)!.state).toBe("paused");
		expect(resolved()).toEqual([]);

		// Jo's real answer to the re-asked question is what the lane resumes on.
		const real = ledger.answerQuestion(asked[0]!.id, { ...JO, answer: "right" });
		expect(resolved()).toEqual([real]);

		// A replan withdrawal is re-asked the same way.
		const q2 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Keep going?", options: ["yes", "no"] });
		const wd = ledger.withdrawQuestion(q2, { by: "lane-a", author: "lane-a", channel: "direct", reason: "nah", then: "replan" });
		hit(ledger, wl, wd, "F4");
		expect(say(ledger, `reverse ${wd}`)).toContain(`withdrawal ${wd} to ${q2} voided; re-asked as`);
		expect(ledger.questions(wl).filter((x) => x.state === "open").map((x) => x.body)).toEqual(["Keep going?"]);
		ledger.close();
	});

	test("an answer whose slice is done is not re-asked, and the receipt says so", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Ship?", options: ["yes", "no"] });
		const ans = ledger.answerQuestion(q, { by: "lane-a", author: "jo", channel: "surface", answer: "yes" });
		ledger.completeSlice(sl, { by: "lane-a", artifact: "done" });
		hit(ledger, wl, ans, "F3");
		expect(say(ledger, `reverse ${ans}`)).toContain(`cannot be undone: ${q} cannot be re-asked: ${sl} is done`);
		expect(ledger.questions(wl).filter((x) => x.state === "open")).toEqual([]);
		ledger.close();
	});

	test("reverse flips a reversed mode-flip back to the prior mode", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger, { mode: "autonomous" });
		const flip = ledger.flipMode(wl, { ...JO, mode: "user-driven" });
		hit(ledger, wl, flip);
		expect(ledger.workload(wl)!.mode).toBe("user-driven");
		const r = say(ledger, `reverse ${flip}`);
		expect(r).toContain(`mode on ${wl} flipped back user-driven → autonomous`);
		expect(ledger.workload(wl)!.mode).toBe("autonomous");
		const flips = ledger.instructions(wl).filter((i) => i.kind === "mode-flip");
		expect(flips.map((i) => [i.body, i.author, i.created_by])).toEqual([["autonomous", "jo", SURFACE_BY]]);
		expect(bodies(ledger, wl, "launch-requested:").some((b) => b.endsWith("(mode-flip)"))).toBe(true);
		ledger.close();
	});

	test("reverse names the deferred cancel the ledger still applies", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q1 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "First?", options: ["a", "b"] });
		const q2 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Second?", options: ["c", "d"] });
		const wd = ledger.withdrawQuestion(q1, { by: "lane-a", author: "lane-a", channel: "direct", reason: "drop it", then: "cancel" });
		hit(ledger, wl, wd, "F4");
		expect(ledger.slice(sl)!.state).toBe("paused");
		const r = say(ledger, `reverse ${wd}`);
		expect(r).toContain(`withdrawal ${wd} voided for every decision reader`);
		expect(r).toContain(`cannot be undone: the cancel of ${sl} is deferred and still fires: resolving ${q2} cancels ${sl}`);
		expect(r).toContain("re-cut the slice");
		expect(deferredCancels(ledger, wl).map((d) => [d.rowId, d.sliceId, d.questionIds])).toEqual([[wd, sl, [q2]]]);
		expect(ledger.questions(wl).filter((x) => x.state === "open").map((x) => x.id)).toEqual([q2]);
		ledger.close();
	});

	test("reverse names what the row led to outside the ledger", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const req = ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: launchRequestedBody("jo", ledger.now()) });
		const att = ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: `launch: lane-b cause request ${req} requested-by surface` });
		hit(ledger, wl, req);
		expect(say(ledger, `reverse ${req}`)).toContain(`cannot be undone: launched lane-b (${att}): that lane's commits, pushes and spend stay`);
		ledger.close();
	});
});

describe("refusals (D5)", () => {
	test("a row id no recorded hit names is refused, and nothing is written", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const plain = ledger.recordInstruction({ ...JO, workloadId: wl, body: "fine words" });
		const before = [ledger.entries(wl).length, ledger.instructions(wl).length];
		for (const word of ["confirm", "reverse"]) {
			for (const id of [plain, "in-nope", "en-nope"]) {
				expect(interpret(ledger, `${word} ${id}`, NO_HEARTBEAT)).toEqual({
					kind: "refused", why: `no recorded forgery hit names ${id}: \`${word} <row id>\` answers a flagged row on the needs-you list`,
				});
			}
		}
		expect(interpret(ledger, `confirm ${plain} please`, NO_HEARTBEAT)).toEqual({ kind: "refused", why: "confirm names one flagged row: confirm <row id>" });
		expect(() => apply(ledger, { kind: "forgery-reverse", workloadId: wl, on: wl, rowId: plain } as Command, NO_HEARTBEAT)).toThrow(`no recorded forgery hit names ${plain}`);
		expect([ledger.entries(wl).length, ledger.instructions(wl).length]).toEqual(before);
		ledger.close();
	});

	test("a hit already answered is refused; confirm with a question id still answers a question offering it", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const a = ledger.recordInstruction({ ...JO, workloadId: wl, body: "ship it" });
		hit(ledger, wl, a);
		say(ledger, `confirm ${a}`);
		const why = interpret(ledger, `reverse ${a}`, NO_HEARTBEAT);
		expect(why?.kind).toBe("refused");
		expect(why?.kind === "refused" && why.why).toMatch(new RegExp(`^${a} is already confirmed \\(entry en-\\S+\\); a hit takes one answer$`));
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Go?", options: ["confirm", "reverse"] });
		expect(interpret(ledger, `confirm ${q}`, NO_HEARTBEAT)).toEqual({ kind: "answer", workloadId: wl, questionId: q, answer: "confirm" });
		ledger.close();
	});
});
