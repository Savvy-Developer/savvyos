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

  it("accepts every Airbnb country site", () => {
    expect(extractAirbnbListingId("https://www.airbnb.co.in/rooms/1127622422133747862"))
      .toBe("1127622422133747862");
    for (const host of ["airbnb.co.uk", "airbnb.ca", "airbnb.com.au", "airbnb.de", "www.airbnb.fr", "m.airbnb.mx", "airbnb.com.br"]) {
      expect(extractAirbnbListingId(`https://${host}/rooms/53694936?adults=2`)).toBe("53694936");
    }
  });

  it("accepts Plus and Luxe links, links without https://, and a bare ID", () => {
    expect(extractAirbnbListingId("https://www.airbnb.com/rooms/plus/22222222")).toBe("22222222");
    expect(extractAirbnbListingId("https://www.airbnb.com/luxury/listing/33333333")).toBe("33333333");
    expect(extractAirbnbListingId("airbnb.co.in/rooms/44444444")).toBe("44444444");
    expect(extractAirbnbListingId("  www.airbnb.com/rooms/55555555  ")).toBe("55555555");
    expect(extractAirbnbListingId("53694936")).toBe("53694936");
  });

  it("still refuses look-alike and non-listing links", () => {
    for (const bad of [
      "https://airbnb.com.evil.example/rooms/12345",
      "https://notairbnb.com/rooms/12345",
      "https://evil-airbnb.co.in/rooms/12345",
      "https://www.airbnb.co.in/s/Gatlinburg/homes",
      "https://www.airbnb.com/users/show/12345",
      "",
      "12",
    ]) {
      expect(extractAirbnbListingId(bad)).toBeNull();
    }
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
