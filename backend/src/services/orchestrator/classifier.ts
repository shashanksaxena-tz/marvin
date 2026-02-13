import { MessageCategory, ClassificationResult, OrchestratorInput } from './types';

/**
 * Lightweight, zero-LLM-call classifier.
 * Uses keyword heuristics and input properties to classify messages.
 * This avoids burning a rate-limited API call just to classify.
 */
export class MessageClassifier {

  classify(input: OrchestratorInput): ClassificationResult {
    // Forced category
    if (input.category) {
      return {
        category: input.category,
        confidence: 1.0,
        requiresTools: this.categoryNeedsTools(input.category),
        hasImage: !!input.contentContext?.imageBase64,
      };
    }

    const text = input.text.toLowerCase().trim();
    const hasImage = !!input.contentContext?.imageBase64;
    const hasUrl = !!input.contentContext?.url || /https?:\/\//.test(text);

    // Vision: image is present
    if (hasImage) {
      return {
        category: 'vision',
        confidence: 0.95,
        requiresTools: false,
        hasImage: true,
      };
    }

    // Web search: needs current info, has URLs, asks about weather/news/prices
    if (this.needsWebSearch(text) || hasUrl) {
      return {
        category: 'web_search',
        confidence: 0.8,
        requiresTools: true,
        hasImage: false,
      };
    }

    // State update: mentions todos, goals, progress, reminders
    if (this.isStateUpdate(text)) {
      return {
        category: 'state_update',
        confidence: 0.85,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Code task: code keywords, technical questions
    if (this.isCodeTask(text)) {
      return {
        category: 'code_task',
        confidence: 0.75,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Complex reasoning: long messages, analysis requests, planning
    if (this.isComplexReasoning(text)) {
      return {
        category: 'complex_reasoning',
        confidence: 0.7,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Default: simple chat
    return {
      category: 'simple_chat',
      confidence: 0.6,
      requiresTools: false,
      hasImage: false,
    };
  }

  private needsWebSearch(text: string): boolean {
    const searchPatterns = [
      /what('s| is) the (latest|current|recent)/,
      /search for/,
      /look up/,
      /find (me |)(info|information|details|articles)/,
      /(today'?s?|current|latest) (news|weather|price|stock|score)/,
      /what happened/,
      /who (won|is winning)/,
      /when (is|does|did)/,
    ];
    return searchPatterns.some(p => p.test(text));
  }

  private isStateUpdate(text: string): boolean {
    const statePatterns = [
      /add (a |)(todo|task|reminder)/,
      /remind me/,
      /(update|change|set) (my |)(goal|status|priority)/,
      /i (did|finished|completed|done with)/,
      /mark .* (as |)(done|complete)/,
      /capture (this|that)/,
      /save (this|that)/,
      /note (this|that) down/,
    ];
    return statePatterns.some(p => p.test(text));
  }

  private isCodeTask(text: string): boolean {
    const codePatterns = [
      /```/,
      /write (a |)(function|code|script|program|class)/,
      /fix (this |the |my )?(bug|error|issue|code)/,
      /how (do i|to) (implement|code|program|build)/,
      /(explain|debug|refactor) (this |the )?(code|function|class)/,
      /what does this code/,
      /(typescript|javascript|python|java|rust|go|sql)\b/,
      /api (endpoint|route|call)/,
    ];
    return codePatterns.some(p => p.test(text));
  }

  private isComplexReasoning(text: string): boolean {
    // Long messages or explicit analysis/planning requests
    if (text.length > 500) return true;

    const complexPatterns = [
      /analyze/,
      /compare (and contrast)?/,
      /pros and cons/,
      /help me (think|plan|decide|figure out)/,
      /what (should|would) (i|you|we)/,
      /break (this |it )down/,
      /step by step/,
      /trade.?offs?/,
    ];
    return complexPatterns.some(p => p.test(text));
  }

  private categoryNeedsTools(category: MessageCategory): boolean {
    return category === 'web_search';
  }
}
