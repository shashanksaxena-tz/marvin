import { ToolDefinition } from '../types';
import { StateManager } from '../../state-manager';

/**
 * MARVIN state management tools.
 * These give the LLM agent the ability to read and write MARVIN state
 * (goals, todos, captures, current priorities).
 */

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const readStateTool: ToolDefinition = {
  name: 'read_state',
  description:
    'Read the current MARVIN state: goals, active priorities, open threads, and todos. ' +
    'Use this to understand what the user is working on before responding.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

export const addTodoTool: ToolDefinition = {
  name: 'add_todo',
  description: 'Add a new todo item to the active todo list.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The todo item text' },
      context: { type: 'string', description: 'Optional context for why this was added' },
    },
    required: ['text'],
  },
};

export const updateGoalTool: ToolDefinition = {
  name: 'update_goal',
  description: 'Update the status of an existing goal in the tracking table.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The goal name (must match an existing goal)' },
      status: { type: 'string', description: 'New status (e.g., "In Progress", "Done", "Blocked")' },
      notes: { type: 'string', description: 'Optional notes about the update' },
    },
    required: ['goal', 'status'],
  },
};

export const addCaptureTool: ToolDefinition = {
  name: 'add_capture',
  description: 'Save a note, idea, or piece of information to the inbox for later review.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The content to capture' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags/labels for the capture',
      },
    },
    required: ['text'],
  },
};

export const getCurrentDatetimeTool: ToolDefinition = {
  name: 'get_current_datetime',
  description: 'Get the current date and time. Useful for time-sensitive questions.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

export function createReadStateExecutor(stateManager: StateManager) {
  return async (_args: Record<string, any>): Promise<string> => {
    const [goals, current, todos] = await Promise.all([
      stateManager.getGoals(),
      stateManager.getCurrentState(),
      stateManager.getTodos(),
    ]);

    const parts: string[] = [];

    // Priorities
    if (current.priorities.length > 0) {
      parts.push('## Active Priorities');
      current.priorities.forEach((p, i) => parts.push(`${i + 1}. ${p}`));
      parts.push('');
    }

    // Open threads
    if (current.openThreads.length > 0) {
      parts.push('## Open Threads');
      current.openThreads.forEach((t) => parts.push(`- ${t}`));
      parts.push('');
    }

    // Goals
    if (goals.work.length > 0 || goals.personal.length > 0) {
      parts.push('## Goals');
      if (goals.work.length > 0) {
        parts.push('**Work:**');
        goals.work.forEach((g) => parts.push(`- ${g}`));
      }
      if (goals.personal.length > 0) {
        parts.push('**Personal:**');
        goals.personal.forEach((g) => parts.push(`- ${g}`));
      }
      parts.push('');
    }

    // Goal tracking
    if (goals.tracking.length > 0) {
      parts.push('## Goal Tracking');
      for (const g of goals.tracking) {
        parts.push(`- ${g.goal} [${g.type}]: ${g.status}${g.notes ? ` - ${g.notes}` : ''}`);
      }
      parts.push('');
    }

    // Active todos
    if (todos.active.length > 0) {
      parts.push('## Active Todos');
      for (const t of todos.active) {
        parts.push(`- ${t.task} (added ${t.added})${t.context ? ` [${t.context}]` : ''}`);
      }
      parts.push('');
    }

    // Follow-ups
    if (todos.followUps.length > 0) {
      parts.push('## Follow-ups');
      for (const f of todos.followUps) {
        parts.push(`- ${f.item} (review: ${f.reviewDate})${f.notes ? ` - ${f.notes}` : ''}`);
      }
      parts.push('');
    }

    // Recent context
    if (current.recentContext.length > 0) {
      parts.push('## Recent Context');
      current.recentContext.forEach((c) => parts.push(`- ${c}`));
    }

    return parts.length > 0 ? parts.join('\n') : 'No state data found. State files may not be initialized yet.';
  };
}

export function createAddTodoExecutor(stateManager: StateManager) {
  return async (args: Record<string, any>): Promise<string> => {
    const text = String(args.text || '').trim();
    if (!text) {
      return 'Error: No todo text provided.';
    }
    const context = String(args.context || 'Added via MARVIN').trim();

    await stateManager.addTodo(text, context);
    return `Added todo: "${text}"`;
  };
}

export function createUpdateGoalExecutor(stateManager: StateManager) {
  return async (args: Record<string, any>): Promise<string> => {
    const goal = String(args.goal || '').trim();
    const status = String(args.status || '').trim();
    const notes = String(args.notes || '').trim();

    if (!goal) return 'Error: No goal name provided.';
    if (!status) return 'Error: No status provided.';

    try {
      await stateManager.updateGoal(goal, status, notes);
      return `Updated goal "${goal}" to status: ${status}`;
    } catch (err) {
      return `Error updating goal: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}

export function createAddCaptureExecutor(stateManager: StateManager) {
  return async (args: Record<string, any>): Promise<string> => {
    const text = String(args.text || '').trim();
    if (!text) {
      return 'Error: No capture text provided.';
    }

    const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
    const label = tags.length > 0 ? tags.join(', ') : 'Capture';

    await stateManager.addToInbox({
      content: text,
      label,
    });
    return `Captured: "${text}"${tags.length > 0 ? ` [${tags.join(', ')}]` : ''}`;
  };
}

export function createGetCurrentDatetimeExecutor() {
  return async (_args: Record<string, any>): Promise<string> => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return `Current date and time: ${date}, ${time} (${timezone})`;
  };
}
