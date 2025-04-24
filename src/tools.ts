/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { streamText, tool } from "ai";
import { z } from "zod";

import { agentContext } from "./server";
import {
  unstable_getSchedulePrompt,
  unstable_scheduleSchema,
} from "agents/schedule";
import { openai } from "@ai-sdk/openai";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() }),
  // Omitting execute function makes this tool require human confirmation
});

const getPersuasiveCopy = tool({
  description: "generate persuasive copy texts used in advertisements and marketing campaigns",
  parameters: z.object({ prompt: z.string() }),
})

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  },
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const agent = agentContext.getStore();
    if (!agent) {
      throw new Error("No agent found");
    }
    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  },
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  parameters: z.object({}),
  execute: async () => {
    const agent = agentContext.getStore();
    if (!agent) {
      throw new Error("No agent found");
    }
    try {
      const tasks = agent.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  },
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel"),
  }),
  execute: async ({ taskId }) => {
    const agent = agentContext.getStore();
    if (!agent) {
      throw new Error("No agent found");
    }
    try {
      await agent.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  },
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getPersuasiveCopy,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
  getPersuasiveCopy: async ({ prompt }: { prompt: string }) => {
    console.log(`Getting information for ${prompt}`);
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: `Você é um redator publicitário especializado em marketing e copywriting. Gere textos persuasivos (copies) com base nas informações fornecidas a seguir.

As copies devem ser criativas, envolventes e direcionadas ao público-alvo descrito. Foque em despertar o interesse, destacar a proposta de valor e incentivar a ação.

Informações:
"${prompt}"

A resposta deve conter:
1. Headline principal
2. Subheadline complementar
3. Texto para o corpo do anúncio (máximo 3 parágrafos curtos)
4. Call to Action (CTA) impactante
5. Versões alternativas de headline (2 variações)

Formato da resposta:
- Headline:
- Subheadline:
- Corpo do anúncio:
- CTA:
- Variações de headline:

Use uma linguagem clara, objetiva e emocionalmente envolvente, adaptada ao público descrito.`,
      prompt: `Crie uma copy persuasiva com base nas seguintes informações: ${prompt}`
    });

    await result.consumeStream();
    const text = await result.text;
    console.log("Resultado gerado:", text);
    return text;
  }
};
