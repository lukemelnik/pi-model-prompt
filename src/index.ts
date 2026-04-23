/**
 * Model Prompt Extension
 *
 * Adds a global, per-model prompt addendum stored under:
 *   ~/.pi/agent/model-prompts/<provider>/<encoded-model-id>.md
 *
 * Features:
 * - Appends the current model's addendum in before_agent_start
 * - /model-prompt show|edit|clear for manual management
 * - model_prompt_show and model_prompt_edit tools so the model can inspect/update
 *   its own model-specific instructions when the user explicitly asks
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
	createEditToolDefinition,
	defineTool,
	DynamicBorder,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	type KeybindingsManager,
	keyHint,
	type Theme,
} from "@mariozechner/pi-coding-agent";
import {
	type Component,
	Container,
	Editor,
	type EditorTheme,
	type Focusable,
	Spacer,
	Text,
	type TUI,
} from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

interface ModelPromptInfo {
	provider: string;
	modelId: string;
	label: string;
	path: string;
	exists: boolean;
	content: string;
	hasContent: boolean;
}

interface ModelPromptShowDetails {
	path: string;
	provider: string;
	modelId: string;
	exists: boolean;
	hasContent: boolean;
}

interface ModelPromptEditDetails {
	path: string;
	provider: string;
	modelId: string;
	created: boolean;
	diff?: string;
	firstChangedLine?: number;
}

const MODEL_PROMPT_TOOL_GUIDELINES = [
	"Use model prompt tools only when the user explicitly asks to inspect or modify model-specific behavior.",
	"Call model_prompt_show before model_prompt_edit unless you already know the exact current contents.",
	"Changes to a model prompt addendum apply on the next user prompt, not during the current turn.",
];

const modelPromptEditSchema = Type.Object({
	edits: Type.Array(
		Type.Object({
			oldText: Type.String({
				description:
					"Exact text to replace. Must match uniquely when the model prompt file already exists. Use an empty string only to create a brand new model prompt file.",
			}),
			newText: Type.String({ description: "Replacement text." }),
		}),
		{
			minItems: 1,
			description:
				"One or more exact replacements. If the model prompt file does not exist yet, provide exactly one edit with oldText set to an empty string to create it.",
		},
	),
});

type ModelPromptEditInput = Static<typeof modelPromptEditSchema>;

function encodePathSegment(value: string): string {
	return encodeURIComponent(value);
}

function getModelPromptPath(model: Model<Api>): string {
	return join(getAgentDir(), "model-prompts", model.provider, `${encodePathSegment(model.id)}.md`);
}

async function loadModelPromptInfo(model: Model<Api> | undefined): Promise<ModelPromptInfo | undefined> {
	if (!model) {
		return undefined;
	}

	const path = getModelPromptPath(model);
	try {
		const content = await readFile(path, "utf-8");
		return {
			provider: model.provider,
			modelId: model.id,
			label: `${model.provider}/${model.id}`,
			path,
			exists: true,
			content,
			hasContent: content.trim().length > 0,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return {
				provider: model.provider,
				modelId: model.id,
				label: `${model.provider}/${model.id}`,
				path,
				exists: false,
				content: "",
				hasContent: false,
			};
		}
		throw error;
	}
}

function requireModelPromptInfo(info: ModelPromptInfo | undefined): ModelPromptInfo {
	if (!info) {
		throw new Error("No model selected.");
	}
	return info;
}

async function saveModelPrompt(info: ModelPromptInfo, content: string): Promise<void> {
	await mkdir(dirname(info.path), { recursive: true });
	await writeFile(info.path, content, "utf-8");
}

async function removeModelPrompt(info: ModelPromptInfo): Promise<boolean> {
	try {
		await unlink(info.path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

function formatModelPromptBody(info: ModelPromptInfo): string {
	if (!info.exists) {
		return [
			`Current model: ${info.label}`,
			`Path: ${info.path}`,
			"",
			"No model-specific prompt addendum exists yet.",
			"",
			"Create one with /model-prompt edit or the model_prompt_edit tool.",
		].join("\n");
	}

	if (!info.hasContent) {
		return [
			`Current model: ${info.label}`,
			`Path: ${info.path}`,
			"",
			"The model prompt file exists but is empty, so nothing is currently appended.",
		].join("\n");
	}

	return [`Current model: ${info.label}`, `Path: ${info.path}`, "", info.content].join("\n");
}

function createViewerEditorTheme(theme: Theme): EditorTheme {
	return {
		borderColor: (text: string) => theme.fg("borderMuted", text),
		selectList: {
			selectedPrefix: (text: string) => theme.fg("accent", text),
			selectedText: (text: string) => theme.fg("accent", text),
			description: (text: string) => theme.fg("muted", text),
			scrollInfo: (text: string) => theme.fg("dim", text),
			noMatch: (text: string) => theme.fg("warning", text),
		},
	};
}

class PromptViewerComponent extends Container implements Focusable {
	private readonly editor: Editor;
	private readonly keybindings: KeybindingsManager;
	private readonly onClose: () => void;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(
		tui: TUI,
		theme: Theme,
		keybindings: KeybindingsManager,
		title: string,
		subtitle: string,
		body: string,
		onClose: () => void,
	) {
		super();
		this.keybindings = keybindings;
		this.onClose = onClose;

		this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
		this.addChild(new Text(theme.fg("muted", subtitle), 1, 0));
		this.addChild(new Spacer(1));

		this.editor = new Editor(tui, createViewerEditorTheme(theme), { paddingX: 1 });
		this.editor.setText(body);
		this.addChild(this.editor);

		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"dim",
					[
						keyHint("tui.editor.cursorUp", "scroll up"),
						keyHint("tui.editor.cursorDown", "scroll down"),
						keyHint("tui.editor.pageUp", "page up"),
						keyHint("tui.editor.pageDown", "page down"),
						keyHint("tui.select.cancel", "close"),
					].join("  "),
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel") || this.keybindings.matches(data, "tui.select.confirm")) {
			this.onClose();
			return;
		}

		if (
			this.keybindings.matches(data, "tui.editor.cursorUp") ||
			this.keybindings.matches(data, "tui.editor.cursorDown") ||
			this.keybindings.matches(data, "tui.editor.cursorLeft") ||
			this.keybindings.matches(data, "tui.editor.cursorRight") ||
			this.keybindings.matches(data, "tui.editor.cursorWordLeft") ||
			this.keybindings.matches(data, "tui.editor.cursorWordRight") ||
			this.keybindings.matches(data, "tui.editor.cursorLineStart") ||
			this.keybindings.matches(data, "tui.editor.cursorLineEnd") ||
			this.keybindings.matches(data, "tui.editor.pageUp") ||
			this.keybindings.matches(data, "tui.editor.pageDown") ||
			this.keybindings.matches(data, "tui.editor.jumpForward") ||
			this.keybindings.matches(data, "tui.editor.jumpBackward")
		) {
			this.editor.handleInput(data);
		}
	}
}

async function showModelPromptViewer(ctx: ExtensionContext, info: ModelPromptInfo): Promise<void> {
	if (!ctx.hasUI) {
		throw new Error("/model-prompt show requires interactive or RPC UI support.");
	}

	await ctx.ui.custom<void>((tui, theme, keybindings, done): Component => {
		return new PromptViewerComponent(
			tui,
			theme,
			keybindings,
			`Global model prompt for ${info.label}`,
			info.path,
			formatModelPromptBody(info),
			() => done(undefined),
		);
	});
}

async function updateStatus(ctx: ExtensionContext, model: Model<Api> | undefined): Promise<void> {
	const info = await loadModelPromptInfo(model);
	if (info?.hasContent) {
		ctx.ui.setStatus("model-prompt", ctx.ui.theme.fg("accent", "model-prompt"));
	} else {
		ctx.ui.setStatus("model-prompt", undefined);
	}
}

function buildShowToolText(info: ModelPromptInfo): string {
	if (!info.exists) {
		return [
			`No model-specific prompt addendum exists for ${info.label}.`,
			`Path: ${info.path}`,
			"Create one with model_prompt_edit using a single edit whose oldText is an empty string.",
		].join("\n");
	}

	if (!info.hasContent) {
		return [
			`The model-specific prompt addendum file for ${info.label} exists but is empty.`,
			`Path: ${info.path}`,
		].join("\n");
	}

	return [`Model-specific prompt addendum for ${info.label}:`, `Path: ${info.path}`, "", info.content].join("\n");
}

async function applyToolEdits(
	info: ModelPromptInfo,
	params: ModelPromptEditInput,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: ModelPromptEditDetails;
}> {
	if (!info.hasContent) {
		if (params.edits.length !== 1 || params.edits[0].oldText !== "") {
			throw new Error(
				`No non-empty model prompt exists yet for ${info.label}. Create it with exactly one edit whose oldText is an empty string.`,
			);
		}

		const newContent = params.edits[0].newText;
		if (newContent.trim().length === 0) {
			throw new Error("Cannot create an empty model prompt addendum.");
		}

		await saveModelPrompt(info, newContent);
		await updateStatus(ctx, ctx.model);
		return {
			content: [
				{
					type: "text",
					text: `Created model prompt addendum for ${info.label} at ${info.path}. Changes apply on the next user prompt.`,
				},
			],
			details: {
				path: info.path,
				provider: info.provider,
				modelId: info.modelId,
				created: true,
			},
		};
	}

	if (params.edits.some((edit) => edit.oldText.length === 0)) {
		throw new Error("Empty oldText is only allowed when creating a brand new model prompt addendum.");
	}

	const editTool = createEditToolDefinition(ctx.cwd);
	const result = await editTool.execute("model-prompt-edit", { path: info.path, edits: params.edits }, signal, undefined, ctx);
	const combinedText = result.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n")
		.trim();

	await updateStatus(ctx, ctx.model);
	return {
		content: [
			{
				type: "text",
				text: `${combinedText}\nChanges apply on the next user prompt.`,
			},
		],
		details: {
			path: info.path,
			provider: info.provider,
			modelId: info.modelId,
			created: false,
			diff: result.details?.diff,
			firstChangedLine: result.details?.firstChangedLine,
		},
	};
}

const modelPromptShowTool = defineTool({
	name: "model_prompt_show",
	label: "Model Prompt Show",
	description: "Show the current global model-specific prompt addendum for the active model.",
	promptSnippet: "Inspect the current model-specific prompt addendum for the active model",
	promptGuidelines: MODEL_PROMPT_TOOL_GUIDELINES,
	parameters: Type.Object({}),
	async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
		const info = requireModelPromptInfo(await loadModelPromptInfo(ctx.model));
		return {
			content: [{ type: "text", text: buildShowToolText(info) }],
			details: {
				path: info.path,
				provider: info.provider,
				modelId: info.modelId,
				exists: info.exists,
				hasContent: info.hasContent,
			} satisfies ModelPromptShowDetails,
		};
	},
});

const modelPromptEditTool = defineTool({
	name: "model_prompt_edit",
	label: "Model Prompt Edit",
	description:
		"Edit the current global model-specific prompt addendum for the active model using exact text replacement. When the file does not exist yet, create it with exactly one edit whose oldText is an empty string.",
	promptSnippet: "Edit the current model-specific prompt addendum for the active model using exact text replacement",
	promptGuidelines: MODEL_PROMPT_TOOL_GUIDELINES,
	parameters: modelPromptEditSchema,
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const info = requireModelPromptInfo(await loadModelPromptInfo(ctx.model));
		return applyToolEdits(info, params, ctx, signal);
	},
});

export default function modelPromptExtension(pi: ExtensionAPI) {
	pi.registerTool(modelPromptShowTool);
	pi.registerTool(modelPromptEditTool);

	pi.registerCommand("model-prompt", {
		description: "Show, edit, or clear the current global model prompt addendum",
		handler: async (args, ctx) => {
			const info = requireModelPromptInfo(await loadModelPromptInfo(ctx.model));
			const subcommand = args.trim();

			if (subcommand === "" || subcommand === "show") {
				await showModelPromptViewer(ctx, info);
				return;
			}

			if (subcommand === "edit") {
				if (!ctx.hasUI) {
					throw new Error("/model-prompt edit requires interactive or RPC UI support.");
				}

				const result = await ctx.ui.editor(
					info.hasContent
						? `Edit global model prompt for ${info.label}`
						: `Create global model prompt for ${info.label}`,
					info.content,
				);
				if (result === undefined) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}

				if (result.trim().length === 0) {
					const removed = await removeModelPrompt(info);
					await updateStatus(ctx, ctx.model);
					ctx.ui.notify(
						removed
							? `Cleared global model prompt for ${info.label}. Changes apply on the next user prompt.`
							: `No model prompt existed for ${info.label}.`,
						"info",
					);
					return;
				}

				await saveModelPrompt(info, result);
				await updateStatus(ctx, ctx.model);
				ctx.ui.notify(
					`Saved global model prompt for ${info.label}. Changes apply on the next user prompt.`,
					"info",
				);
				return;
			}

			if (subcommand === "clear") {
				if (!ctx.hasUI) {
					throw new Error("/model-prompt clear requires interactive or RPC UI support.");
				}

				if (!info.exists) {
					ctx.ui.notify(`No model prompt exists for ${info.label}.`, "info");
					return;
				}

				const confirmed = await ctx.ui.confirm(
					`Clear model prompt for ${info.label}?`,
					`Delete ${info.path}? This only affects future prompts for the current model.`,
				);
				if (!confirmed) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}

				await removeModelPrompt(info);
				await updateStatus(ctx, ctx.model);
				ctx.ui.notify(
					`Cleared global model prompt for ${info.label}. Changes apply on the next user prompt.`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /model-prompt [show|edit|clear]", "warning");
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const info = await loadModelPromptInfo(ctx.model);
		if (!info?.hasContent) {
			return undefined;
		}

		return {
			systemPrompt: `${event.systemPrompt}\n\n## Model-Specific Instructions (${info.label})\n\n${info.content}`,
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		await updateStatus(ctx, ctx.model);
	});

	pi.on("model_select", async (event, ctx) => {
		await updateStatus(ctx, event.model);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("model-prompt", undefined);
	});
}
