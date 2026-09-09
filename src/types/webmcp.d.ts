export {};

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: {
        name: string;
        title?: string;
        description: string;
        inputSchema: Record<string, unknown>;
        execute(input: unknown): unknown | Promise<unknown>;
        annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      }, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
  interface Navigator {
    userAgentData?: { platform?: string };
  }
}
