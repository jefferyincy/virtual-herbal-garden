/**
 * Plant identification screen.
 *
 * HONESTY CONTRACT FOR THIS FILE - read before changing anything here.
 *
 * The build has no image-classification model and no `/api/identify` endpoint, so there is no way to
 * identify a plant from a photo. This screen therefore does NOT print invented match results. What
 * it does instead is a clearly-labelled *visual-similarity hint*: it reads the uploaded photo back
 * through a `<canvas>`, derives a deterministic colour/luminance signature from the cropped region,
 * derives the same signature from each monograph's own reference image, and ranks the monographs by
 * signature distance. That is a histogram comparison, not recognition - two unrelated plants can
 * score high and a real match can score low, which is why the panel says "not identification", the
 * confidence strip warns below 95%, and the method line states that no model runs.
 *
 * When nothing can be compared (no monograph has a readable reference image, or the photo cannot be
 * decoded/read back) the screen shows an explicit empty state pointing at plant search. It never
 * falls back to a plausible-looking ranked list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import type { Paginated, Plant } from '@/types/api';

const identifyKeys = { referencePlants: ['identify', 'reference-plants'] as const };

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, true> = { 'image/jpeg': true, 'image/png': true };
const WARNING_TEXT = 'Confidence below 95% - verify with a second source before using any plant';
/** Result rows follow the mockup: three candidates, the top one filled and the rest lighter. */
const MAX_MATCHES = 3;
/** Signature sample grid; small on purpose so one photo is compared to every record cheaply. */
const SAMPLE = 16;
const LUM_BINS = 8;
const HUE_BINS = 8;
const MIN_CROP = 0.12;
const FULL_CROP: Crop = { x0: 0, y0: 0, x1: 1, y1: 1 };
const INITIAL_CROP: Crop = { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.92 };

type Crop = { x0: number; y0: number; x1: number; y1: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Downsampled luminance + hue histograms plus the aspect ratio of what was sampled. */
type Signature = { luminance: number[]; colour: number[]; aspect: number };

type SimilarityMatch = { plant: Plant; score: number };

export default function IdentifyPage(): ReactNode {
  const navigate = useNavigate();

  const plantsQuery = useQuery({
    queryKey: identifyKeys.referencePlants,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', { query: { pageSize: 50 }, signal }),
  });

  const [photo, setPhoto] = useState<{ name: string; url: string; image: HTMLImageElement } | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Corner | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [crop, setCrop] = useState<Crop>(INITIAL_CROP);
  const [appliedCrop, setAppliedCrop] = useState<Crop>(INITIAL_CROP);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const cropRef = useRef<Crop>(INITIAL_CROP);
  // Reference signatures cost one image decode each; the cache keeps crop tweaks from re-decoding.
  const signatureCache = useRef<Map<string, Signature | null>>(new Map());
  // Tracks the live object URL so unmount can revoke it without touching state after teardown.
  const photoUrlRef = useRef<string | null>(null);

  const plants = useMemo(() => plantsQuery.data?.items ?? [], [plantsQuery.data]);

  const updateCrop = useCallback((next: Crop) => {
    cropRef.current = next;
    setCrop(next);
  }, []);

  const clearPhoto = useCallback(() => {
    const previousUrl = photoUrlRef.current;
    photoUrlRef.current = null;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    setPhoto(null);
    setAnalysis(null);
    setAnalyzing(false);
    setSelected(null);
    setFileError(null);
    updateCrop(INITIAL_CROP);
    setAppliedCrop(INITIAL_CROP);
  }, [updateCrop]);

  // Object URLs are a manual resource: release the live one when the screen unmounts.
  useEffect(() => () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
  }, []);

  const acceptFile = useCallback(
    async (file: File) => {
      // A rejected file clears any previous photo so the two panels can never disagree about which
      // image is being described.
      const reject = (message: string) => {
        clearPhoto();
        setFileError(message);
      };

      if (ACCEPTED_TYPES[file.type] !== true) {
        reject('That file is not a JPG or PNG. Export the photo as JPG or PNG and try again.');
        return;
      }
      if (file.size > MAX_BYTES) {
        reject('That file is larger than 10 MB. Resize the photo and try again.');
        return;
      }

      const url = URL.createObjectURL(file);
      const image = await loadImage(url, false);
      if (!image) {
        URL.revokeObjectURL(url);
        reject('That image could not be decoded. Try a different JPG or PNG export.');
        return;
      }

      setFileError(null);
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = url;
      setPhoto({ name: file.name, url, image });
      signatureCache.current.clear();
      updateCrop(INITIAL_CROP);
      setAppliedCrop(INITIAL_CROP);
      setAnalysis(null);
      setSelected(null);
    },
    [updateCrop],
  );

  /**
   * Re-runs whenever a photo or a committed crop arrives. The signature is taken from the crop, so a
   * crop change legitimately changes the hint; the pointerup commit keeps this off the drag path.
   * A `cancelled` flag drops the result of a superseded run (React 18 mounts effects twice in dev).
   */
  useEffect(() => {
    if (!photo || plants.length === 0) {
      setAnalysis(null);
      setAnalyzing(false);
      return;
    }

    let cancelled = false;
    setAnalyzing(true);

    void (async () => {
      const photoSignature = sampleImage(photo.image, appliedCrop);
      if (!photoSignature) {
        if (!cancelled) {
          setAnalysis({ matches: [], compared: 0, total: plants.length, unreadable: plants.length, photoReadable: false });
          setAnalyzing(false);
        }
        return;
      }

      const matches: SimilarityMatch[] = [];
      let compared = 0;
      let unreadable = 0;

      for (const plant of plants) {
        const reference = plant.images[0]?.url;
        if (!reference) {
          unreadable += 1;
          continue;
        }

        let signature = signatureCache.current.get(plant.slug);
        if (signature === undefined) {
          // `crossOrigin` makes an unreadable remote image fail the load instead of tainting the
          // canvas; either way the record is excluded rather than scored on missing pixels.
          const referenceImage = await loadImage(reference, true);
          signature = referenceImage ? sampleImage(referenceImage, FULL_CROP) : null;
          signatureCache.current.set(plant.slug, signature);
        }

        if (!signature) {
          unreadable += 1;
          continue;
        }
        compared += 1;
        matches.push({ plant, score: similarity(photoSignature, signature) });
      }

      // Deterministic: score descending, common name ascending so equal scores never reshuffle.
      matches.sort((a, b) => b.score - a.score || a.plant.commonName.localeCompare(b.plant.commonName));

      if (!cancelled) {
        setAnalysis({
          matches: matches.slice(0, MAX_MATCHES),
          compared,
          total: plants.length,
          unreadable,
          photoReadable: true,
        });
        setAnalyzing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photo, appliedCrop, plants]);

  const onCornerDown = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(corner);
  };

  const onCornerMove = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragging !== corner) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    updateCrop(moveCorner(cropRef.current, corner, x, y));
  };

  const onCornerUp = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragging !== corner) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
    // Only a committed crop re-runs the comparison, so dragging stays smooth.
    setAppliedCrop(cropRef.current);
  };

  const selectedMatch = analysis?.matches.find((match) => match.plant.slug === selected) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Smart feature"
        title="Plant identification"
        description="Compare a leaf photo against the reference images stored on the monograph records. No classifier runs in this build - the panel on the right compares colour and shape signatures only."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[55fr_45fr]">
        <section aria-label="Photo" className="flex flex-col gap-4">
          {!photo ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDropActive(false);
                const file = event.dataTransfer.files[0];
                if (file) void acceptFile(file);
              }}
              className={cn(
                'rounded-panel border border-dashed bg-bg-surface p-2 transition-colors duration-100 ease-base',
                dropActive ? 'border-accent-500' : 'border-accent-tint',
              )}
            >
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-card px-6 py-12 text-center transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="camera" size={32} className="text-accent-400" />
                <span className="text-h3 text-fg">Drop a leaf photo or browse</span>
                <span className="mono-label">JPG or PNG up to 10 MB</span>
                <span className="max-w-reading text-small text-fg-muted">
                  The photo stays in this browser tab: nothing is uploaded, because this build has no
                  upload or classification endpoint.
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-center overflow-hidden rounded-panel border border-line-subtle bg-bg-surface">
                {/* The overlay wraps the rendered image, so crop fractions map to the visible pixels. */}
                <div ref={overlayRef} className="relative inline-block leading-none">
                  <img
                    src={photo.url}
                    alt={`Uploaded photo ${photo.name}`}
                    className="max-h-[520px] max-w-full object-contain"
                  />
                  {/* The sampled region; only its accent corner handles move it. */}
                  <div
                    className="absolute border border-accent-500"
                    style={{
                      left: `${crop.x0 * 100}%`,
                      top: `${crop.y0 * 100}%`,
                      width: `${(crop.x1 - crop.x0) * 100}%`,
                      height: `${(crop.y1 - crop.y0) * 100}%`,
                    }}
                  >
                    {CORNERS.map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`Adjust the ${CORNER_LABEL[corner]} of the crop region`}
                        onPointerDown={onCornerDown(corner)}
                        onPointerMove={onCornerMove(corner)}
                        onPointerUp={onCornerUp(corner)}
                        onPointerCancel={onCornerUp(corner)}
                        className={cn(
                          'absolute size-11 cursor-grab touch-none rounded-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                          CORNER_POSITION[corner],
                        )}
                      >
                        <span className="absolute inset-0 m-auto size-3 rounded-micro border-2 border-accent-500 bg-bg-base" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="mono-label">
                  Crop defines what is compared, not the whole frame. Source · {photo.name}
                </p>
                <Button variant="secondary" size="sm" iconLeft="close" onClick={clearPhoto}>
                  Remove
                </Button>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            id="identify-file"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset the input so picking the same file twice still fires a change event.
              event.target.value = '';
              if (file) void acceptFile(file);
            }}
          />

          {fileError && (
            <ErrorState
              title="That photo cannot be used"
              message={fileError}
              onRetry={() => inputRef.current?.click()}
              retryLabel="Choose another photo"
            />
          )}
        </section>

        <section aria-label="Best matches" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2 text-fg">Best matches</h2>
            <p className="mono-label text-warning">Visual similarity only - not identification</p>
          </div>

          {fileError ? null : !photo ? (
            <EmptyState
              title="No photo yet"
              description="Add a leaf photo to compare it against the reference images on the monograph records. The comparison is a colour and shape signature, so treat the order as a hint only."
              watermark="camera"
            />
          ) : plantsQuery.isLoading || analyzing ? (
            <div className="flex flex-col gap-4" role="status" aria-label="Comparing photo">
              <p className="mono-label">Decoding the photo and the reference images</p>
              <Skeleton variant="card" height={92} />
              <Skeleton variant="card" height={92} />
              <Skeleton variant="card" height={92} />
            </div>
          ) : plantsQuery.isError ? (
            <ErrorState
              title="Could not load the reference images"
              message="The comparison needs the monograph records, and they did not load."
              onRetry={() => void plantsQuery.refetch()}
            />
          ) : !analysis || !analysis.photoReadable || analysis.compared === 0 ? (
            /*
             * No honest comparison is possible, so no ranked list is shown: either the photo could
             * not be read back, or not one monograph has a readable reference image.
             */
            <EmptyState
              title="Automatic identification is not available in this build"
              description={
                analysis && !analysis.photoReadable
                  ? 'The photo could not be read back into a colour signature, so nothing can be compared. Search the plant archive instead.'
                  : `None of the ${analysis?.total ?? plants.length} monograph records has a reference image this browser can read, so there is nothing to compare against. Search the plant archive instead.`
              }
              watermark="camera"
              action={
                <Link
                  to="/plants"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <Icon name="search" size={18} />
                  Search the plant archive
                </Link>
              }
            />
          ) : (
            <>
              <div
                role="note"
                className="flex items-start gap-3 rounded-card bg-warning/15 px-4 py-3"
              >
                <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-warning" />
                <p className="text-small text-fg-secondary">{WARNING_TEXT}</p>
              </div>

              <p className="mono-label">
                Method: downsampled luminance and hue signature of the crop, compared with each
                reference image - no model runs. {analysis.compared} of {analysis.total} monographs
                compared; {analysis.unreadable} cannot be compared (no reference image, or the image
                is not readable in this browser).
              </p>

              <ul className="flex flex-col gap-3">
                {analysis.matches.map((match, index) => {
                  const isSelected = match.plant.slug === selected;
                  const image = match.plant.images[0];
                  return (
                    <li key={match.plant.slug}>
                      <button
                        type="button"
                        onClick={() => setSelected(match.plant.slug)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex w-full items-start gap-4 rounded-card border p-4 text-left transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                          isSelected
                            ? 'border-accent-600 bg-bg-surface'
                            : 'border-line-subtle bg-bg-surface hover:border-line-strong',
                        )}
                      >
                        <span className="size-16 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
                          {image && (
                            <img
                              src={image.url}
                              alt={image.alt}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-2">
                          <span className="mono-label">
                            Match {index + 1} - visual similarity
                          </span>
                          <span className="truncate text-h3 text-fg">{match.plant.commonName}</span>
                          <span className="botanical truncate text-small text-clay-400">
                            {match.plant.botanicalName}
                          </span>
                          {/* The primitive owns the ramp and the mono percentage; the ranked
                              emphasis below the top row is carried by opacity, so "top match
                              filled, the others lighter" holds even when scores are close. */}
                          <ConfidenceBar
                            value={match.score}
                            className={index === 0 ? undefined : index === 1 ? 'opacity-70' : 'opacity-50'}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <Button
              iconRight="arrow-right"
              disabled={!selectedMatch}
              onClick={() => {
                if (selectedMatch) navigate(`/plants/${selectedMatch.plant.slug}`);
              }}
            >
              Open plant profile
            </Button>
            <Button variant="secondary" iconLeft="refresh" disabled={!photo} onClick={clearPhoto}>
              Identify another
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ signature helpers */

type Analysis = {
  matches: SimilarityMatch[];
  compared: number;
  total: number;
  unreadable: number;
  /** false when the uploaded photo itself could not be read back into a signature. */
  photoReadable: boolean;
};

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

const CORNER_LABEL: Record<Corner, string> = {
  tl: 'top left corner',
  tr: 'top right corner',
  bl: 'bottom left corner',
  br: 'bottom right corner',
};

/** Hit targets are 44px and centred on the corner, so the visible mark stays small. */
const CORNER_POSITION: Record<Corner, string> = {
  tl: '-left-5 -top-5',
  tr: '-right-5 -top-5',
  bl: '-left-5 -bottom-5',
  br: '-right-5 -bottom-5',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Moves one corner, keeping a minimum crop so the handles can never cross or invert. */
function moveCorner(crop: Crop, corner: Corner, x: number, y: number): Crop {
  const left = clamp(x, 0, crop.x1 - MIN_CROP);
  const top = clamp(y, 0, crop.y1 - MIN_CROP);
  const right = clamp(x, crop.x0 + MIN_CROP, 1);
  const bottom = clamp(y, crop.y0 + MIN_CROP, 1);
  if (corner === 'tl') return { x0: left, y0: top, x1: crop.x1, y1: crop.y1 };
  if (corner === 'tr') return { x0: crop.x0, y0: top, x1: right, y1: crop.y1 };
  if (corner === 'bl') return { x0: left, y0: crop.y0, x1: crop.x1, y1: bottom };
  return { x0: crop.x0, y0: crop.y0, x1: right, y1: bottom };
}

/**
 * Decodes `url` and resolves the element, or null when the browser cannot decode or fetch it.
 *
 * `img.decode()` states completion directly, so the loader stays linear with no event wiring.
 * A browser without decode() (pre-2018) rejects the call and every record takes the unreadable
 * path, which is exactly the labelled empty state rather than a guessed ranking.
 */
async function loadImage(url: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  const image = new Image();
  // `crossOrigin` requires CORS headers on the reference image; without them the load fails here
  // and, more importantly, the canvas readback is never tainted by pixels we cannot inspect.
  if (crossOrigin) image.crossOrigin = 'anonymous';
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * Reads the (cropped) region of `image` back through a canvas at SAMPLE x SAMPLE.
 * Returns null when the canvas cannot be read - a cross-origin image without CORS headers, a broken
 * decode or a browser without canvas support. Null means "this record cannot be compared", never a
 * zero score pretending to be a comparison.
 */
function sampleImage(image: HTMLImageElement, crop: Crop): Signature | null {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (sourceWidth === 0 || sourceHeight === 0) return null;

  const sx = crop.x0 * sourceWidth;
  const sy = crop.y0 * sourceHeight;
  const sw = (crop.x1 - crop.x0) * sourceWidth;
  const sh = (crop.y1 - crop.y0) * sourceHeight;
  if (sw <= 0 || sh <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, SAMPLE, SAMPLE);

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    // Tainted canvas: the pixels are not readable, so the image is not comparable.
    return null;
  }

  const luminance = new Array<number>(LUM_BINS).fill(0);
  const colour = new Array<number>(HUE_BINS).fill(0);

  for (let index = 0; index < pixels.length; index += 4) {
    const r = (pixels[index] ?? 0) / 255;
    const g = (pixels[index + 1] ?? 0) / 255;
    const b = (pixels[index + 2] ?? 0) / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const lumBin = clamp(Math.floor(y * LUM_BINS), 0, LUM_BINS - 1);
    luminance[lumBin] = (luminance[lumBin] ?? 0) + 1;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    let hue = 0;
    if (chroma > 0) {
      if (max === r) hue = ((g - b) / chroma) % 6;
      else if (max === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      if (hue < 0) hue += 6;
    } else {
      // Achromatic pixels weigh on brightness, not hue; bin 0 would otherwise absorb grey.
      hue = (y * 6) % 6;
    }
    const hueBin = clamp(Math.floor(hue), 0, HUE_BINS - 1);

    // Weighting by saturation and brightness keeps flat dark backgrounds from dominating the hue
    // histogram, which is the failure mode that makes two dark photos look identical.
    const saturation = max === 0 ? 0 : chroma / max;
    colour[hueBin] = (colour[hueBin] ?? 0) + 1 + saturation * max * 4;
  }

  return { luminance: normalise(luminance), colour: normalise(colour), aspect: sw / sh };
}

function normalise(values: number[]): number[] {
  let total = 0;
  for (const value of values) total += value;
  if (total === 0) return values.map(() => 0);
  return values.map((value) => value / total);
}

/** L1 histogram distance mapped to 0..1, where 1 means identical distributions. */
function histogramSimilarity(a: number[], b: number[]): number {
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    distance += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return clamp(1 - distance / 2, 0, 1);
}

/**
 * Composite score: colour and luminance carry most of the signal, the aspect ratio a small part
 * (shape). Weights are fixed constants so the same photo always yields the same ranking.
 */
function similarity(a: Signature, b: Signature): number {
  const colourScore = histogramSimilarity(a.colour, b.colour);
  const luminanceScore = histogramSimilarity(a.luminance, b.luminance);
  const aspectScore = clamp(1 - Math.abs(Math.log(a.aspect / b.aspect)) / Math.log(4), 0, 1);
  return colourScore * 0.5 + luminanceScore * 0.35 + aspectScore * 0.15;
}
