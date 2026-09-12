import { Crosshair, Globe, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceSearchResult } from '../../api/geocoding'
import { useCommand } from '../../features/command-center/command-context'
import type { DemoLocation } from '../../types/location'

function buildArbitraryLocation(latitude: number, longitude: number, name: string): DemoLocation {
  return {
    id: `arbitrary-${latitude}-${longitude}`,
    name: name.trim() || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    district: '',
    state: '',
    latitude,
    longitude,
    elevation: 0,
    status: 'ARBITRARY',
  }
}

function placeToLocation(place: PlaceSearchResult, name: string): DemoLocation {
  return {
    id: `arbitrary-${place.latitude}-${place.longitude}`,
    name: name.trim() || place.name,
    district: place.district,
    state: place.state,
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: 0,
    status: 'ARBITRARY',
  }
}

const GEO_DEBOUNCE_MS = 350

export function LocationSearch() {
  const { locations, setLocation } = useCommand()
  const [query, setQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [coordinateName, setCoordinateName] = useState('')
  const [coordError, setCoordError] = useState<string | null>(null)
  const [coordsOpen, setCoordsOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const demoMatches = locations
    .filter(
      (item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.district.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 5)

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setCoordsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCoordsOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function startPlaceSearch(trimmed: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setPlaceSearching(true)
    setGeoError(null)
    const seq = ++searchSeqRef.current
    searchTimerRef.current = setTimeout(() => {
      searchPlaces(trimmed)
        .then((results) => {
          if (seq !== searchSeqRef.current) return
          setPlaceResults(results)
          setPlaceSearching(false)
        })
        .catch(() => {
          if (seq !== searchSeqRef.current) return
          setPlaceResults([])
          setPlaceSearching(false)
          setGeoError('Place search unavailable — enter coordinates manually instead.')
        })
    }, GEO_DEBOUNCE_MS)
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setPlaceResults([])
      setPlaceSearching(false)
      setGeoError(null)
      return
    }
    startPlaceSearch(value.trim())
  }

  function applyCoordinates() {
    if (latInput.trim() === '' || lngInput.trim() === '') {
      setCoordError('Enter both latitude and longitude.')
      return
    }
    const latitude = Number(latInput)
    const longitude = Number(lngInput)
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setCoordError('Enter valid latitude (−90…90) and longitude (−180…180).')
      return
    }
    setCoordError(null)
    const preset = locations.find(
      (item) =>
        Number(item.latitude.toFixed(4)) === Number(latitude.toFixed(4)) &&
        Number(item.longitude.toFixed(4)) === Number(longitude.toFixed(4)),
    )
    setLocation(preset ?? buildArbitraryLocation(latitude, longitude, coordinateName))
    setLatInput('')
    setLngInput('')
    setCoordinateName('')
    setCoordsOpen(false)
  }

  const showDropdown = query.trim().length > 0 && !coordsOpen
  const hasNoResults = showDropdown && demoMatches.length === 0 && placeResults.length === 0

  return (
    <div className="relative" ref={containerRef}>
      <label className="sr-only" htmlFor="location-search">Search location</label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b2025] px-3 py-2">
        <Search size={15} className="shrink-0 text-cyan-200" />
        <input
          id="location-search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search any place"
          className="w-36 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500 sm:w-56"
        />
        <button
          type="button"
          onClick={() => setCoordsOpen((open) => !open)}
          aria-label="Toggle custom coordinates"
          aria-expanded={coordsOpen}
          className={`shrink-0 rounded-lg p-1.5 transition ${coordsOpen ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400 hover:bg-white/[.06] hover:text-slate-200'}`}
        >
          <Crosshair size={15} />
        </button>
      </div>
      {showDropdown && (
        <div className="absolute right-0 z-50 mt-2 max-w-[calc(100vw-4rem)] overflow-hidden rounded-xl border border-white/10 bg-[#0b2025] p-1 shadow-2xl">
          {demoMatches.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setLocation(item)
                setQuery('')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/[.06]"
            >
              <MapPin size={14} className="text-cyan-200" />
              <span>
                <b className="block text-sm text-white">{item.name}</b>
                <small className="text-slate-400">
                  {item.district}, {item.state} · SUGGESTED
                </small>
              </span>
            </button>
          ))}
          {placeResults.length > 0 && (
            <p className="flex items-center gap-1.5 px-3 pt-2 text-[10px] font-bold tracking-[.13em] text-cyan-200/80">
              <Globe size={11} /> PLACES · SEARCHED WORLDWIDE
            </p>
          )}
          {placeResults.map((place) => (
            <button
              key={`${place.source}-${place.latitude}-${place.longitude}-${place.name}`}
              onClick={() => {
                setLocation(placeToLocation(place, coordinateName))
                setQuery('')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/[.06]"
            >
              <Globe size={14} className="text-cyan-200" />
              <span>
                <b className="block text-sm text-white">{place.name}</b>
                <small className="text-slate-400">
                  {[place.district, place.state].filter(Boolean).join(', ') || place.name} ·{' '}
                  {place.latitude.toFixed(3)}, {place.longitude.toFixed(3)} ·{' '}
                  {place.source === 'open-meteo' ? 'Open-Meteo' : 'Nominatim'}
                </small>
              </span>
            </button>
          ))}
          {placeSearching && (
            <p className="p-3 text-sm text-slate-400">Searching places…</p>
          )}
          {geoError && <p className="p-3 text-xs leading-5 text-amber-300">{geoError}</p>}
          {hasNoResults && !placeSearching && !geoError && (
            <p className="p-3 text-sm text-slate-400">No places found.</p>
          )}
        </div>
      )}
      {coordsOpen && (
        <div className="absolute right-0 z-50 mt-2 max-w-[calc(100vw-4rem)] w-72 rounded-xl border border-white/10 bg-[#0b2025] p-3 shadow-2xl">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[.13em] text-cyan-200">
            <Crosshair size={13} /> CUSTOM COORDINATES
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              aria-label="Latitude"
              value={latInput}
              onChange={(event) => setLatInput(event.target.value)}
              placeholder="Latitude (e.g. 30.52)"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              aria-label="Longitude"
              value={lngInput}
              onChange={(event) => setLngInput(event.target.value)}
              placeholder="Longitude (e.g. 79.56)"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
          <input
            aria-label="Location name (optional)"
            value={coordinateName}
            onChange={(event) => setCoordinateName(event.target.value)}
            placeholder="Optional name"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
          />
          {coordError && <p className="mt-2 text-[10px] text-amber-300">{coordError}</p>}
          <button
            onClick={applyCoordinates}
            className="mt-2 w-full rounded-lg bg-cyan-300/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/25"
          >
            Set location
          </button>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            Selected coordinates use live Open-Meteo features for a real ML risk prediction when
            available; otherwise the risk shows an honest unavailable state.
          </p>
        </div>
      )}
    </div>
  )
}