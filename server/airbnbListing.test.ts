import { describe, expect, it } from "vitest";
import { extractAirbnbListingId, extractAirbnbPhotoUrls } from "./airbnbListing";

describe("Airbnb listing helpers", () => {
  it("extracts canonical listing IDs from Airbnb room URLs", () => {
    expect(extractAirbnbListingId("https://www.airbnb.com/rooms/53694936?check_in=2026-10-01"))
      .toBe("53694936");
    expect(extractAirbnbListingId("https://airbnb.com/rooms/12345"))
      .toBe("12345");
    expect(extractAirbnbListingId("https://example.com/rooms/12345")).toBeNull();
  });

  it("uses current hero preview images before legacy media items", () => {
    expect(extractAirbnbPhotoUrls({
      sectionContainer: [
        {
          sectionId: "HERO_DEFAULT",
          section: {
            previewImages: [
              { baseUrl: "https://images.example/current-first.jpg" },
              { url: "https://images.example/current-second.jpg" },
            ],
            mediaItems: [{ baseUrl: "https://images.example/legacy.jpg" }],
          },
        },
      ],
    })).toEqual([
      "https://images.example/current-first.jpg",
      "https://images.example/current-second.jpg",
      "https://images.example/legacy.jpg",
    ]);
  });

  it("falls back to sleeping-arrangement images when there is no hero image", () => {
    expect(extractAirbnbPhotoUrls({
      sectionContainer: [
        {
          sectionId: "SLEEPING_ARRANGEMENT_WITH_IMAGES",
          section: {
            arrangementDetails: [{
              images: [{ baseUrl: "https://images.example/bedroom.jpg" }],
            }],
          },
        },
      ],
    })).toEqual(["https://images.example/bedroom.jpg"]);
  });
});
