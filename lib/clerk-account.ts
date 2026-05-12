import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { accountIdForClerkUserId } from "@/lib/current-user";

export interface ClerkAccountIdentity {
  clerk_user_id: string;
  account_id: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
}

export async function currentClerkAccount(): Promise<ClerkAccountIdentity | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;
  const displayName =
    user?.fullName ?? user?.username ?? user?.firstName ?? undefined;
  return {
    clerk_user_id: userId,
    account_id: accountIdForClerkUserId(userId),
    email,
    display_name: displayName,
    avatar_url: user?.imageUrl,
  };
}
