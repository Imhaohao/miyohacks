// AUTO-GENERATED STUB — replaced by `npx convex dev`.
// Lets the rest of the project typecheck before Convex codegen runs.

import { GenericId } from "convex/values";

export type Id<TableName extends string> = GenericId<TableName>;

export type Doc<TableName extends string> = {
  _id: Id<TableName>;
  _creationTime: number;
  [key: string]: unknown;
};

export type DataModel = Record<string, unknown>;
