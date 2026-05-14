# vibesdk Skills Package

Claude Code skills encoding vibesdk-specific institutional knowledge.
Install by symlinking or copying into your `~/.claude/skills/` directory.

## Available Skills

| Skill | When to Use |
|-------|------------|
| `phase-debug` | Phase failure, eval gate blocks, sub-agent errors |
| `cost-preview-troubleshoot` | CostPreviewBadge not appearing, S5 cost preview issues |
| `ag-ui-test` | Verifying AG-UI protocol events, CopilotKit integration |

## Usage in Claude Code

Skills are auto-invoked when the trigger condition matches. You can also
invoke explicitly:

```
/phase-debug
/cost-preview-troubleshoot
/ag-ui-test
```

## Adding Skills

Follow the SKILL.md convention. Each skill is a folder with a `SKILL.md`
file. The folder name becomes the slash command.
