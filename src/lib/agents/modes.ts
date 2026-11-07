export const AGENT_MODE_IDS = [
  'general',
  'research',
  'coding',
  'business',
  'writing',
  'data',
  'document',
  'multimodal',
  'planner',
] as const;
export type AgentModeId = (typeof AGENT_MODE_IDS)[number];

export type AgentMode = {
  id: AgentModeId;
  name: string;
  description: string;
  /** Mode-specific behaviour. Combined with the shared safety policy at runtime. */
  instructions: string;
  /** Tool names this mode may request. The registry still enforces enablement and approval. */
  allowedTools: string[];
  temperature: number;
  /** Mode always builds an explicit plan before acting. */
  alwaysPlan: boolean;
};

export const AGENT_MODES: Record<AgentModeId, AgentMode> = {
  general: {
    id: 'general',
    name: 'General Assistant',
    description: 'Everyday questions, explanations, and problem solving.',
    instructions:
      'Answer clearly and concisely. Use the calculator for arithmetic and the datetime tool for dates. Ask a clarifying question when the request is ambiguous.',
    allowedTools: ['calculator', 'datetime', 'notes', 'tasks', 'memory_search', 'memory_save'],
    temperature: 0.5,
    alwaysPlan: false,
  },
  research: {
    id: 'research',
    name: 'Research Agent',
    description: 'Research topics through web search, compare evidence, and summarise findings.',
    instructions:
      'Search before answering factual or current questions. Cite sources as [n] using the numbered list from the web_search tool. Clearly separate sourced facts from your own explanation (label the latter "Analysis:"). Say when sources disagree or are insufficient.',
    allowedTools: ['web_search', 'document_reader', 'calculator', 'datetime', 'notes', 'memory_search'],
    temperature: 0.3,
    alwaysPlan: false,
  },
  coding: {
    id: 'coding',
    name: 'Coding Agent',
    description: 'Write, explain, review and debug code.',
    instructions:
      'Produce correct, idiomatic code in fenced blocks with the language tag. For debugging, identify the root cause first, then the fix, then explain why. Use the code_assistant tool for static analysis of JavaScript snippets. Never claim code was executed; you cannot run it.',
    allowedTools: ['code_assistant', 'calculator', 'notes', 'memory_search'],
    temperature: 0.2,
    alwaysPlan: false,
  },
  business: {
    id: 'business',
    name: 'Business Agent',
    description: 'Business plans, reports, marketing ideas, support drafts and data analysis.',
    instructions:
      'Structure outputs as business artefacts: executive summary, assumptions, options, risks, next steps. Use data_analysis for uploaded tabular data and calculator for financial figures. Label estimates explicitly.',
    allowedTools: ['data_analysis', 'document_reader', 'calculator', 'tasks', 'datetime', 'web_search', 'memory_search'],
    temperature: 0.5,
    alwaysPlan: false,
  },
  writing: {
    id: 'writing',
    name: 'Writing Agent',
    description: 'Articles, emails, summaries, proposals and professional documents.',
    instructions:
      'Match the requested tone and audience. Provide a polished draft, then at most three short notes on alternatives. Keep factual claims tied to the user\'s material.',
    allowedTools: ['document_reader', 'notes', 'datetime', 'memory_search'],
    temperature: 0.7,
    alwaysPlan: false,
  },
  data: {
    id: 'data',
    name: 'Data Analyst',
    description: 'Analyse CSV and spreadsheet data, calculate metrics and generate charts.',
    instructions:
      'Use data_analysis on the attached dataset before drawing conclusions. Quote exact figures from the tool output. Mention missing values and limitations. Generate charts when they help explain the result.',
    allowedTools: ['data_analysis', 'calculator', 'document_reader'],
    temperature: 0.2,
    alwaysPlan: false,
  },
  document: {
    id: 'document',
    name: 'Document Agent',
    description: 'Read PDF and document files, summarise them and answer questions using their content.',
    instructions:
      'Answer strictly from the document excerpts retrieved with document_reader, quoting or citing the chunk numbers. If the document does not contain the answer, say so.',
    allowedTools: ['document_reader', 'notes', 'memory_search'],
    temperature: 0.2,
    alwaysPlan: false,
  },
  multimodal: {
    id: 'multimodal',
    name: 'Multimodal Agent',
    description: 'Analyse supported images using a configured vision model.',
    instructions:
      'Describe only what is visible in the image. Separate what you can see with confidence from what is uncertain. If no vision model is configured, say that image analysis is unavailable.',
    allowedTools: ['image_analysis', 'document_reader', 'notes'],
    temperature: 0.3,
    alwaysPlan: false,
  },
  planner: {
    id: 'planner',
    name: 'Planner Agent',
    description: 'Break complex requests into actionable steps and track progress.',
    instructions:
      'Decompose the goal into concrete, ordered steps with owners and done criteria. Offer to create the tasks with the tasks tool. Track progress against the plan in later turns.',
    allowedTools: ['tasks', 'notes', 'datetime', 'calculator', 'memory_search'],
    temperature: 0.4,
    alwaysPlan: true,
  },
};

export function getMode(id: string): AgentMode {
  return AGENT_MODES[id as AgentModeId] ?? AGENT_MODES.general;
}
