import { useCallback, useEffect, useMemo, useState } from 'react';

// Where the user is, in terms that matter for practice. The browser reports
// a position while PranaVeda is open; it is matched against spots the user
// has saved themselves (home, work, …). Coordinates never leave the device
// and no history is kept — Amrita is told only the KIND of place.

export type PlaceKind = 'home' | 'work' | 'studio' | 'outdoors';
export type CurrentPlace = PlaceKind | 'elsewhere';

export interface SavedPlace {
  kind: PlaceKind;
  lat: number;
  lon: number;
}

export interface Position {
  lat: number;
  lon: number;
  accuracy: number; // metres
}

export interface LocationContext {
  place: CurrentPlace;
}

export const PLACE_KINDS: PlaceKind[] = ['home', 'work', 'studio', 'outdoors'];

export const PLACE_LABEL: Record<CurrentPlace, string> = {
  home: 'Home',
  work: 'Work',
  studio: 'Studio or gym',
  outdoors: 'Outdoor spot',
  elsewhere: 'Somewhere else',
};

// Offered as the first suggestion on the home screen; sent to Amrita as the
// user's own words when tapped.
export const PLACE_SUGGESTION: Record<CurrentPlace, string> = {
  home: "I'm at home with room to use the floor. What would you suggest?",
  work: "I'm at work. Something quiet I can do at my desk, please.",
  studio: "I'm at the studio with a mat and space. Guide me through a fuller practice.",
  outdoors: "I'm outdoors. A standing practice I can do here, please.",
  elsewhere: "I'm out and about. Something I can do anywhere, no mat needed.",
};

const ENABLED_KEY = 'pranaveda_location_enabled';
const PLACES_KEY = 'pranaveda_places';
const MATCH_RADIUS_M = 150;
// Beyond this the fix is a city-level guess (typical of a desktop without
// Wi-Fi positioning) and says nothing about which place the user is in.
const MAX_USABLE_ACCURACY_M = 2000;

const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;

export function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// The nearest saved place within reach; 'elsewhere' when the fix is good but
// matches none; null when there is nothing trustworthy to say.
export function matchPlace(position: Position | null, places: SavedPlace[]): CurrentPlace | null {
  if (!position || position.accuracy > MAX_USABLE_ACCURACY_M || !places.length) return null;
  // A vague fix widens the net a little, but never past a few streets.
  const radius = Math.max(MATCH_RADIUS_M, Math.min(position.accuracy, 500));
  const nearest = places
    .map((place) => ({ place, distance: distanceMetres(position, place) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest.distance <= radius ? nearest.place.kind : 'elsewhere';
}

function loadPlaces(): SavedPlace[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLACES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usePlace() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [places, setPlaces] = useState<SavedPlace[]>(loadPlaces);
  const [position, setPosition] = useState<Position | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(places));
    } catch {}
  }, [places]);

  // Watch only while the app is open; low-power positioning is plenty for
  // telling one saved place from another.
  useEffect(() => {
    if (!enabled || !geolocation) return;
    const watchId = geolocation.watchPosition(
      (result) => {
        setBlocked(false);
        setPosition({ lat: result.coords.latitude, lon: result.coords.longitude, accuracy: result.coords.accuracy });
      },
      (error) => {
        // Only a refusal turns the feature off; a timeout keeps the last fix.
        if (error.code === error.PERMISSION_DENIED) {
          setBlocked(true);
          setPosition(null);
        }
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 30 * 1000 }
    );
    return () => geolocation.clearWatch(watchId);
  }, [enabled]);

  // Called from a click, so the browser's permission prompt has a clear cause.
  const enable = useCallback(() => {
    setBlocked(false);
    setEnabled(true);
    try {
      localStorage.setItem(ENABLED_KEY, '1');
    } catch {}
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    setPosition(null);
    try {
      localStorage.removeItem(ENABLED_KEY);
    } catch {}
  }, []);

  // One spot per kind: saving again moves it to where the user is now.
  const savePlace = useCallback(
    (kind: PlaceKind) => {
      if (!position) return;
      setPlaces((prev) => [...prev.filter((p) => p.kind !== kind), { kind, lat: position.lat, lon: position.lon }]);
    },
    [position]
  );

  const removePlace = useCallback((kind: PlaceKind) => {
    setPlaces((prev) => prev.filter((p) => p.kind !== kind));
  }, []);

  // The account's places, when they are kept there (useConnectionsSync).
  const replacePlaces = useCallback((next: SavedPlace[]) => setPlaces(next), []);

  const current = useMemo(() => (enabled ? matchPlace(position, places) : null), [enabled, position, places]);

  return {
    supported: !!geolocation,
    enabled,
    blocked,
    // Too vague to tell places apart (see MAX_USABLE_ACCURACY_M).
    imprecise: !!position && position.accuracy > MAX_USABLE_ACCURACY_M,
    located: !!position,
    places,
    current,
    enable,
    disable,
    savePlace,
    removePlace,
    replacePlaces,
  };
}

export type Place = ReturnType<typeof usePlace>;
