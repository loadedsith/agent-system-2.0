import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { labOf } from "../src/lab";
import { localConfigPath, parseProviderLabs, secureLocalFile } from "../src/local-provider-labs";
import { tmp } from "../../gates/test/helpers";

describe("user-local provider labs", () => {
	test("parses neutral additions and refuses malformed or built-in mappings", () => {
		expect(parseProviderLabs("providers:\n  private-gateway: openai\n")).toEqual({ "private-gateway": "openai" });
		for (const text of [
			"providers:\n  private-gateway: other\n",
			"providers:\n  private-gateway: constructor\n",
			"providers:\n  Bad: openai\n",
			"providers:\n  anthropic: kimi\n",
			"extra: true\nproviders: {}\n",
		]) expect(() => parseProviderLabs(text)).toThrow();
	});

	test("requires a private regular file and rejects symlinks", () => {
		const root = tmp("local-labs");
		const file = join(root, "labs.yml");
		writeFileSync(file, "providers: {}\n", { mode: 0o600 });
		expect(secureLocalFile(file)).toContain("providers");
		chmodSync(file, 0o644);
		expect(() => secureLocalFile(file)).toThrow("0600");
		const link = join(root, "link.yml");
		symlinkSync(file, link);
		expect(() => secureLocalFile(link)).toThrow("securely");
	});

	test("labOf reads the local map and built-ins still win", () => {
		const home = tmp("local-lab-home");
		const path = localConfigPath("provider-labs.local.yml", { HOME: home });
		mkdirSync(join(home, ".config", "as2"), { recursive: true });
		writeFileSync(path, "providers:\n  private-gateway: openai\n", { mode: 0o600 });
		const oldHome = process.env.HOME;
		process.env.HOME = home;
		try {
			expect(labOf("private-gateway/model")).toBe("openai");
			expect(labOf("anthropic/model")).toBe("anthropic");
		} finally { if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome; }
	});

	test("relative XDG_CONFIG_HOME is ignored", () => {
		const home = tmp("xdg-home");
		expect(localConfigPath("config.local.yml", { HOME: home, XDG_CONFIG_HOME: "relative" })).toBe(join(home, ".config", "as2", "config.local.yml"));
	});
});
