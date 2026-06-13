/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as a2aAuth from "../a2aAuth.js";
import type * as a2aNonces from "../a2aNonces.js";
import type * as a2aOutboundKeys from "../a2aOutboundKeys.js";
import type * as a2aTaskRuns from "../a2aTaskRuns.js";
import type * as agentKeys from "../agentKeys.js";
import type * as agentKeysAdmin from "../agentKeysAdmin.js";
import type * as agentToolCalls from "../agentToolCalls.js";
import type * as agents from "../agents.js";
import type * as auctions from "../auctions.js";
import type * as bidProbes from "../bidProbes.js";
import type * as bids from "../bids.js";
import type * as contextEnrichment from "../contextEnrichment.js";
import type * as crons from "../crons.js";
import type * as demos from "../demos.js";
import type * as discoveredSpecialists from "../discoveredSpecialists.js";
import type * as disputes from "../disputes.js";
import type * as escalations from "../escalations.js";
import type * as escrow from "../escrow.js";
import type * as hiveData from "../hiveData.js";
import type * as hiveEvalGate from "../hiveEvalGate.js";
import type * as hiveEvaluator from "../hiveEvaluator.js";
import type * as hiveOrchestrator from "../hiveOrchestrator.js";
import type * as hivePlanner from "../hivePlanner.js";
import type * as hiveRegistry from "../hiveRegistry.js";
import type * as hiveRegistryData from "../hiveRegistryData.js";
import type * as hiveRouter from "../hiveRouter.js";
import type * as intake from "../intake.js";
import type * as lifecycle from "../lifecycle.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as productContext from "../productContext.js";
import type * as productContextActions from "../productContextActions.js";
import type * as reputation from "../reputation.js";
import type * as reputationDimensions from "../reputationDimensions.js";
import type * as scratchpad from "../scratchpad.js";
import type * as scratchpadActions from "../scratchpadActions.js";
import type * as seed from "../seed.js";
import type * as settlement from "../settlement.js";
import type * as settlementData from "../settlementData.js";
import type * as taskContexts from "../taskContexts.js";
import type * as tasks from "../tasks.js";
import type * as userContext from "../userContext.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  a2aAuth: typeof a2aAuth;
  a2aNonces: typeof a2aNonces;
  a2aOutboundKeys: typeof a2aOutboundKeys;
  a2aTaskRuns: typeof a2aTaskRuns;
  agentKeys: typeof agentKeys;
  agentKeysAdmin: typeof agentKeysAdmin;
  agentToolCalls: typeof agentToolCalls;
  agents: typeof agents;
  auctions: typeof auctions;
  bidProbes: typeof bidProbes;
  bids: typeof bids;
  contextEnrichment: typeof contextEnrichment;
  crons: typeof crons;
  demos: typeof demos;
  discoveredSpecialists: typeof discoveredSpecialists;
  disputes: typeof disputes;
  escalations: typeof escalations;
  escrow: typeof escrow;
  hiveData: typeof hiveData;
  hiveEvalGate: typeof hiveEvalGate;
  hiveEvaluator: typeof hiveEvaluator;
  hiveOrchestrator: typeof hiveOrchestrator;
  hivePlanner: typeof hivePlanner;
  hiveRegistry: typeof hiveRegistry;
  hiveRegistryData: typeof hiveRegistryData;
  hiveRouter: typeof hiveRouter;
  intake: typeof intake;
  lifecycle: typeof lifecycle;
  payments: typeof payments;
  planning: typeof planning;
  productContext: typeof productContext;
  productContextActions: typeof productContextActions;
  reputation: typeof reputation;
  reputationDimensions: typeof reputationDimensions;
  scratchpad: typeof scratchpad;
  scratchpadActions: typeof scratchpadActions;
  seed: typeof seed;
  settlement: typeof settlement;
  settlementData: typeof settlementData;
  taskContexts: typeof taskContexts;
  tasks: typeof tasks;
  userContext: typeof userContext;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
