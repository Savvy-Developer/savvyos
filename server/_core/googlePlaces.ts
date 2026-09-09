export type GooglePlacesAddressComponent = {
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
  types?: string[];
};

export function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("Google Maps is not configured: set GOOGLE_MAPS_API_KEY");
  return key;
}

export async function requestGooglePlaces<T>(
  path: string,
  options: RequestInit,
  fieldMask: string,
): Promise<T> {
  const response = await fetch(`https://places.googleapis.com${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask": fieldMask,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status}): ${await response.text()}`);
  }
  return await response.json() as T;
}
