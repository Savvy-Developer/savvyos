import { describe, expect, it } from "vitest";
import { findZoomTranscriptFile } from "./zoomWebinarService";

describe("Zoom transcript webhook files", () => {
  it("selects the completed VTT transcript instead of recording media", () => {
    const transcript = findZoomTranscriptFile({
      object: {
        id: "8675309",
        recording_files: [
          { id: "video", file_type: "MP4", file_extension: "MP4", download_url: "https://us02web.zoom.us/rec/video" },
          { id: "transcript", file_type: "TRANSCRIPT", file_extension: "VTT", download_url: "https://us02web.zoom.us/rec/transcript" },
        ],
      },
    });

    expect(transcript).toMatchObject({ id: "transcript", file_extension: "VTT" });
  });

  it("recognizes transcript files when Zoom provides only the VTT extension", () => {
    const transcript = findZoomTranscriptFile({
      object: { recording_files: [{ id: "vtt-only", file_extension: "vtt" }] },
    });

    expect(transcript?.id).toBe("vtt-only");
  });
});
