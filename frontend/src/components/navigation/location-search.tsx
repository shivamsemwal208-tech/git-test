import { Crosshair, Globe, Locate, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { reverseGeocode, searchPlaces, GEOCODING_ATTRIBUTION, type PlaceSearchResult } from '../../api/geocoding'
import { getCurrentPosition, GeolocationUnavailableError, type GeolocationErrorKind } from '../../api/geolocation'
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

/** Honest, per-case message. The UI NEVER fabricates a location or a label. */
function honestLocateError(kind: GeolocationErrorKind): string {
  switch (kind) {
    case 'unsupported':
      return 'This browser does not support geolocation. Search for a place or enter coordinates instead.'
    case 'permission-denied':
      return 'Location permission was denied. Search for a place or enter coordinates instead.'
    case 'position-unavailable':
      return 'Your position is currently unavailable. Search for a place or enter coordinates instead.'
    case 'timeout':
      return 'Timed out waiting for your position. Try again, or search for a place.'
    case 'invalid':
      return 'The browser reported invalid coordinates. Search for a place or enter coordinates instead.'
  }
}

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
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [locateStatus, setLocateStatus] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const locatingRef = useRef(false)

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
          setGeoError('Place search unavailable — search a demo location or enter coordinates instead.')
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

  async function handleUseCurrentLocation() {
    if (locatingRef.current) return
    locatingRef.current = true
    setLocating(true)
    setLocateError(null)
    setLocateStatus(null)
    try {
      const fix = await getCurrentPosition()
      const latitude = fix.latitude
      const longitude = fix.longitude
      let label = 'Current location'
      try {
        const place = await reverseGeocode(latitude, longitude)
        if (place) label = place.name
      } catch {
        // Reverse geocoding unreachable: keep the REAL coordinates and an honest
        // "Current location" label. Never invent a place name.
      }
      setLocation(buildArbitraryLocation(latitude, longitude, label))
      setLocateStatus(
        label === 'Current location'
          ? `Current location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`
          : label,
      )
      setQuery('')
      setPlaceResults([])
    } catch (error) {
      if (error instanceof GeolocationUnavailableError) {
        setLocateError(honestLocateError(error.kind))
      } else {
        setLocateError(honestLocateError('position-unavailable'))
      }
    } finally {
      setLocating(false)
      locatingRef.current = false
    }
  }

  const showDropdown = query.trim().length > 0 && !coordsOpen

  return (
    <div className="relative" ref={containerRef}>
      <label className="sr-only" htmlFor="location-search">Search location</label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel-2 px-3 py-2">
        <Search size={15} className="shrink-0 text-command-soft" />
        <input
          id="location-search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search any place"
          className="w-36 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500 sm:w-56"
        />
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          aria-label={locating ? 'Getting current location…' : 'Use current location'}
          aria-busy={locating}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-command/40 bg-command/10 px-2 py-1.5 text-xs font-semibold text-command-soft transition hover:bg-command/20 disabled:cursor-wait disabled:opacity-60"
          title="Use your browser's current location"
        >
          <Locate size={14} className={locating ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">{locating ? 'Locating…' : 'Use current location'}</span>
        </button>
        <button
          type="button"
          onClick={() => setCoordsOpen((open) => !open)}
          aria-label="Toggle custom coordinates"
          aria-expanded={coordsOpen}
          className={`shrink-0 rounded-lg p-1.5 transition ${coordsOpen ? 'bg-command/15 text-command-soft' : 'text-slate-400 hover:bg-white/[.06] hover:text-slate-200'}`}
        >
          <Crosshair size={15} />
        </button>
      </div>
      {(locateError || locateStatus) && (
        <div className="absolute right-0 z-50 mt-2 max-w-[calc(100vw-4rem)] rounded-xl border border-white/10 bg-panel-2 px-3 py-2 shadow-2xl">
          {locateError && <p className="text-xs leading-5 text-rose-300">{locateError}</p>}
          {locateStatus && <p className="text-xs leading-5 text-command-soft">{locateStatus}</p>}
        </div>
      )}
      {showDropdown && (
        <div className="absolute right-0 z-50 mt-2 max-w-[calc(100vw-4rem)] overflow-hidden rounded-xl border border-white/10 bg-panel-2 p-1 shadow-2xl">
          {demoMatches.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setLocation(item)
                setQuery('')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/[.06]"
            >
              <MapPin size={14} className="text-command-soft" />
              <span>
                <b className="block text-sm text-white">{item.name}</b>
                <small className="text-slate-400">
                  {item.district}, {item.state} · SUGGESTED
                </small>
              </span>
            </button>
          ))}
          {placeResults.map((place) => (
            <button
              key={`${place.source}-${place.latitude}-${place.longitude}-${place.name}`}
              onClick={() => {
                setLocation(placeToLocation(place, coordinateName))
                setQuery('')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/[.06]"
            >
              <Globe size={14} className="text-command-soft" />
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
          {placeSearching && <p className="p-3 text-sm text-slate-400">Searching places…</p>}
          {geoError && <p className="p-3 text-xs leading-5 text-rose-300">{geoError}</p>}
          {showDropdown && !placeSearching && !geoError && demoMatches.length === 0 && placeResults.length === 0 && (
            <p className="p-3 text-sm text-slate-400">No places found.</p>
          )}
          {(demoMatches.length > 0 || placeResults.length > 0) && (
            <p className="px-3 pb-2 pt-1 text-[9px] leading-4 text-slate-500">{GEOCODING_ATTRIBUTION}</p>
          )}
        </div>
      )}
      {coordsOpen && (
        <div className="absolute right-0 z-50 mt-2 max-w-[calc(100vw-4rem)] rounded-xl border border-white/10 bg-panel-2 p-3 shadow-2xl">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[.13em] text-command-soft">
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
          {coordError && <p className="mt-2 text-[10px] text-rose-300">{coordError}</p>}
          <button
            onClick={applyCoordinates}
            className="mt-2 w-full rounded-lg bg-command/15 px-3 py-1.5 text-xs font-semibold text-command-soft hover:bg-command/25"
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
