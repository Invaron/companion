# Testing the Agent Loop

This guide helps you test and verify the autonomous agent loop is working correctly.

## Prerequisites

- Repository with agent loop workflows installed
- GitHub Actions enabled
- `AGENT_PAT` secret configured
- Permissions enabled (contents: write, issues: write, pull-requests: write)

## Quick Test

### 1. Create a Test Issue

Create an issue with the **Copilot Agent Task** template:

**Title**: `Add test documentation`

**Body**:
```markdown
## Scope
Create a simple test documentation file.

## Deliverable
A markdown file in docs/ with test content.

## Verification
File exists at `docs/test-<issue-number>.md`
```

**Labels**: `agent-task`

### 2. Wait for Orchestrator

The orchestrator runs every 15 minutes. You can also trigger it manually:

```bash
gh workflow run agent-orchestrator.yml
```

### 3. Monitor Progress

Watch the workflow:
```bash
# Watch orchestrator
gh run watch $(gh run list --workflow=agent-orchestrator.yml --limit 1 --json databaseId -q '.[0].databaseId')

# Watch executor (once triggered)
gh run watch $(gh run list --workflow=agent-executor.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

### 4. Verify Results

Check that:
- [ ] Issue was labeled `in-progress`
- [ ] Agent executor ran successfully
- [ ] PR was created with `agent-task` and `agent-automerge` labels
- [ ] PR was auto-merged
- [ ] Issue was closed
- [ ] Branch was deleted
- [ ] New file exists in `docs/`

## Testing Different Task Types

### Documentation Task

```markdown
**Title**: Update README with usage examples

**Scope**: Add usage examples to README
**Deliverable**: Updated README with examples section
**Labels**: agent-task
```

Expected: Agent updates README.md

### New Agent Task

```markdown
**Title**: Add weather tracking agent

**Scope**: Create a new agent for weather tracking
**Deliverable**: WeatherAgent class in apps/server/src/agents/
**Labels**: agent-task
```

Expected: Agent creates `weather-agent.ts` and registers it in orchestrator

### Feature Task

```markdown
**Title**: Implement notification filtering

**Scope**: Add ability to filter notifications by priority
**Deliverable**: Filter component and API endpoint
**Labels**: agent-task
```

Expected: Agent creates feature spec document

### Configuration Task

```markdown
**Title**: Add ESLint configuration

**Scope**: Set up ESLint for TypeScript
**Deliverable**: .eslintrc.json and package.json updates
**Labels**: agent-task
```

Expected: Agent creates/updates ESLint config

## Manual Trigger Test

Test the full loop manually:

```bash
# 1. Create test issue via CLI
gh issue create \
  --title "Test agent loop" \
  --body "## Scope
Test the autonomous agent loop

## Deliverable
Create test file in docs/

## Verification
File exists" \
  --label "agent-task"

# 2. Trigger orchestrator immediately
gh workflow run agent-orchestrator.yml

# 3. Wait and check status
sleep 30
gh pr list --label agent-task

# 4. View logs
gh run list --workflow=agent-executor.yml --limit 1
```

## Validation Checklist

Use this to verify the agent loop is working correctly:

- [ ] **Orchestrator workflow exists** (`.github/workflows/agent-orchestrator.yml`)
- [ ] **Executor workflow exists** (`.github/workflows/agent-executor.yml`)
- [ ] **Agent script exists** (`.github/scripts/agent-executor.js`)
- [ ] **Auto-PR workflow exists** (`.github/workflows/agent-auto-pr.yml`)
- [ ] **PR automation workflow exists** (`.github/workflows/agent-pr-automation.yml`)
- [ ] **AGENT_PAT secret is configured**
- [ ] **Orchestrator runs on schedule** (check Actions tab)
- [ ] **Orchestrator picks up agent-task issues**
- [ ] **Executor creates branches correctly**
- [ ] **Agent script generates changes**
- [ ] **PR creation workflow triggers**
- [ ] **PR automation rebases and merges**
- [ ] **Branches are deleted after merge**
- [ ] **Issues are closed via PR merge**

## Debugging

### Orchestrator Not Running

```bash
# Check if workflow file is valid
gh workflow view agent-orchestrator.yml

# Check recent runs
gh run list --workflow=agent-orchestrator.yml --limit 5

# View logs of last run
gh run view --log $(gh run list --workflow=agent-orchestrator.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

### Agent Not Picking Up Issue

1. Verify issue has `agent-task` label:
   ```bash
   gh issue view <issue-number> --json labels
   ```

2. Check for blocking labels:
   ```bash
   # Issue should NOT have these:
   # - blocked
   # - in-progress
   ```

3. Manually trigger orchestrator:
   ```bash
   gh workflow run agent-orchestrator.yml
   ```

### Executor Fails

```bash
# View executor logs
gh run view --log $(gh run list --workflow=agent-executor.yml --limit 1 --json databaseId -q '.[0].databaseId')

# Common issues:
# - Missing dependencies (npm install not run)
# - Invalid issue format
# - Agent script errors
```

### PR Not Created

```bash
# Check if branch was created
git fetch origin
git branch -r | grep agent/

# View auto-PR workflow logs
gh run list --workflow=agent-auto-pr.yml --limit 1
```

### PR Not Merging

```bash
# Check PR labels
gh pr view <pr-number> --json labels

# Check PR automation logs
gh run list --workflow=agent-pr-automation.yml --limit 1

# Verify agent-automerge label is present
gh pr view <pr-number> --json labels -q '.labels[].name' | grep agent-automerge
```

## Performance Testing

### Concurrent Issues

Create multiple issues and verify agents process them sequentially:

```bash
for i in {1..5}; do
  gh issue create \
    --title "Test issue $i" \
    --body "## Scope
Test concurrent processing

## Deliverable
Create docs/test-$i.md" \
    --label "agent-task"
done
```

Expected: Issues processed one at a time, ~15 minutes apart

### Continuous Loop

Monitor the agent loop over several hours:

```bash
# Create 10 simple tasks
for i in {1..10}; do
  gh issue create \
    --title "Continuous test $i" \
    --body "## Scope\nCreate test file\n\n## Deliverable\ndocs/continuous-$i.md" \
    --label "agent-task"
  sleep 5
done

# Monitor processing
watch -n 60 'gh run list --workflow=agent-orchestrator.yml --limit 5'
```

Expected: All 10 issues processed over ~2.5 hours

## Success Metrics

A healthy agent loop should have:

- **95%+ success rate** for agent tasks
- **< 20 minutes** from issue creation to merge
- **0 stuck issues** (no issues remain `in-progress` for > 1 hour)
- **Clean branch history** (all agent branches deleted)
- **Proper issue closure** (all completed issues closed via PR)

Check metrics:

```bash
# Success rate (last 20 runs)
echo "Total: $(gh run list --workflow=agent-executor.yml --limit 20 --json conclusion -q 'length')"
echo "Success: $(gh run list --workflow=agent-executor.yml --limit 20 --json conclusion -q '[.[] | select(.conclusion=="success")] | length')"

# Average time to completion
gh pr list --label agent-task --state closed --limit 10 --json createdAt,mergedAt

# Stuck issues
gh issue list --label in-progress --json number,updatedAt

# Orphaned branches
git fetch origin
git branch -r | grep agent/ | wc -l
```

## Troubleshooting Common Issues

### "No changes generated"

**Cause**: Agent script couldn't determine what to do

**Fix**:
1. Make issue more specific
2. Add clear deliverable
3. Use supported task types (see agent-loop.md)

### "Merge conflicts"

**Cause**: PR branch is behind main

**Fix**: Automatic rebase should handle this. If not:
```bash
git fetch origin
git checkout agent/<issue>-<slug>
git rebase origin/main
git push --force-with-lease
```

### "Workflow failed to trigger"

**Cause**: Orchestrator not running or AGENT_PAT issue

**Fix**:
1. Verify AGENT_PAT secret exists: `gh secret list`
2. Check token permissions (should have repo access)
3. Manually trigger: `gh workflow run agent-orchestrator.yml`

### "PR created but not merged"

**Cause**: Missing `agent-automerge` label

**Fix**: Add `[automerge]` to commit message, or manually add label:
```bash
gh pr edit <pr-number> --add-label agent-automerge
```

## Next Steps

Once you've verified the agent loop works:

1. Create real issues for the agent to work on
2. Monitor agent quality over time
3. Enhance agent script with AI integration
4. Add more task type handlers
5. Implement parallel processing

See [docs/agent-loop.md](agent-loop.md) for advanced configuration and extension.
