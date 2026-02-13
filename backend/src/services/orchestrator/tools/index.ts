import { ToolDefinition } from '../types';
import { StateManager } from '../../state-manager';
import { ContentFetcherService } from '../../content-fetcher';

import { webSearchTool, executeWebSearch } from './web-search';
import {
  readStateTool,
  addTodoTool,
  updateGoalTool,
  addCaptureTool,
  getCurrentDatetimeTool,
  createReadStateExecutor,
  createAddTodoExecutor,
  createUpdateGoalExecutor,
  createAddCaptureExecutor,
  createGetCurrentDatetimeExecutor,
} from './state-tools';
import { fetchUrlTool, createFetchUrlExecutor } from './content-fetch';

/**
 * Interface expected from the orchestrator for tool registration.
 * Matches the Orchestrator.registerTool() signature.
 */
interface ToolRegistry {
  registerTool(
    definition: ToolDefinition,
    executor: (args: Record<string, any>) => Promise<string>,
  ): void;
}

/**
 * Register all available tools with the orchestrator.
 *
 * @param orchestrator - The orchestrator instance (or anything with registerTool)
 * @param stateManager - MARVIN state manager for reading/writing state files
 * @param contentFetcher - Content fetcher service for URL extraction
 */
export function registerTools(
  orchestrator: ToolRegistry,
  stateManager: StateManager,
  contentFetcher: ContentFetcherService,
): void {
  // Web search (fallback for non-Gemini providers)
  orchestrator.registerTool(webSearchTool, executeWebSearch);

  // State tools
  orchestrator.registerTool(readStateTool, createReadStateExecutor(stateManager));
  orchestrator.registerTool(addTodoTool, createAddTodoExecutor(stateManager));
  orchestrator.registerTool(updateGoalTool, createUpdateGoalExecutor(stateManager));
  orchestrator.registerTool(addCaptureTool, createAddCaptureExecutor(stateManager));
  orchestrator.registerTool(getCurrentDatetimeTool, createGetCurrentDatetimeExecutor());

  // Content fetching
  orchestrator.registerTool(fetchUrlTool, createFetchUrlExecutor(contentFetcher));
}

// Re-export tool definitions for use by providers or tests
export {
  webSearchTool,
  executeWebSearch,
  readStateTool,
  addTodoTool,
  updateGoalTool,
  addCaptureTool,
  getCurrentDatetimeTool,
  fetchUrlTool,
};
