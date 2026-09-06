import express from "express";
import { sdk } from "./_core/sdk";
import { makeRequest } from "./_core/map";

const RAPIDAPI_HOST = "private-zillow.p.rapidapi.com";
const RAPIDAPI_KEY = "526283dbe0msh15c17fdb8e08c0bp17f809jsn6eb94ee12316";

export class ZillowLookupInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZillowLookupInputError";
  }
}

export function buildZillowLookupUrl(input: { zillowUrl?: string; address?: string }): string {
  const zillowUrl = input.zillowUrl?.trim();
  if (zillowUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(zillowUrl);
    } catch {
      throw new ZillowLookupInputError("Enter a valid Zillow listing URL.");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== "zillow.com" && !hostname.endsWith(".zillow.com")) {
      throw new ZillowLookupInputError("Enter a Zillow listing URL.");
    }

    const zpidMatch = parsedUrl.pathname.match(/\/(\d+)_zpid(?:\/|$)/i);
    if (zpidMatch) {
      return `https://${RAPIDAPI_HOST}/pro/byzpid?zpid=${encodeURIComponent(zpidMatch[1])}`;
    }
    return `https://${RAPIDAPI_HOST}/pro/byurl?url=${encodeURIComponent(zillowUrl)}`;
  }

  const address = input.address?.trim();
  if (!address) throw new ZillowLookupInputError("Paste a Zillow listing URL or provide a property address.");
  return `https://${RAPIDAPI_HOST}/pro/byaddress?propertyaddress=${encodeURIComponent(address)}`;
}

export function mapZillowPropertyResponse(data: any) {
  const pd = data?.propertyDetails;
  if (!pd || typeof pd !== "object" || Array.isArray(pd) || Object.keys(pd).length === 0) return null;

  const photoUrl = pd.hiResImageLink ?? pd.imgSrc ?? pd.originalPhotos?.[0]?.mixedSources?.jpeg?.[1]?.url ?? pd.originalPhotos?.[0]?.mixedSources?.jpeg?.[0]?.url ?? data?.imgSrc ?? null;
  const hasUsableProformaData = Boolean(pd.price ?? photoUrl ?? pd.description ?? pd.annualHomeownersInsurance ?? pd.taxHistory?.[0]?.taxPaid);
  if (!hasUsableProformaData) return null;

  return {
    source: "zillow",
    zillowUrl: data?.zillowURL ?? null,
    price: pd.price ?? null,
    zestimate: pd.zestimate ?? null,
    bedrooms: pd.bedrooms ?? null,
    bathrooms: pd.bathrooms ?? null,
    sqft: pd.livingArea ?? null,
    yearBuilt: pd.yearBuilt ?? null,
    propertyType: pd.homeType ?? null,
    lotSize: pd.lotAreaValue ?? null,
    lotSizeUnit: pd.lotAreaUnits ?? pd.lotAreaUnit ?? "acres",
    description: pd.description ?? null,
    photoUrl,
    address: pd.address ?? null,
    latitude: pd.latitude ?? null,
    longitude: pd.longitude ?? null,
    county: pd.county ?? null,
    taxRate: pd.propertyTaxRate ?? null,
    taxHistory: pd.taxHistory?.[0] ?? null,
    annualInsurance: pd.annualHomeownersInsurance ?? null,
    homeStatus: pd.homeStatus ?? null,
  };
}

type GoogleAddressComponent = { long_name?: string; short_name?: string; types?: string[] };

export function parseGoogleAddressDetails(result: any) {
  const components = Array.isArray(result?.address_components)
    ? result.address_components as GoogleAddressComponent[]
    : [];
  const component = (type: string, short = false) => {
    const value = components.find(item => item.types?.includes(type));
    return short ? value?.short_name : value?.long_name;
  };
  const streetNumber = component("street_number") ?? "";
  const route = component("route") ?? "";
  const streetAddress = `${streetNumber} ${route}`.trim();
  const city = component("locality") ?? component("postal_town") ?? component("sublocality") ?? component("administrative_area_level_3") ?? "";
  return {
    address: streetAddress || result?.formatted_address?.split(",")[0] || "",
    city,
    state: component("administrative_area_level_1", true) ?? "",
    zip: component("postal_code") ?? "",
    formattedAddress: result?.formatted_address ?? "",
  };
}

export function registerExternalApiRoutes(app: express.Application) {
  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE ADDRESS AUTOCOMPLETE
  // ═══════════════════════════════════════════════════════════════════════════
  // The Maps request is performed server-side with the built-in Forge key. This
  // avoids relying on a browser build-time key, which can be absent after a
  // deployment even though address verification remains available server-side.
  app.post("/api/external/address-suggestions", express.json(), async (req: any, res: any) => {
    try {
      try { await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }
      const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 250) : "";
      const placeId = typeof req.body?.placeId === "string" ? req.body.placeId.trim().slice(0, 255) : "";
      if (!query && !placeId) return res.status(400).json({ error: "Enter an address to search." });

      if (placeId) {
        const data = await makeRequest<any>("/maps/api/place/details/json", {
          place_id: placeId,
          fields: "address_component,formatted_address",
        });
        if (data?.status !== "OK" || !data?.result) {
          return res.status(502).json({ error: "Address details are temporarily unavailable." });
        }
        return res.json({ success: true, address: parseGoogleAddressDetails(data.result) });
      }

      if (query.length < 3) return res.json({ success: true, suggestions: [] });
      const data = await makeRequest<any>("/maps/api/place/autocomplete/json", {
        input: query,
        types: "address",
        components: "country:us",
      });
      if (data?.status && !["OK", "ZERO_RESULTS"].includes(data.status)) {
        console.warn("[AddressAutocomplete] Provider returned a non-success status", data.status);
        return res.status(502).json({ error: "Address suggestions are temporarily unavailable." });
      }
      const suggestions = Array.isArray(data?.predictions)
        ? data.predictions.slice(0, 6).map((prediction: any) => ({
            placeId: String(prediction.place_id ?? ""),
            description: String(prediction.description ?? ""),
          })).filter((prediction: { placeId: string; description: string }) => prediction.placeId && prediction.description)
        : [];
      return res.json({ success: true, suggestions });
    } catch (err: any) {
      console.error("[AddressAutocomplete] Error:", err.message);
      return res.status(503).json({ error: "Address suggestions are temporarily unavailable. You can still enter the address manually." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZILLOW PROPERTY LOOKUP
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/external/zillow-lookup", express.json(), async (req: any, res: any) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }

      const { address, zillowUrl } = req.body;
      let url: string;
      try {
        url = buildZillowLookupUrl({ address, zillowUrl });
      } catch (err: any) {
        if (err instanceof ZillowLookupInputError) return res.status(400).json({ error: err.message });
        throw err;
      }

      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        console.error("[ZillowLookup] RAPIDAPI_KEY is not configured");
        return res.status(503).json({ error: "Zillow import is temporarily unavailable. Please try again later." });
      }
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": rapidApiKey,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Zillow API error: ${response.statusText}` });
      }

      const data = await response.json();
      const result = mapZillowPropertyResponse(data);
      if (!result) {
        const providerMessage = typeof data?.message === "string" ? data.message : "No usable property details were returned.";
        console.warn("[ZillowLookup] Provider returned no usable property details", { providerMessage });
        return res.status(404).json({ error: "Zillow could not find usable details for this listing. Check the Zillow link and try again." });
      }

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error("[ZillowLookup] Error:", err.message);
      return res.status(500).json({ error: err.message || "Zillow lookup failed" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AIRBNB LISTING LOOKUP (by listing ID or URL)
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/external/airbnb-lookup", express.json(), async (req: any, res: any) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }

      const { listingId, url: listingUrl } = req.body;

      // Extract listing ID from URL if provided
      let id = listingId;
      if (!id && listingUrl) {
        // URLs like: https://www.airbnb.com/rooms/52009498 or https://www.airbnb.com/rooms/52009498?...
        const match = listingUrl.match(/rooms\/(\d+)/);
        if (match) id = match[1];
      }
      if (!id) return res.status(400).json({ error: "Listing ID or Airbnb URL is required" });

      const detailUrl = `https://airbnb-search.p.rapidapi.com/stays/detail?listingId=${id}`;
      const response = await fetch(detailUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "airbnb-search.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Airbnb API error: ${response.statusText}` });
      }

      const data = await response.json();
      if (!data.status || !data.data) {
        return res.status(404).json({ error: "Listing not found or API error", details: data.errors || data.message });
      }

      const sections = data.data.sectionContainer || [];
      const metadata = data.data.metadata || {};
      const loggingContext = metadata.loggingContext?.eventDataLogging || {};

      // Extract title
      let title = "";
      let overviewItems: string[] = [];
      for (const sec of sections) {
        if (sec.sectionId === "TITLE_DEFAULT") {
          title = sec.section?.title || "";
          const items = sec.section?.overviewItems;
          if (items) overviewItems = items.map((i: any) => i.title || i.label || "");
          break;
        }
      }

      // Extract description
      let description = "";
      for (const sec of sections) {
        if (sec.sectionId === "DESCRIPTION_DEFAULT") {
          const html = sec.section?.htmlDescription?.htmlText || "";
          description = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
          break;
        }
      }

      // Extract photos
      let photos: string[] = [];
      for (const sec of sections) {
        if (sec.sectionId === "HERO_DEFAULT") {
          const mediaItems = sec.section?.mediaItems || [];
          photos = mediaItems
            .filter((m: any) => m.baseUrl || m.url)
            .map((m: any) => m.baseUrl || m.url)
            .slice(0, 5);
          break;
        }
      }
      // Fallback: sleeping arrangement images
      if (photos.length === 0) {
        for (const sec of sections) {
          if (sec.sectionId === "SLEEPING_ARRANGEMENT_WITH_IMAGES") {
            const arrangements = sec.section?.arrangementDetails || [];
            for (const arr of arrangements) {
              const imgs = arr.images || [];
              for (const img of imgs) {
                if (img.baseUrl) photos.push(img.baseUrl);
              }
            }
            break;
          }
        }
      }

      // Extract reviews
      let rating = loggingContext.guestSatisfactionOverall || null;
      let reviewCount = 0;
      for (const sec of sections) {
        if (sec.sectionId === "REVIEWS_DEFAULT") {
          const heading = sec.section?.heading || {};
          const match = heading.accessibilityLabel?.match(/([\d.]+)\s*out of 5.*?(\d+)\s*reviews/);
          if (match) {
            rating = parseFloat(match[1]);
            reviewCount = parseInt(match[2]);
          }
          break;
        }
      }

      // Extract bedrooms/baths from overviewItems or title parsing
      let bedrooms: number | null = null;
      let bathrooms: number | null = null;
      let guests: number | null = loggingContext.personCapacity || null;

      // Try to parse from title or description
      const bedroomMatch = (title + " " + description).match(/(\d+)\s*bed(?:room)?s?/i);
      const bathroomMatch = (title + " " + description).match(/(\d+)\s*bath(?:room)?s?/i);
      if (bedroomMatch) bedrooms = parseInt(bedroomMatch[1]);
      if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);

      // Extract city from loggingContext or title
      let city: string | null = loggingContext.listingCity || loggingContext.city || null;
      if (!city) {
        // Try to extract from title patterns like "Cabin in Gatlinburg" or "Home in Nashville"
        const cityMatch = title.match(/(?:in|near)\s+([A-Z][a-zA-Z\s]+?)(?:,|$|\s*[-·•])/i);
        if (cityMatch) city = cityMatch[1].trim();
      }

      const result = {
        source: "airbnb",
        listingId: id,
        title,
        description: description.substring(0, 500),
        photos,
        rating,
        reviewCount,
        bedrooms,
        bathrooms,
        guests,
        city,
        roomType: loggingContext.roomType || null,
        isSuperhost: loggingContext.isSuperhost || false,
        latitude: loggingContext.listingLat || null,
        longitude: loggingContext.listingLng || null,
        airbnbUrl: `https://www.airbnb.com/rooms/${id}`,
      };

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error("[AirbnbLookup] Error:", err.message);
      return res.status(500).json({ error: err.message || "Airbnb lookup failed" });
    }
  });
}
