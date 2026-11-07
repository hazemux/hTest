"use client";

import { useRef, useState } from "react";

/** One row of `GET /content/cities`. */
export interface CityChoice {
  id: number;
  name: { ar: string; en: string };
}

/**
 * «الدولة» then «المدينة»: two native dropdowns, the second filled from the
 * first (owner, 2026-09-29: the city is chosen, never typed).
 *
 * The page renders the cities of the country already chosen, so the pair
 * works before — and without — any script. Changing the country fetches that
 * country's list from our own `/api/cities` and clears the city, which
 * belonged to the old country. A failed fetch leaves the city empty rather
 * than showing the wrong country's towns; the API would refuse that pairing
 * anyway (`PATCH /me` checks the city is in the country). Only the latest
 * country's answer is kept: a slower reply for one chosen earlier is dropped,
 * so the list never shows another country's towns.
 */
export function CountryCityFields({
  locale,
  countries,
  initialCountry,
  initialCities,
  initialCityId,
  initialCityName,
  labels,
  selectClassName,
  labelClassName,
  wrapperClassName,
}: {
  locale: "ar" | "en";
  countries: readonly { value: string; label: string }[];
  initialCountry: string;
  initialCities: readonly CityChoice[];
  initialCityId: number | null;
  /** The saved city's names — kept as an option if the list lacks it. */
  initialCityName: { ar: string; en: string } | null;
  labels: { country: string; city: string; chooseCountry: string; chooseCity: string; chooseCountryFirst: string };
  selectClassName: string;
  labelClassName: string;
  wrapperClassName?: string;
}) {
  const [country, setCountry] = useState(initialCountry);
  // The saved city is always an option while its country is chosen: a list
  // that failed to load, or a refresh that dropped the town, must not make the
  // next save clear it.
  const [cities, setCities] = useState<readonly CityChoice[]>(() =>
    initialCityId !== null && initialCityName && !initialCities.some((city) => city.id === initialCityId)
      ? [{ id: initialCityId, name: initialCityName }, ...initialCities]
      : initialCities,
  );
  const [cityId, setCityId] = useState(initialCityId === null ? "" : String(initialCityId));
  const [loading, setLoading] = useState(false);
  const latestRequest = useRef(0);

  async function chooseCountry(next: string) {
    const request = ++latestRequest.current;
    setCountry(next);
    setCityId("");
    setCities([]);
    if (next === "") {
      setLoading(false);
      return;
    }

    setLoading(true);
    let loaded: CityChoice[] = [];
    try {
      const response = await fetch(`/api/cities?country=${encodeURIComponent(next)}`);
      const body = response.ok ? ((await response.json()) as { data?: CityChoice[] }) : null;
      loaded = Array.isArray(body?.data) ? body.data : [];
    } catch {
      loaded = [];
    }
    if (request !== latestRequest.current) return;
    setCities(loaded);
    setLoading(false);
  }

  return (
    <>
      <label className={wrapperClassName ?? "flex flex-col gap-2"}>
        <span className={labelClassName}>{labels.country}</span>
        <select
          name="country"
          value={country}
          onChange={(event) => void chooseCountry(event.currentTarget.value)}
          autoComplete="country"
          className={selectClassName}
        >
          <option value="">{labels.chooseCountry}</option>
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={wrapperClassName ?? "flex flex-col gap-2"}>
        <span className={labelClassName}>{labels.city}</span>
        <select
          name="city_id"
          value={cityId}
          onChange={(event) => setCityId(event.currentTarget.value)}
          disabled={country === "" || loading}
          aria-busy={loading}
          className={selectClassName}
        >
          <option value="">{country === "" ? labels.chooseCountryFirst : labels.chooseCity}</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name[locale]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
