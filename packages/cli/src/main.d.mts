/**
 * Type declarations for the `arbor` CLI's plain-ESM entry point.
 * Hand-written because the source is .mjs (so the bin shim works
 * without a build step) but consumers may still want IntelliSense.
 *
 * Mirrors the public surface of ./main.mjs.
 */

export type CliFlags = Record<string, string | true>;

export interface CliArgs {
  positional: string[];
  flags: CliFlags;
}

export interface CliSpecialist {
  agent_id: string;
  sponsor?: string;
  reputation_score?: number;
  market_ready?: boolean;
  market_ready_reason?: string | null;
  [key: string]: unknown;
}

export interface CliClient {
  listSpecialists: (taskType?: string) => Promise<CliSpecialist[]>;
  postTask: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getTask: (taskId: string) => Promise<Record<string, unknown>>;
  raiseDispute: (
    taskId: string,
    reason: string,
  ) => Promise<Record<string, unknown>>;
}

export interface MakeClientOptions {
  baseUrl: string;
  agentId: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export function run(argv: string[]): Promise<number>;

export const __testables: {
  parseArgs: (argv: string[]) => CliArgs;
  makeClient: (opts: MakeClientOptions) => CliClient;
  awaitTask: (
    client: CliClient,
    taskId: string,
    opts?: { pollMs?: number; timeoutMs?: number },
  ) => Promise<Record<string, unknown>>;
  cmdMarketList: (client: CliClient, args: CliArgs) => Promise<number>;
  cmdMarketPost: (client: CliClient, args: CliArgs) => Promise<number>;
  cmdTaskGet: (client: CliClient, args: CliArgs) => Promise<number>;
  cmdTaskDispute: (client: CliClient, args: CliArgs) => Promise<number>;
  TOP_HELP: string;
  MARKET_HELP: string;
  TASK_HELP: string;
};
