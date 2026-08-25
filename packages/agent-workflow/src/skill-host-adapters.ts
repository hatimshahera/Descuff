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
    `Use ${packageName} CLI commands for scan, plan, start, finish, and validate.`
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
    "## Workflow",
    "",
    `1. Run \`npx ${packageName} start .\` from the application root.`,
    "2. Read `.descuff/` artifacts and render the compact evidence packet.",
    "3. Produce semantic enrichment using the strict schema and evidence IDs.",
    "4. Show the semantic-enrichment diff before implementation.",
    "5. Implement only accepted plan items and preserve UI behavior unless explicitly approved.",
    `6. Run \`npx ${packageName} finish .\` and report the before/after result.`,
    "",
    "## Fallback",
    "",
    "If this host integration cannot be installed, use the portable CLI workflow: `npx descuff start .`, follow `.descuff/codex-prompt.md`, then run `npx descuff finish .`.",
    ""
  ];

  return lines.join("\n");
}
