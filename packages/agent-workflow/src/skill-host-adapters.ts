export type SkillHostTarget = "codex" | "claude-code" | "cursor";

export interface SkillHostAdapter {
  target: SkillHostTarget;
  displayName: string;
  invocationName: string;
  installDescription: string;
  instructionFileHint: string;
}

export interface RenderSkillHostInstructionsInput {
  adapter: SkillHostAdapter;
  packageName?: string;
}

export const codexSkillAdapter: SkillHostAdapter = {
  target: "codex",
  displayName: "Codex",
  invocationName: "$descuff .",
  installDescription: "Install a Codex skill under the user's Codex skills directory.",
  instructionFileHint: "SKILL.md"
};

export const claudeCodeSkillAdapter: SkillHostAdapter = {
  target: "claude-code",
  displayName: "Claude Code",
  invocationName: "/descuff",
  installDescription: "Install a Claude Code slash command or skill instruction file.",
  instructionFileHint: ".claude/commands/descuff.md"
};

export const cursorSkillAdapter: SkillHostAdapter = {
  target: "cursor",
  displayName: "Cursor",
  invocationName: "Ask the agent to run Descuff",
  installDescription: "Install Cursor rule and agent instruction files.",
  instructionFileHint: ".cursor/rules/descuff.mdc"
};

export const supportedSkillHostAdapters: SkillHostAdapter[] = [
  codexSkillAdapter,
  claudeCodeSkillAdapter,
  cursorSkillAdapter
];

export function getSkillHostAdapter(target: SkillHostTarget): SkillHostAdapter {
  const adapter = supportedSkillHostAdapters.find((item) => item.target === target);
  if (adapter === undefined) {
    throw new Error(`Unsupported Descuff skill host target: ${target}`);
  }
  return adapter;
}

export function renderSharedSkillCoreInstructions(packageName = "descuff"): string {
  return [
    "Run Descuff deterministic analysis before semantic interpretation.",
    "Use the compact evidence packet as the primary context.",
    "Use the host agent only to propose evidence-backed semantic enrichment.",
    "Domain labels are descriptive; standards and safety decisions must depend on capabilities, evidence, risk, visibility, approval, and validation.",
    "Keep proposed entities and capabilities as candidates until evidence-reference validation accepts them.",
    "Do not expose sensitive or high-consequence actions without explicit developer approval.",
    "Run Descuff validation after implementation and repair failures before reporting success.",
    "After ordinary non-Descuff website edits, run continuous readiness drift detection before reporting success.",
    "Generate browser-agent scenario suggestions when the user wants hosted before/after effort numbers.",
    `Use ${packageName} CLI commands for scan, plan, start, finish, scenarios, recon, diff, check, and validate.`
  ].join("\n");
}

export function renderSkillHostInstructions(input: RenderSkillHostInstructionsInput): string {
  const packageName = input.packageName ?? "descuff";
  const lines = [
    `# Descuff Skill For ${input.adapter.displayName}`,
    "",
    `Invocation: ${input.adapter.invocationName}`,
    `Install target: ${input.adapter.instructionFileHint}`,
    "",
    "## Shared Core",
    "",
    renderSharedSkillCoreInstructions(packageName),
    "",
    "## Intake",
    "",
    "Before running any Descuff command, briefly explain that Descuff improves local Next.js apps by adding and validating agent-facing standards while preserving human-facing behavior.",
    "State that the current public preview supports local Next.js codebases first; hosted URL recon is optional and does not replace source-backed validation.",
    "Show the planned defaults and ask the user to confirm or change them:",
    "",
    "- project root, if it is not obvious",
    "- whether to include semantic enrichment, default yes",
    "- whether to generate browser-agent scenario suggestions, default yes",
    "- hosted URL for optional browser-agent recon, if the user wants before/after hosted effort numbers",
    "- whether to use existing Graphify output when present, default yes because Graphify is optional evidence and must stay behind Descuff validation",
    "",
    "Do not run `start`, `scan`, `plan`, `enrich`, `finish`, `scenarios`, or `recon` in the same response as the first intake unless the user's current message explicitly says to proceed without confirmation.",
    "If they decline hosted recon, do the local workflow only. If they confirm the defaults, proceed with the workflow.",
    "",
    "## Workflow",
    "",
    `1. Run \`npx ${packageName} start .\` from the application root.`,
    "2. Read `.descuff/skill-evidence-packet.json` and `.descuff/semantic-enrichment-prompt.md`.",
    "3. Produce semantic enrichment using `.descuff/semantic-enrichment-template.json` and valid evidence IDs, then write it to `.descuff/semantic-enrichment.json`.",
    `4. Run \`npx ${packageName} enrich .\` and inspect \`.descuff/semantic-enrichment-diff.md\` before implementation.`,
    "5. Implement only accepted plan items and preserve UI behavior unless explicitly approved.",
    `6. Run \`npx ${packageName} finish .\` and report the before/after result.`,
    `7. If scenario suggestions were requested, run \`npx ${packageName} scenarios .\` and inspect \`.descuff/scenario-suggestions.md\`.`,
    `8. If the user provided a hosted URL, run \`npx ${packageName} recon <hosted-url> --browser\` after implementation and report hosted browser-agent scenario results honestly.`,
    "",
    "## Final Report",
    "",
    "Keep the final report centered on Descuff outcomes: readiness before/after, standards added, validation result, browser-agent scenario results, hosted recon status, remaining readiness gaps, and preserved safety boundaries.",
    "Separate local source-backed validation from hosted deployed-site recon when both were run; do not blur local implementation success with live-site visibility.",
    "If Graphify was used, include Graphify results only as a compact supporting-evidence section with the most relevant graph stats or caveats.",
    "Do not let Graphify suggested questions become the final call to action for a Descuff run.",
    "Prefer a Descuff next step such as deploying local standards changes, rerunning hosted recon after deployment, confirming live standards visibility, fixing a remaining readiness gap, or reviewing generated browser-agent scenarios.",
    "If hosted recon already confirms the deployed site exposes the new standards, make the next step the remaining readiness gap or scenario review instead of deployment.",
    "",
    "## Continuous Readiness",
    "",
    `After a normal website edit that is not explicitly implementing a Descuff plan, run \`npx ${packageName} check .\`, not \`finish\`.`,
    "`finish` is for completing a Descuff implementation plan and refreshing the known-good drift baseline after validation passes.",
    "`check` is for later edits; it compares the current code against the last known-good baseline and reports whether agent-facing routes, APIs, capabilities, standards, or security boundaries drifted.",
    "If `check` reports drift, repair the affected interface or explain the blocker before reporting success.",
    "",
    "## Fallback",
    "",
    "If this host integration cannot be installed, use the portable CLI workflow: `npx descuff start .`, follow `.descuff/codex-prompt.md`, then run `npx descuff finish .`.",
    ""
  ];

  return lines.join("\n");
}

export function renderCodexSkillFile(packageName = "descuff"): string {
  return [
    "---",
    "name: descuff",
    'description: "Use when a developer asks Codex to Descuff a local Next.js app: run Descuff analysis, perform evidence-backed semantic enrichment, implement accepted agent-facing standards, and validate the before/after result."',
    "---",
    "",
    "# Descuff",
    "",
    "Use this skill when the user asks to run Descuff, make a local Next.js app more usable by AI agents, or explicitly invokes `$descuff`.",
    "",
    renderSkillHostInstructions({
      adapter: codexSkillAdapter,
      packageName
    }),
    "",
    "## Codex-Specific Loop",
    "",
    "1. Start with a short explanation and confirmation intake before running any Descuff command, unless the user's current message explicitly says to proceed without confirmation.",
    `2. Run \`npx ${packageName} start .\`.`,
    "3. Read `.descuff/skill-evidence-packet.json` and `.descuff/semantic-enrichment-prompt.md`.",
    "4. Write strict JSON semantic enrichment to `.descuff/semantic-enrichment.json` when semantic enrichment is enabled.",
    `5. Run \`npx ${packageName} enrich .\` and inspect \`.descuff/semantic-enrichment-diff.md\`.`,
    "6. Implement only accepted plan items. Preserve UI and behavior unless explicitly approved.",
    `7. Run \`npx ${packageName} finish .\`.`,
    `8. If requested, run \`npx ${packageName} scenarios .\`; if a hosted URL was supplied, run \`npx ${packageName} recon <hosted-url> --browser\`.`,
    "9. Report baseline, enrichment result, files changed, final validation, optional scenario/recon results, and remaining blockers. Separate local validation from hosted recon when both were run. If Graphify was used, keep its output as compact supporting evidence and end with a Descuff-specific next step.",
    "",
    "## Codex Continuous-Readiness Rule",
    "",
    `For later ordinary code edits in an already-Descuffed app, run \`npx ${packageName} check .\` before the final report. Use \`finish\` only when completing an explicit Descuff plan.`,
    "",
    "Do not treat domain labels as safety approval. Do not expose sensitive or high-consequence capabilities without explicit developer approval.",
    ""
  ].join("\n");
}
