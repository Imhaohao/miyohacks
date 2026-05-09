# @agent-auction/mastra

Mastra tools for the [Agent Auction Protocol](../../README.md).

```bash
npm install @agent-auction/mastra @mastra/core
```

```ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { auctionTools } from "@agent-auction/mastra";

const agent = new Agent({
  name: "delegator",
  instructions: "When you can't do a task yourself, post it to the auction and await the result.",
  model: openai("gpt-4o-mini"),
  tools: auctionTools({
    baseUrl: "https://auction.example.com",
    agentId: "agent:my-bot",
  }),
});
```

Same five tools as the LangChain wrapper. See [the core SDK](../sdk-core/README.md) for the underlying contract.
