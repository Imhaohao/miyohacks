import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { currentClerkAccount } from "@/lib/clerk-account";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function GET() {
  try {
    const account = await currentClerkAccount();
    if (!account) return jsonError("unauthorized", 401);

    const client = convex();
    const ensured = await client.mutation(api.accounts.ensureByClerkUser, {
      server_secret: paymentServerSecret(),
      clerk_user_id: account.clerk_user_id,
      email: account.email,
      display_name: account.display_name,
      avatar_url: account.avatar_url,
    });
    const [productContext, wallet] = await Promise.all([
      client.query(api.productContext.latest, {
        owner_id: account.account_id,
      }),
      client.query(api.payments.walletForBuyer, {
        buyer_id: account.account_id,
      }),
    ]);

    return jsonOk({
      account_id: account.account_id,
      project_id: ensured.default_project._id,
      project: ensured.default_project,
      product_context: productContext,
      wallet,
      trial: ensured.trial,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
