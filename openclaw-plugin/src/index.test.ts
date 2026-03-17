import { describe, it, expect, vi } from "vitest";
import { register } from "./index";

describe("openclaw-plugin-mikey", () => {
  it("should register two tools and one context engine", () => {
    const api = {
      registerTool: vi.fn(),
      registerContextEngine: vi.fn(),
    };

    register(api as any);

    // 应该注册了 analyze_message 和 get_coaching_advice
    expect(api.registerTool).toHaveBeenCalledTimes(2);

    const toolNames = api.registerTool.mock.calls.map(
      (call: any[]) => call[0].name
    );
    expect(toolNames).toContain("analyze_message");
    expect(toolNames).toContain("get_coaching_advice");

    // 应该注册了知识库上下文引擎
    expect(api.registerContextEngine).toHaveBeenCalledTimes(1);
    expect(api.registerContextEngine.mock.calls[0][0].name).toBe(
      "mikey-knowledge"
    );
  });

  it("analyze_message tool should require message parameter", () => {
    const api = {
      registerTool: vi.fn(),
      registerContextEngine: vi.fn(),
    };

    register(api as any);

    const analyzeTool = api.registerTool.mock.calls.find(
      (call: any[]) => call[0].name === "analyze_message"
    )?.[0];

    expect(analyzeTool.parameters.required).toContain("message");
  });

  it("get_coaching_advice tool should require message, stage, temperature", () => {
    const api = {
      registerTool: vi.fn(),
      registerContextEngine: vi.fn(),
    };

    register(api as any);

    const adviceTool = api.registerTool.mock.calls.find(
      (call: any[]) => call[0].name === "get_coaching_advice"
    )?.[0];

    expect(adviceTool.parameters.required).toContain("message");
    expect(adviceTool.parameters.required).toContain("stage");
    expect(adviceTool.parameters.required).toContain("temperature");
  });

  it("analyze_message execute should return prompt type", async () => {
    const api = {
      registerTool: vi.fn(),
      registerContextEngine: vi.fn(),
    };

    register(api as any);

    const analyzeTool = api.registerTool.mock.calls.find(
      (call: any[]) => call[0].name === "analyze_message"
    )?.[0];

    const result = await analyzeTool.execute({
      message: "你在干嘛呀",
    });

    expect(result.type).toBe("prompt");
    expect(result.content).toContain("你在干嘛呀");
  });

  it("get_coaching_advice execute should return prompt type", async () => {
    const api = {
      registerTool: vi.fn(),
      registerContextEngine: vi.fn(),
    };

    register(api as any);

    const adviceTool = api.registerTool.mock.calls.find(
      (call: any[]) => call[0].name === "get_coaching_advice"
    )?.[0];

    const result = await adviceTool.execute({
      message: "你在干嘛呀",
      stage: "暧昧",
      temperature: "热",
      subtext: "她想你了",
    });

    expect(result.type).toBe("prompt");
    expect(result.content).toContain("暧昧");
    expect(result.content).toContain("你在干嘛呀");
  });
});
