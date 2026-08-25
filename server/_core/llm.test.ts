import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importClient = async () => {
  vi.resetModules();
  return import("./llm");
};

beforeEach(() => {
  vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://llm.example/v1");
  vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LLM model resolution", () => {
  it("uses gpt-5-mini when no model is requested", async () => {
    const { resolveLlmModel } = await importClient();
    expect(resolveLlmModel()).toBe("gpt-5-mini");
  });

  it.each(["gpt-4o", "gpt-4o-mini"])(
    "maps the retired %s model to gpt-5-mini",
    async legacyModel => {
      const { resolveLlmModel } = await importClient();
      expect(resolveLlmModel(legacyModel)).toBe("gpt-5-mini");
    }
  );

  it("preserves supported explicit model choices", async () => {
    const { resolveLlmModel } = await importClient();
    expect(resolveLlmModel("gpt-5")).toBe("gpt-5");
  });
});

describe("invokeLLM", () => {
  it("sends legacy model requests to the supported default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "completion-1",
          created: 1,
          model: "gpt-5-mini",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await importClient();

    const result = await invokeLLM({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Reply only: ok" }],
    });

    expect(result.choices[0]?.message.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "gpt-5-mini",
      max_completion_tokens: 4096,
    });
  });

  it("rejects a malformed success response instead of returning an unusable completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unsupported model" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const { invokeLLM } = await importClient();

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "Reply only: ok" }] })
    ).rejects.toThrow("LLM provider returned an invalid completion – Unsupported model");
  });
});
