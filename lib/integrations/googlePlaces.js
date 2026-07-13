const PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

async function searchPlaces({ query, location, radius = 20000 }) {
  if (!query) {
    throw new Error('query is required');
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is not configured');
  }

  const params = new URLSearchParams({ query, key: apiKey });
  if (location) params.set('location', location);
  if (radius) params.set('radius', String(radius));

  const response = await fetch(`${PLACES_BASE_URL}/textsearch/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google Places request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status}`);
  }

  return (data.results || []).map((place) => ({
    name: place.name,
    address: place.formatted_address,
    rating: place.rating ?? null,
    review_count: place.user_ratings_total ?? 0,
    place_id: place.place_id,
  }));
}

module.exports = { searchPlaces };
