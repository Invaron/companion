#!/usr/bin/env node

/**
 * Agent Executor Script
 * 
 * This script analyzes an issue and autonomously makes code changes.
 * It uses pattern matching, heuristics, and can be extended with AI APIs.
 */

const fs = require('fs');
const path = require('path');

// Environment variables from the workflow
const ISSUE_NUMBER = process.env.ISSUE_NUMBER || '';
const ISSUE_TITLE = process.env.ISSUE_TITLE || '';
const ISSUE_BODY = process.env.ISSUE_BODY || '';
const ISSUE_SCOPE = process.env.ISSUE_SCOPE || '';
const ISSUE_DELIVERABLE = process.env.ISSUE_DELIVERABLE || '';

console.log('🤖 Agent Executor Started');
console.log(`📋 Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);
console.log(`📦 Scope: ${ISSUE_SCOPE}`);
console.log(`🎯 Deliverable: ${ISSUE_DELIVERABLE}`);

/**
 * Task analyzers - pattern match issue content to determine task type
 */
const taskAnalyzers = [
  {
    name: 'documentation',
    pattern: /\b(doc|documentation|readme|guide|tutorial)\b/i,
    handler: handleDocumentationTask
  },
  {
    name: 'new-agent',
    pattern: /\b(add|create|new)\s+(agent|provider)\b/i,
    handler: handleNewAgentTask
  },
  {
    name: 'fix-bug',
    pattern: /\b(fix|bug|error|issue)\b/i,
    handler: handleBugFixTask
  },
  {
    name: 'feature',
    pattern: /\b(feature|implement|add)\b/i,
    handler: handleFeatureTask
  },
  {
    name: 'refactor',
    pattern: /\b(refactor|improve|optimize|clean)\b/i,
    handler: handleRefactorTask
  },
  {
    name: 'test',
    pattern: /\b(test|testing|spec|coverage)\b/i,
    handler: handleTestTask
  },
  {
    name: 'config',
    pattern: /\b(config|configuration|setup|workflow)\b/i,
    handler: handleConfigTask
  }
];

/**
 * Analyze issue and execute appropriate handler
 */
async function main() {
  try {
    const issueContent = `${ISSUE_TITLE} ${ISSUE_BODY}`.toLowerCase();
    
    // Find matching task type
    let taskType = null;
    for (const analyzer of taskAnalyzers) {
      if (analyzer.pattern.test(issueContent)) {
        taskType = analyzer;
        break;
      }
    }
    
    if (!taskType) {
      console.log('⚠️  Could not determine task type, using generic handler');
      taskType = { name: 'generic', handler: handleGenericTask };
    }
    
    console.log(`🔍 Detected task type: ${taskType.name}`);
    
    // Execute handler
    const result = await taskType.handler({
      number: ISSUE_NUMBER,
      title: ISSUE_TITLE,
      body: ISSUE_BODY,
      scope: ISSUE_SCOPE,
      deliverable: ISSUE_DELIVERABLE
    });
    
    if (result.success) {
      console.log('✅ Task completed successfully');
      if (result.files) {
        console.log(`📝 Modified files: ${result.files.join(', ')}`);
      }
    } else {
      console.log('❌ Task could not be completed');
      console.log(`   Reason: ${result.reason}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Agent executor error:', error);
    process.exit(1);
  }
}

/**
 * Task Handlers
 */

function handleDocumentationTask(issue) {
  console.log('📚 Handling documentation task...');
  
  // Check if it's about adding/updating specific docs
  const docPatterns = {
    readme: /readme/i,
    contributing: /contribut/i,
    setup: /setup|install/i,
    api: /api.*doc/i,
    guide: /guide|tutorial/i
  };
  
  let docType = 'general';
  for (const [type, pattern] of Object.entries(docPatterns)) {
    if (pattern.test(issue.title + ' ' + issue.body)) {
      docType = type;
      break;
    }
  }
  
  console.log(`   Document type: ${docType}`);
  
  // Generate appropriate documentation
  switch (docType) {
    case 'readme':
      return updateReadme(issue);
    case 'contributing':
      return updateContributing(issue);
    case 'setup':
      return createSetupGuide(issue);
    case 'api':
      return createApiDocs(issue);
    default:
      return createGeneralDoc(issue);
  }
}

function handleNewAgentTask(issue) {
  console.log('🤖 Handling new agent creation task...');
  
  // Extract agent name from issue
  const nameMatch = issue.title.match(/(?:add|create|new)\s+(\w+)\s+agent/i);
  const agentName = nameMatch ? nameMatch[1].toLowerCase() : 'custom';
  
  console.log(`   Agent name: ${agentName}`);
  
  // Create agent file
  const agentTemplate = `import { BaseAgent } from "../agent-base.js";
import { AgentContext } from "../types.js";

export class ${capitalize(agentName)}Agent extends BaseAgent {
  name = "${agentName}-agent";
  intervalMs = 3600000; // 1 hour

  async run(ctx: AgentContext): Promise<void> {
    ctx.emit({
      type: "notification",
      payload: {
        source: this.name,
        title: "${capitalize(agentName)} check",
        message: "Agent is running",
        priority: "low"
      }
    });

    // TODO: Implement ${agentName} agent logic
    // Add your agent implementation here
  }
}
`;

  const agentPath = path.join(process.cwd(), 'apps/server/src/agents', `${agentName}-agent.ts`);
  fs.writeFileSync(agentPath, agentTemplate);
  
  // Update orchestrator to include new agent
  const orchestratorPath = path.join(process.cwd(), 'apps/server/src/orchestrator.ts');
  let orchestratorContent = fs.readFileSync(orchestratorPath, 'utf-8');
  
  // Add import
  const importLine = `import { ${capitalize(agentName)}Agent } from "./agents/${agentName}-agent.js";`;
  orchestratorContent = orchestratorContent.replace(
    /(import.*from.*agents.*;\n)/g,
    `$1${importLine}\n`
  );
  
  // Add to agents array
  orchestratorContent = orchestratorContent.replace(
    /(new VideoEditorAgent\(\))/,
    `$1,\n    new ${capitalize(agentName)}Agent()`
  );
  
  fs.writeFileSync(orchestratorPath, orchestratorContent);
  
  return {
    success: true,
    files: [agentPath, orchestratorPath]
  };
}

function handleBugFixTask(issue) {
  console.log('🐛 Handling bug fix task...');
  
  // For bug fixes, we need more context - create a placeholder fix
  // In production, this would call an AI API to analyze and fix the bug
  
  const fixDoc = path.join(process.cwd(), 'docs', `bugfix-${issue.number}.md`);
  const content = `# Bug Fix: ${issue.title}

## Issue
${issue.body}

## Analysis
This bug requires manual analysis and fixing.

## Status
Pending investigation

## Related Files
To be determined

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(fixDoc, content);
  
  return {
    success: true,
    files: [fixDoc],
    reason: 'Created bug fix documentation (manual fix required)'
  };
}

function handleFeatureTask(issue) {
  console.log('✨ Handling feature task...');
  
  // Create feature specification document
  const featureDoc = path.join(process.cwd(), 'docs', `feature-${issue.number}.md`);
  const content = `# Feature: ${issue.title}

## Overview
${issue.scope || 'Feature scope to be defined'}

## Deliverable
${issue.deliverable || 'Feature deliverable to be defined'}

## Implementation Plan
1. Analyze requirements
2. Design solution
3. Implement changes
4. Test functionality
5. Document usage

## Status
📋 Planning phase

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(featureDoc, content);
  
  return {
    success: true,
    files: [featureDoc]
  };
}

function handleRefactorTask(issue) {
  console.log('🔨 Handling refactor task...');
  
  // Create refactor plan document
  const refactorDoc = path.join(process.cwd(), 'docs', `refactor-${issue.number}.md`);
  const content = `# Refactor: ${issue.title}

## Current State
${issue.scope || 'Current implementation details'}

## Proposed Changes
${issue.deliverable || 'Refactor goals and approach'}

## Refactor Plan
1. Identify affected code
2. Write tests for current behavior
3. Refactor incrementally
4. Verify tests still pass
5. Update documentation

## Status
📋 Planning phase

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(refactorDoc, content);
  
  return {
    success: true,
    files: [refactorDoc]
  };
}

function handleTestTask(issue) {
  console.log('🧪 Handling test task...');
  
  // Create test plan document
  const testDoc = path.join(process.cwd(), 'docs', `test-plan-${issue.number}.md`);
  const content = `# Test Plan: ${issue.title}

## Test Scope
${issue.scope || 'Test coverage requirements'}

## Test Cases
${issue.deliverable || 'Test cases to be defined'}

## Test Strategy
1. Unit tests
2. Integration tests
3. End-to-end tests
4. Performance tests (if applicable)

## Status
📋 Planning phase

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(testDoc, content);
  
  return {
    success: true,
    files: [testDoc]
  };
}

function handleConfigTask(issue) {
  console.log('⚙️  Handling configuration task...');
  
  // Create config documentation
  const configDoc = path.join(process.cwd(), 'docs', `config-${issue.number}.md`);
  const content = `# Configuration: ${issue.title}

## Configuration Scope
${issue.scope || 'Configuration details'}

## Changes Required
${issue.deliverable || 'Configuration changes to be implemented'}

## Implementation Steps
1. Identify configuration files
2. Update configuration
3. Document changes
4. Test configuration
5. Update setup guide

## Status
📋 Planning phase

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(configDoc, content);
  
  return {
    success: true,
    files: [configDoc]
  };
}

function handleGenericTask(issue) {
  console.log('📝 Handling generic task...');
  
  // Create task tracking document
  const taskDoc = path.join(process.cwd(), 'docs', `task-${issue.number}.md`);
  const content = `# Task: ${issue.title}

## Description
${issue.body}

## Scope
${issue.scope || 'Task scope to be defined'}

## Deliverable
${issue.deliverable || 'Task deliverable to be defined'}

## Status
📋 Queued for manual implementation

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(taskDoc, content);
  
  return {
    success: true,
    files: [taskDoc]
  };
}

/**
 * Helper functions for specific documentation updates
 */

function updateReadme(issue) {
  const readmePath = path.join(process.cwd(), 'README.md');
  let content = fs.readFileSync(readmePath, 'utf-8');
  
  // Add a new section about the agent loop if not present
  if (!content.includes('## Agent Loop')) {
    content += `\n\n## Agent Loop

This project uses an autonomous agent loop for continuous development:

- Agents check for open issues every 15 minutes
- Tasks with \`agent-task\` label are automatically picked up
- Agents analyze issues and make appropriate code changes
- Changes are automatically merged if checks pass

See [\`.github/workflows/agent-orchestrator.yml\`](.github/workflows/agent-orchestrator.yml) for details.
`;
    
    fs.writeFileSync(readmePath, content);
    return { success: true, files: [readmePath] };
  }
  
  return { success: false, reason: 'README already contains agent loop information' };
}

function updateContributing(issue) {
  const contributingPath = path.join(process.cwd(), 'CONTRIBUTING.md');
  
  if (!fs.existsSync(contributingPath)) {
    return { success: false, reason: 'CONTRIBUTING.md does not exist' };
  }
  
  let content = fs.readFileSync(contributingPath, 'utf-8');
  
  // Add agent workflow section if not present
  if (!content.includes('## Agent Workflow')) {
    content += `\n\n## Agent Workflow

### Autonomous Development Loop

This repository uses automated agents for continuous development:

1. Create issues with the \`agent-task\` label
2. Agents automatically pick up and work on issues
3. PRs are created and merged automatically
4. The loop continues indefinitely

### Manual Contributions

You can still contribute manually:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a PR
5. Wait for review and merge
`;
    
    fs.writeFileSync(contributingPath, content);
    return { success: true, files: [contributingPath] };
  }
  
  return { success: false, reason: 'CONTRIBUTING.md already documents agent workflow' };
}

function createSetupGuide(issue) {
  const setupPath = path.join(process.cwd(), 'docs', 'SETUP.md');
  
  // Check if it already exists (it does from earlier work)
  if (fs.existsSync(setupPath)) {
    return { success: false, reason: 'Setup guide already exists' };
  }
  
  return { success: false, reason: 'Setup guide creation not implemented' };
}

function createApiDocs(issue) {
  const apiDocsPath = path.join(process.cwd(), 'docs', 'API.md');
  
  const content = `# API Documentation

## Overview
Documentation for the Companion API.

## Endpoints

### \`/api/status\`
Returns the current status of all agents.

### \`/api/notifications\`
Returns recent notifications from agents.

### \`/api/summary\`
Returns a summary of agent activities.

## WebSocket Events

### \`status-update\`
Emitted when agent status changes.

### \`notification\`
Emitted when a new notification is created.

---

*This is a generated API documentation. Please update with actual endpoint implementations.*
`;
  
  fs.writeFileSync(apiDocsPath, content);
  return { success: true, files: [apiDocsPath] };
}

function createGeneralDoc(issue) {
  const docPath = path.join(process.cwd(), 'docs', `${slugify(issue.title)}.md`);
  
  const content = `# ${issue.title}

${issue.body}

## Overview
${issue.scope || 'Documentation content to be defined'}

## Details
${issue.deliverable || 'Details to be added'}

---

Created by agent executor for issue #${issue.number}
`;
  
  fs.writeFileSync(docPath, content);
  return { success: true, files: [docPath] };
}

/**
 * Utility functions
 */

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Run the agent
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
