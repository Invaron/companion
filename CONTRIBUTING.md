# Contributing to Companion

Thank you for your interest in contributing to Companion!

## Agent Workflow

This project uses two modes of agent collaboration:

### 🤖 Autonomous Agent Loop (NEW)

Agents now work **completely autonomously**:

1. **Create an issue** using the [Copilot Agent Task template](.github/ISSUE_TEMPLATE/copilot-agent-task.yml)
2. **Add the `agent-task` label**
3. **Wait** - that's it! The agent loop will:
   - Pick up your issue automatically (every 15 minutes)
   - Analyze requirements and implement changes
   - Create a PR and auto-merge it
   - Close the issue when complete

See [docs/agent-loop.md](docs/agent-loop.md) for details on the autonomous system.

### 👤 Manual Agent Workflow

You can also work on agent tasks manually:

1. **Pick a task** from [docs/agent-backlog.md](docs/agent-backlog.md) or create a new issue using the [Copilot Agent Task template](.github/ISSUE_TEMPLATE/copilot-agent-task.yml)

2. **Create a branch** following the naming convention:
   ```bash
   git checkout -b agent/<issue-number>-<short-description>
   ```

3. **Make your changes** following the acceptance criteria in the issue

4. **Verify your work** by running the commands specified in the issue's verification section:
   ```bash
   npm run typecheck
   npm run build
   npm test  # when tests are available
   ```

5. **Commit with descriptive messages**:
   ```bash
   git add .
   git commit -m "feat: add feature X
   
   - Implements acceptance criterion 1
   - Implements acceptance criterion 2
   
   Closes #<issue-number>"
   ```

6. **Push your branch**:
   ```bash
   git push origin agent/<issue-number>-<short-description>
   ```
   
   **That's it!** A PR will be automatically created with:
   - The `agent-task` label applied
   - PR template pre-populated
   - Linked to your issue
   
   Optional: Add `[automerge]` to your commit message to auto-apply the `agent-automerge` label.

## PR Guidelines

**Automated for agent branches:** When you push to `agent/<issue-number>-description`, a PR is automatically created with the template and `agent-task` label.

**Manual PRs should:**
- Use the PR template provided
- Reference the issue number with "Closes #X"
- Include verification output showing tests/checks passed
- Add `agent-task` label for automation
- Add `agent-automerge` label if the PR should auto-merge after checks pass

## Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Questions?

Refer to [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed workflow guidance.
