import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { localConfigPath, parseProviderLabs, secureLocalFile } from "../classifier/src/local-provider-labs";

function mapping(text: string, path: string): Record<string, unknown> {
	let value: unknown;
	try { value = Bun.YAML.parse(text); } catch (error) { throw new Error(`${path} is not valid YAML: ${String(error)}`); }
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be a YAML mapping`);
	return value as Record<string, unknown>;
}

export function configOverlayPath(env: Record<string, string | undefined> = process.env): string | null {
	const path = localConfigPath("config.local.yml", env);
	return secureLocalFile(path) === null ? null : path;
}

export function validateLocalOverlays(env: Record<string, string | undefined> = process.env): void {
	const config = localConfigPath("config.local.yml", env);
	const configText = secureLocalFile(config);
	if (configText !== null) mapping(configText, config);
	const models = localConfigPath("models.local.yml", env);
	const modelText = secureLocalFile(models);
	if (modelText !== null) {
		const parsed = mapping(modelText, models);
		if (!parsed.providers || typeof parsed.providers !== "object" || Array.isArray(parsed.providers)) throw new Error(`${models} must contain a providers mapping`);
	}
	const labs = localConfigPath("provider-labs.local.yml", env);
	const labText = secureLocalFile(labs);
	if (labText !== null) parseProviderLabs(labText, labs);
}

export function mergeModels(baseText: string, env: Record<string, string | undefined> = process.env): { text: string; overlaid: boolean } {
	const path = localConfigPath("models.local.yml", env);
	const localText = secureLocalFile(path);
	if (localText === null) return { text: baseText, overlaid: false };
	const base = mapping(baseText, "profile/models.yml");
	const local = mapping(localText, path);
	const providers = local.providers;
	if (!providers || typeof providers !== "object" || Array.isArray(providers)) throw new Error(`${path} must contain a providers mapping`);
	return { text: Bun.YAML.stringify({ ...base, providers: { ...((base.providers as object | undefined) ?? {}), ...providers } }), overlaid: true };
}

export async function installModels(basePath: string, destination: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
	const merged = mergeModels(await Bun.file(basePath).text(), env);
	mkdirSync(dirname(destination), { recursive: true });
	const tmp = `${destination}.tmp.${process.pid}`;
	writeFileSync(tmp, merged.text, { mode: 0o600 });
	renameSync(tmp, destination);
	return merged.overlaid;
}

if (import.meta.main) {
	try {
		const [command, ...args] = process.argv.slice(2);
		if (command === "validate") validateLocalOverlays();
		else if (command === "install-models" && args.length === 2) process.stdout.write((await installModels(args[0]!, args[1]!)) ? "overlaid\n" : "public-only\n");
		else throw new Error("usage: bun install/local-overlays.ts validate | install-models <base> <destination>");
	} catch (error) {
		process.stderr.write(`local overlays: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(2);
	}
}
