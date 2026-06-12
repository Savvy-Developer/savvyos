/**
 * Image generation helper using OpenAI Images API (gpt-image-1)
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  const baseUrl = ENV.forgeApiUrl.replace(/\/$/, "");
  const originals = options.originalImages ?? [];

  let response: Response;

  if (originals.length > 0) {
    // Edit flow: multipart form to /v1/images/edits
    const formData = new FormData();
    formData.append("model", "gpt-image-1");
    formData.append("prompt", options.prompt);

    for (let index = 0; index < originals.length; index++) {
      const original = originals[index];
      let bytes: Buffer;
      let mime = original.mimeType || "image/png";

      if (original.b64Json) {
        bytes = Buffer.from(original.b64Json, "base64");
      } else if (original.url) {
        const download = await fetch(original.url);
        if (!download.ok) {
          throw new Error(
          `Failed to download original image (HTTP ${download.status})`
          );
        }
        mime = download.headers.get("content-type") || mime;
        bytes = Buffer.from(await download.arrayBuffer());
      } else {
        continue;
      }

      const ext =
        mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
      formData.append(
        "image[]",
        new Blob([bytes], { type: mime }),
        `original-${index}.${ext}`
      );
    }

    response = await fetch(`${baseUrl}/v1/images/edits`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: formData,
    });
  } else {
    // Generation flow: JSON to /v1/images/generations
    response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: options.prompt,
        n: 1,
        size: "1024x1024",
      }),
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };

  const base64Data = result.data?.[0]?.b64_json;
  if (!base64Data) {
    throw new Error("Image generation response did not include image data");
  }
  const buffer = Buffer.from(base64Data, "base64");

  // Save to storage
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return {
    url,
  };
}
