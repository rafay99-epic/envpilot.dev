import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "../../_generated/server";
import { BROWSABLE_TABLES, requireAdmin } from "./auth";

export const updateTableRow = mutation({
  args: {
    tableName: v.string(),
    id: v.string(),
    fields: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const parsedFields = JSON.parse(args.fields);
    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.id as any, parsedFields);
  },
});

export const deleteTableRow = mutation({
  args: {
    tableName: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.delete(args.id as any);
  },
});

export const browseTablePaginated = query({
  args: {
    tableName: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }
    return await (ctx.db.query(args.tableName as any) as any)
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
