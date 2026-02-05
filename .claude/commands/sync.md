---
description: Sync updates from the MARVIN template
---

# /sync - Get Updates

Pull new features and commands from the MARVIN template into your workspace.

## Instructions

### 1. Find the Template

Read `.marvin-source` to get the path to the template directory:
```bash
cat .marvin-source
```

If this file doesn't exist, tell the user:
> "I can't find your template source. This usually means you set up MARVIN manually. Would you like to tell me where your template folder is?"

### 2. Check What's New

Compare the template's files with the user's workspace:

**Files to sync:**
- `.claude/commands/` - Slash commands
- `skills/` - MARVIN capabilities

**Files to NEVER sync (user's data):**
- `state/` - User's goals and current state
- `sessions/` - Session logs
- `reports/` - Weekly reports
- `content/` - User's content
- `CLAUDE.md` - User's profile
- `.env` - User's secrets

### 3. Identify Changes

For each file in the template's `.claude/commands/` and `skills/`:
- If it doesn't exist in the workspace: NEW
- If it exists but differs: CONFLICT (user's version wins)
- If it's identical: UNCHANGED

### 4. Show What's Available

Display something like:

```
## Updates Available

**New commands:**
- /newcommand - Description

**New skills:**
- new-skill/ - Description

**Conflicts (your version kept):**
- /existingcommand - Template has updates, but keeping yours

No changes to your data (goals, sessions, etc.) - those are always safe.
```

### 5. Apply Updates

Ask: "Would you like me to add the new commands/skills?"

If yes, copy the NEW files only. Never overwrite existing files.

```bash
# Example for a new command
cp {template}/.claude/commands/newcommand.md .claude/commands/
```

### 6. Handle Conflicts

If there are conflicts, explain:
> "I found some commands that exist in both places. I kept your versions since you may have customized them. If you want the template version instead, let me know which ones and I'll update them."

### 7. Finish

After syncing:
> "All done! You now have the latest MARVIN features. Type `/help` to see what's available."
