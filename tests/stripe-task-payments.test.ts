import assert from "node:assert/strict";
import test from "node:test";
import {
  refundUnusedBudget,
  refundFullTaskCharge,
  transferAgentNetOrPayable,
  type StripeLike,
} from "../lib/stripe-task-payments";
import {
  ARBOR_TASK_FUNDING_PRODUCT,
  taskFundingCheckoutMetadata,
  taskTransferGroup,
} from "../lib/payments";

interface FakeStripe extends StripeLike {
  refunds: StripeLike["refunds"] & { calls: Array<Record<string, unknown>> };
  transfers: StripeLike["transfers"] & {
    calls: Array<Record<string, unknown>>;
    failNext?: string;
  };
}

function makeFakeStripe(): FakeStripe {
  const refundCalls: Array<Record<string, unknown>> = [];
  const transferCalls: Array<Record<string, unknown>> = [];
  const fake: FakeStripe = {
    refunds: {
      calls: refundCalls,
      async create(args) {
        refundCalls.push(args);
        return { id: `re_${refundCalls.length}` };
      },
    },
    transfers: {
      calls: transferCalls,
      async create(args) {
        transferCalls.push(args);
        if (fake.transfers.failNext) {
          const reason = fake.transfers.failNext;
          fake.transfers.failNext = undefined;
          throw new Error(reason);
        }
        return { id: `tr_${transferCalls.length}` };
      },
    },
  };
  return fake;
}

// All amounts in this file are in integer credits, where 100 credits = $1 USD
// and 1 credit = 1 Stripe cent. So "1000 credits funded" = $10 funded, and the
// `amount` we pass to Stripe is the same integer.

test("taskFundingCheckoutMetadata stamps the funding product key", () => {
  const md = taskFundingCheckoutMetadata({
    buyerId: "acct_1",
    taskId: "task_xyz",
    maxBudget: 4.5,
    transferGroup: taskTransferGroup("task_xyz"),
  });
  assert.equal(md.product, ARBOR_TASK_FUNDING_PRODUCT);
  assert.equal(md.task_id, "task_xyz");
  assert.equal(md.transfer_group, "task:task_xyz");
  assert.equal(md.max_budget, "4.50");
});

test("refundUnusedBudget refunds the difference between funded and clearing", async () => {
  const fake = makeFakeStripe();
  const result = await refundUnusedBudget({
    payment: {
      task_id: "task_a",
      buyer_id: "acct_a",
      gross_funded: 1000, // $10
      stripe_charge_id: "ch_1",
    },
    clearingPrice: 600, // $6
    stripe: fake,
  });
  assert.equal(result.refunded_amount, 400);
  assert.equal(result.stripe_refund_id, "re_1");
  assert.equal(fake.refunds.calls.length, 1);
  assert.equal((fake.refunds.calls[0] as { amount: number }).amount, 400);
});

test("refundUnusedBudget skips when nothing is unused", async () => {
  const fake = makeFakeStripe();
  const result = await refundUnusedBudget({
    payment: {
      task_id: "task_b",
      buyer_id: "acct_b",
      gross_funded: 600,
      stripe_charge_id: "ch_1",
    },
    clearingPrice: 600,
    stripe: fake,
  });
  assert.equal(result.refunded_amount, 0);
  assert.equal(result.skipped, "no_unused");
  assert.equal(fake.refunds.calls.length, 0);
});

test("refundFullTaskCharge refunds what is still on the charge", async () => {
  const fake = makeFakeStripe();
  const result = await refundFullTaskCharge({
    payment: {
      task_id: "task_c",
      buyer_id: "acct_c",
      gross_funded: 800, // $8
      refunded_unused: 200, // $2 already refunded
      stripe_charge_id: "ch_1",
    },
    reason: "test",
    stripe: fake,
  });
  assert.equal(result.refunded_amount, 600);
  assert.equal((fake.refunds.calls[0] as { amount: number }).amount, 600);
});

test("transferAgentNetOrPayable transfers when payouts_enabled", async () => {
  const fake = makeFakeStripe();
  const outcome = await transferAgentNetOrPayable({
    payment: {
      task_id: "task_d",
      buyer_id: "acct_d",
      gross_funded: 1000, // $10
      clearing_price: 500, // $5
      transfer_group: "task:task_d",
    },
    agentId: "linear-issues",
    payoutAccount: {
      stripe_connect_account_id: "acct_connect_1",
      charges_enabled: true,
      payouts_enabled: true,
      requirements_due: [],
    },
    stripe: fake,
  });
  assert.equal(outcome.status, "succeeded");
  // 500 credits @ 10% platform fee → 50 credits fee, 450 credits net.
  assert.equal(outcome.agent_net, 450);
  assert.equal(outcome.platform_fee, 50);
  assert.equal(outcome.stripe_transfer_id, "tr_1");
  assert.equal(fake.transfers.calls.length, 1);
  // The Stripe transfer amount is the integer-credit net (= cents).
  assert.equal((fake.transfers.calls[0] as { amount: number }).amount, 450);
});

test("transferAgentNetOrPayable returns payable_blocked when payouts disabled", async () => {
  const fake = makeFakeStripe();
  const outcome = await transferAgentNetOrPayable({
    payment: {
      task_id: "task_e",
      buyer_id: "acct_e",
      gross_funded: 1000,
      clearing_price: 500,
    },
    agentId: "linear-issues",
    payoutAccount: {
      stripe_connect_account_id: "acct_connect_2",
      charges_enabled: false,
      payouts_enabled: false,
      requirements_due: ["external_account"],
    },
    stripe: fake,
  });
  assert.equal(outcome.status, "payable_blocked");
  assert.deepEqual(outcome.requirements_due, ["external_account"]);
  assert.equal(outcome.stripe_transfer_id, undefined);
});

test("transferAgentNetOrPayable returns payable_blocked when there is no Connect account", async () => {
  const fake = makeFakeStripe();
  const outcome = await transferAgentNetOrPayable({
    payment: {
      task_id: "task_f",
      buyer_id: "acct_f",
      gross_funded: 1000,
      clearing_price: 500,
    },
    agentId: "linear-issues",
    payoutAccount: null,
    stripe: fake,
  });
  assert.equal(outcome.status, "payable_blocked");
  assert.deepEqual(outcome.requirements_due, []);
});

test("transferAgentNetOrPayable returns failed when Stripe throws", async () => {
  const fake = makeFakeStripe();
  fake.transfers.failNext = "platform balance insufficient";
  const outcome = await transferAgentNetOrPayable({
    payment: {
      task_id: "task_g",
      buyer_id: "acct_g",
      gross_funded: 1000,
      clearing_price: 500,
    },
    agentId: "linear-issues",
    payoutAccount: {
      stripe_connect_account_id: "acct_connect_3",
      charges_enabled: true,
      payouts_enabled: true,
      requirements_due: [],
    },
    stripe: fake,
  });
  assert.equal(outcome.status, "failed");
  assert.match(outcome.failure_reason ?? "", /platform balance insufficient/);
});
