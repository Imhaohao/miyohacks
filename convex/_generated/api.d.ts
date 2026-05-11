/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentContacts from "../agentContacts.js";
import type * as agentShortlists from "../agentShortlists.js";
import type * as agents from "../agents.js";
import type * as auctionSelection from "../auctionSelection.js";
import type * as auctions from "../auctions.js";
import type * as bids from "../bids.js";
import type * as broker from "../broker.js";
import type * as contextEnrichment from "../contextEnrichment.js";
import type * as discoveredSpecialists from "../discoveredSpecialists.js";
import type * as disputes from "../disputes.js";
import type * as escrow from "../escrow.js";
import type * as executionPlans from "../executionPlans.js";
import type * as lifecycle from "../lifecycle.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as productContext from "../productContext.js";
import type * as productContextActions from "../productContextActions.js";
import type * as reputation from "../reputation.js";
import type * as reputationDimensions from "../reputationDimensions.js";
import type * as seed from "../seed.js";
import type * as taskContexts from "../taskContexts.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentContacts: typeof agentContacts;
  agentShortlists: typeof agentShortlists;
  agents: typeof agents;
  auctionSelection: typeof auctionSelection;
  auctions: typeof auctions;
  bids: typeof bids;
  broker: typeof broker;
  contextEnrichment: typeof contextEnrichment;
  discoveredSpecialists: typeof discoveredSpecialists;
  disputes: typeof disputes;
  escrow: typeof escrow;
  executionPlans: typeof executionPlans;
  lifecycle: typeof lifecycle;
  payments: typeof payments;
  planning: typeof planning;
  productContext: typeof productContext;
  productContextActions: typeof productContextActions;
  reputation: typeof reputation;
  reputationDimensions: typeof reputationDimensions;
  seed: typeof seed;
  taskContexts: typeof taskContexts;
  tasks: typeof tasks;
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
