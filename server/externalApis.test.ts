import { describe, expect, it } from "vitest";
import {
  ZillowLookupInputError,
  buildZillowLookupUrl,
  mapZillowPropertyResponse,
} from "./externalApis";

describe("Zillow import helpers", () => {
  it("uses a Zillow ZPID from the pasted listing URL", () => {
    expect(
      buildZillowLookupUrl({
        zillowUrl:
          "https://www.zillow.com/homedetails/2114-Bigelow-Ave-N-Seattle-WA-98109/48749425_zpid/?utm_source=test",
        address: "An ignored fallback address",
      })
    ).toBe("https://private-zillow.p.rapidapi.com/pro/byzpid?zpid=48749425");
  });

  it("uses the URL endpoint for a Zillow listing URL without a ZPID", () => {
    expect(
      buildZillowLookupUrl({
        zillowUrl: "https://www.zillow.com/homedetails/example-listing/",
      })
    ).toBe(
      "https://private-zillow.p.rapidapi.com/pro/byurl?url=https%3A%2F%2Fwww.zillow.com%2Fhomedetails%2Fexample-listing%2F"
    );
  });

  it("falls back to a properly encoded street-address lookup when no URL is supplied", () => {
    expect(
      buildZillowLookupUrl({
        address: "2114 Bigelow Ave N, Seattle, WA 98109",
      })
    ).toBe(
      "https://private-zillow.p.rapidapi.com/pro/byaddress?propertyaddress=2114%20Bigelow%20Ave%20N%2C%20Seattle%2C%20WA%2098109"
    );
  });

  it("rejects non-Zillow URLs instead of sending them to the address endpoint", () => {
    expect(() =>
      buildZillowLookupUrl({
        zillowUrl: "https://example.com/listing/48749425_zpid/",
      })
    ).toThrow(ZillowLookupInputError);
  });

  it("maps a populated provider response and reads the provider lot-unit field", () => {
    const result = mapZillowPropertyResponse({
      message: "200: Success",
      zillowURL: "https://www.zillow.com/homedetails/48749425_zpid/",
      propertyDetails: {
        price: 2176600,
        bedrooms: 4,
        bathrooms: 3,
        livingArea: 3470,
        yearBuilt: 1924,
        homeType: "SINGLE_FAMILY",
        lotAreaValue: 4680,
        lotAreaUnits: "Square Feet",
        description: "A home",
        hiResImageLink: "https://photos.zillowstatic.com/fp/photo.jpg",
        annualHomeownersInsurance: 7835.76,
        taxHistory: [{ taxPaid: 20981.01 }],
      },
    });

    expect(result).toMatchObject({
      zillowUrl: "https://www.zillow.com/homedetails/48749425_zpid/",
      price: 2176600,
      bedrooms: 4,
      bathrooms: 3,
      sqft: 3470,
      yearBuilt: 1924,
      propertyType: "SINGLE_FAMILY",
      lotSizeUnit: "Square Feet",
      annualInsurance: 7835.76,
      taxHistory: { taxPaid: 20981.01 },
    });
  });

  it("rejects the provider's HTTP-200 not-found body instead of returning an empty success", () => {
    expect(
      mapZillowPropertyResponse({
        message: "404: PageNotFound. Verify and retry.",
        zillowURL: "NotFound",
        propertyDetails: {},
      })
    ).toBeNull();
  });
});
