import fs from 'fs/promises';
import path from 'path';

// --- Types ---

export interface GoalEntry {
  goal: string;
  type: string;
  status: string;
  notes: string;
}

export interface Goals {
  work: string[];
  personal: string[];
  tracking: GoalEntry[];
  raw: string;
}

export interface TodoEntry {
  task: string;
  added: string;
  context: string;
}

export interface CompletedTodoEntry {
  task: string;
  completed: string;
  notes: string;
}

export interface FollowUpEntry {
  item: string;
  reviewDate: string;
  notes: string;
}

export interface Todos {
  active: TodoEntry[];
  completed: CompletedTodoEntry[];
  followUps: FollowUpEntry[];
  raw: string;
}

export interface CurrentState {
  priorities: string[];
  openThreads: string[];
  recentContext: string[];
  raw: string;
}

export interface InboxItem {
  content: string;
  connectedTo?: string;
  label?: string;
}

// --- Helpers ---

/**
 * Parse a markdown table into an array of row objects.
 * Expects the first row to be headers and the second to be the separator.
 */
function parseMarkdownTable(tableText: string): Record<string, string>[] {
  const lines = tableText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));

  if (lines.length < 3) return []; // header + separator + at least one data row

  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);

  // Skip separator line (index 1)
  const rows: Record<string, string>[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length === 0 || cells.every((c) => !c || c === '*None yet*')) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.toLowerCase()] = cells[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Extract bullet list items from a markdown section.
 */
function parseBulletList(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l && l !== 'None yet');
}

/**
 * Extract numbered list items from a markdown section.
 */
function parseNumberedList(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Extract content between a heading and the next heading or end of text.
 */
function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function nowTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// --- Service ---

/**
 * StateManager reads and writes MARVIN state files (markdown) in the local repo.
 */
export class StateManager {
  private dirty = false;

  constructor(private readonly repoPath: string) {}

  /**
   * Returns whether any state files have been written since the last check.
   * Resets the flag on read.
   */
  hasChanged(): boolean {
    const changed = this.dirty;
    this.dirty = false;
    return changed;
  }

  /**
   * Convenience: return just the active priority strings from current.md.
   * Satisfies IStateManager.getPriorities().
   */
  async getPriorities(): Promise<string[]> {
    const state = await this.getCurrentState();
    return state.priorities;
  }

  // --- Reading ---

  async getGoals(): Promise<Goals> {
    const raw = await this.readFile('state/goals.md');

    const workSection = extractSection(raw, 'Work Goals');
    const personalSection = extractSection(raw, 'Personal Goals');
    const trackingSection = extractSection(raw, 'Tracking');

    const trackingRows = parseMarkdownTable(trackingSection);
    const tracking: GoalEntry[] = trackingRows.map((r) => ({
      goal: r['goal'] || '',
      type: r['type'] || '',
      status: r['status'] || '',
      notes: r['notes'] || '',
    }));

    return {
      work: parseBulletList(workSection),
      personal: parseBulletList(personalSection),
      tracking,
      raw,
    };
  }

  async getTodos(): Promise<Todos> {
    const raw = await this.readFile('state/todos.md');

    const activeSection = extractSection(raw, 'Active');
    const completedSection = extractSection(raw, 'Completed');
    const followUpSection = extractSection(raw, 'Follow-ups');

    const activeRows = parseMarkdownTable(activeSection);
    const active: TodoEntry[] = activeRows.map((r) => ({
      task: r['task'] || '',
      added: r['added'] || '',
      context: r['context'] || '',
    }));

    const completedRows = parseMarkdownTable(completedSection);
    const completed: CompletedTodoEntry[] = completedRows.map((r) => ({
      task: r['task'] || '',
      completed: r['completed'] || '',
      notes: r['notes'] || '',
    }));

    const followUpRows = parseMarkdownTable(followUpSection);
    const followUps: FollowUpEntry[] = followUpRows.map((r) => ({
      item: r['item'] || '',
      reviewDate: r['review date'] || '',
      notes: r['notes'] || '',
    }));

    return { active, completed, followUps, raw };
  }

  async getCurrentState(): Promise<CurrentState> {
    const raw = await this.readFile('state/current.md');

    const prioritySection = extractSection(raw, 'Active Priorities');
    const threadSection = extractSection(raw, 'Open Threads');
    const contextSection = extractSection(raw, 'Recent Context');

    return {
      priorities: parseNumberedList(prioritySection),
      openThreads: parseBulletList(threadSection),
      recentContext: parseBulletList(contextSection),
      raw,
    };
  }

  // --- Writing ---

  async addTodo(task: string, context: string): Promise<void> {
    const raw = await this.readFile('state/todos.md');

    // Find the Active table and insert a new row after the separator line
    const lines = raw.split('\n');
    let insertIdx = -1;
    let inActive = false;
    let separatorSeen = false;

    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Active/.test(lines[i].trim())) {
        inActive = true;
        continue;
      }
      if (inActive && /^##\s/.test(lines[i].trim())) {
        // Hit next section
        break;
      }
      if (inActive && lines[i].trim().startsWith('|') && lines[i].includes('---')) {
        separatorSeen = true;
        continue;
      }
      if (inActive && separatorSeen && lines[i].trim().startsWith('|')) {
        // Check if this is an empty placeholder row
        const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.every((c) => !c)) {
          // Replace this empty row with our new entry
          lines[i] = `| ${task} | ${today()} | ${context} |`;
          insertIdx = i;
          break;
        }
        insertIdx = i;
      }
    }

    if (insertIdx === -1 && separatorSeen) {
      // No data rows found after separator; find the separator and insert after it
      for (let i = 0; i < lines.length; i++) {
        if (inActive && lines[i].trim().startsWith('|') && lines[i].includes('---')) {
          lines.splice(i + 1, 0, `| ${task} | ${today()} | ${context} |`);
          break;
        }
        if (/^##\s+Active/.test(lines[i].trim())) inActive = true;
      }
    } else if (insertIdx !== -1) {
      // If we didn't replace an empty row, insert after the last data row
      const cells = lines[insertIdx].split('|').map((c) => c.trim()).filter(Boolean);
      if (!(cells.length >= 1 && cells[0] === task)) {
        lines.splice(insertIdx + 1, 0, `| ${task} | ${today()} | ${context} |`);
      }
    }

    // Update the "Last updated" date
    const updatedContent = lines.join('\n').replace(
      /\*\*Last updated\*\*:\s*.*/,
      `**Last updated**: ${today()}`
    );

    await this.writeFile('state/todos.md', updatedContent);
  }

  async completeTodo(task: string, notes: string): Promise<void> {
    const raw = await this.readFile('state/todos.md');
    const lines = raw.split('\n');

    // Find and remove the task from the Active section
    let removed = false;
    let inActive = false;

    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Active/.test(lines[i].trim())) {
        inActive = true;
        continue;
      }
      if (inActive && /^##\s/.test(lines[i].trim())) {
        break;
      }
      if (inActive && lines[i].trim().startsWith('|') && !lines[i].includes('---') && !lines[i].toLowerCase().includes('task')) {
        const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
        if (cells[0] && cells[0].toLowerCase() === task.toLowerCase()) {
          lines.splice(i, 1);
          removed = true;
          break;
        }
      }
    }

    if (!removed) {
      throw new Error(`Todo not found in active list: "${task}"`);
    }

    // Add to Completed section
    let inCompleted = false;
    let completedInsertIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Completed/.test(lines[i].trim())) {
        inCompleted = true;
        continue;
      }
      if (inCompleted && /^##\s/.test(lines[i].trim())) {
        break;
      }
      if (inCompleted && lines[i].trim().startsWith('|') && !lines[i].includes('---') && !lines[i].toLowerCase().includes('task')) {
        const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.every((c) => !c || c === '*None yet*')) {
          // Replace placeholder
          lines[i] = `| ${task} | ${today()} | ${notes} |`;
          completedInsertIdx = i;
          break;
        }
        completedInsertIdx = i;
      }
    }

    if (completedInsertIdx === -1) {
      // Find the separator in the Completed section and insert after
      inCompleted = false;
      for (let i = 0; i < lines.length; i++) {
        if (/^##\s+Completed/.test(lines[i].trim())) {
          inCompleted = true;
          continue;
        }
        if (inCompleted && lines[i].trim().startsWith('|') && lines[i].includes('---')) {
          lines.splice(i + 1, 0, `| ${task} | ${today()} | ${notes} |`);
          break;
        }
      }
    } else {
      // If we didn't replace the placeholder, insert after last row
      const cells = lines[completedInsertIdx].split('|').map((c) => c.trim()).filter(Boolean);
      if (!(cells.length >= 1 && cells[0].toLowerCase() === task.toLowerCase())) {
        lines.splice(completedInsertIdx + 1, 0, `| ${task} | ${today()} | ${notes} |`);
      }
    }

    const updatedContent = lines.join('\n').replace(
      /\*\*Last updated\*\*:\s*.*/,
      `**Last updated**: ${today()}`
    );

    await this.writeFile('state/todos.md', updatedContent);
  }

  async updateGoal(goal: string, status: string, notes: string): Promise<void> {
    const raw = await this.readFile('state/goals.md');
    const lines = raw.split('\n');

    let updated = false;
    let inTracking = false;

    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Tracking/.test(lines[i].trim())) {
        inTracking = true;
        continue;
      }
      if (inTracking && /^##\s/.test(lines[i].trim())) {
        break;
      }
      if (inTracking && lines[i].trim().startsWith('|') && !lines[i].includes('---') && !lines[i].toLowerCase().includes('goal')) {
        const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
        if (cells[0] && cells[0].toLowerCase() === goal.toLowerCase()) {
          // Preserve existing type
          const type = cells[1] || '';
          lines[i] = `| ${cells[0]} | ${type} | ${status} | ${notes} |`;
          updated = true;
          break;
        }
      }
    }

    if (!updated) {
      throw new Error(`Goal not found in tracking table: "${goal}"`);
    }

    const updatedContent = lines.join('\n').replace(
      /Last updated:\s*.*/,
      `Last updated: ${today()}`
    );

    await this.writeFile('state/goals.md', updatedContent);
  }

  async addToInbox(item: InboxItem): Promise<void> {
    const inboxRelPath = 'content/inbox.md';
    const dateStr = today();
    const timeStr = nowTime();
    const label = item.label || 'Capture';

    const entry = [
      `### ${timeStr} - ${label}`,
      item.content,
      ...(item.connectedTo ? [`Connected to: ${item.connectedTo}`] : []),
      '',
      '---',
      '',
    ].join('\n');

    let existing = '';
    try {
      existing = await this.readFile(inboxRelPath);
    } catch {
      // File doesn't exist yet
      existing = '';
    }

    if (!existing) {
      const content = `# Inbox\n\n## ${dateStr}\n\n${entry}`;
      await this.writeFile(inboxRelPath, content);
      return;
    }

    // Check if today's date section exists
    if (existing.includes(`## ${dateStr}`)) {
      const updated = existing.replace(
        `## ${dateStr}\n`,
        `## ${dateStr}\n\n${entry}`
      );
      await this.writeFile(inboxRelPath, updated);
    } else {
      // Add new date section at the top (after # Inbox heading)
      const updated = existing.replace(
        '# Inbox\n',
        `# Inbox\n\n## ${dateStr}\n\n${entry}`
      );
      await this.writeFile(inboxRelPath, updated);
    }
  }

  async getFullContext(): Promise<string> {
    const [goalsRaw, todosRaw, currentRaw] = await Promise.all([
      this.readFile('state/goals.md').catch(() => ''),
      this.readFile('state/todos.md').catch(() => ''),
      this.readFile('state/current.md').catch(() => ''),
    ]);

    return [
      '=== CURRENT STATE ===',
      currentRaw,
      '',
      '=== GOALS ===',
      goalsRaw,
      '',
      '=== TODOS ===',
      todosRaw,
    ].join('\n');
  }

  // --- File I/O ---

  private async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.repoPath, relativePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  private async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.repoPath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    this.dirty = true;
  }
}
