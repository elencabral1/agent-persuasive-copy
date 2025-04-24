import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
// Could import any other source file/function here
import worker from "../src/server";
import { executions, tools } from "../src/tools";
import { processToolCalls } from "../src/utils";
import { generateId, tool } from "ai";
import type { DataStreamWriter, Message } from "ai";

declare module "cloudflare:test" {
  // Controls the type of `import("cloudflare:test").env`
  interface ProvidedEnv extends Env {}
}

describe("Chat worker", () => {
  it("responds with Not found", async () => {
    const request = new Request("http://example.com");
    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toBe("Not found");
    expect(response.status).toBe(404);
  });
});

describe("getPersuasiveCopy tool with human confirmation", () => {
  let mockAgent: any;
  let mockMessages: Message[];

  beforeEach(() => {
    mockAgent = {
      messages: [],
      saveMessages: vi.fn((msgs: Message[]) => {
        mockMessages = [...mockMessages, ...msgs];
      }),
    };
    mockMessages = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should not have execute function directly (requires human confirmation)", () => {
    expect((tools.getPersuasiveCopy as any).execute).toBeUndefined();
    expect(executions.getPersuasiveCopy).toBeDefined();
  });

  it("should execute after confirmation via executions", async () => {
    const testPrompt = "Um app para autônomos organizarem suas finanças";

    const mockResponse = "Copy publicitária gerada com sucesso.";

    const originalExecute = executions.getPersuasiveCopy;
    executions.getPersuasiveCopy = vi.fn().mockResolvedValue(mockResponse);

    try {
      const result = await executions.getPersuasiveCopy({ prompt: testPrompt });

      expect(result).toBe(mockResponse);
      expect(executions.getPersuasiveCopy).toHaveBeenCalledWith({
        prompt: testPrompt,
      });
    } finally {
      executions.getPersuasiveCopy = originalExecute;
    }
  });

  it("should handle the full confirmation flow", async () => {
    const testPrompt = "App para freelancers gerenciarem suas finanças";

    const spy = vi.fn();

    const mockExecutions = {
      getPersuasiveCopy: vi.fn().mockResolvedValue("Copy gerada com sucesso"),
    };

    const mockDataStream: DataStreamWriter = {
      write: spy,
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    };

    const messages: Message[] = [
      {
        id: generateId(),
        role: "user",
        content: "Gere uma copy para: " + testPrompt,
        createdAt: new Date(),
      },
      {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: generateId(),
              toolName: "getPersuasiveCopy",
              args: { prompt: testPrompt },
              state: "result",
              result: "yes",
            },
          },
        ],
      },
    ];

    await processToolCalls({
      tools,
      dataStream: mockDataStream,
      messages,
      executions: mockExecutions,
    });

    expect(mockExecutions.getPersuasiveCopy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
      })
    );
  });

  it("should not execute when user rejects", async () => {
    const testPrompt = "App para freelancers gerenciarem suas finanças";

    const spy = vi.fn();

    const mockExecutions = {
      getPersuasiveCopy: vi.fn(),
    };

    const mockDataStream: DataStreamWriter = {
      write: spy,
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    };

    const messages: Message[] = [
      {
        id: generateId(),
        role: "user",
        content: "Gere uma copy para: " + testPrompt,
        createdAt: new Date(),
      },
      {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: generateId(),
              toolName: "getPersuasiveCopy",
              args: { prompt: testPrompt },
              state: "result",
              result: "no",
            },
          },
        ],
      },
    ];

    await processToolCalls({
      tools,
      dataStream: mockDataStream,
      messages,
      executions: mockExecutions,
    });

    expect(mockExecutions.getPersuasiveCopy).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
      })
    );
  });
});
