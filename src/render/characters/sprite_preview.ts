// Canvas-based sprite preview for character creation/selection screens.
// Renders the 2D billboard sprite on a 2D canvas, replacing the 3D GLB model
// for non-mech classes.
import type { SpriteSheetMeta, Direction } from '../billboard/types';
import { getFrameUVs, getAnimRow } from '../billboard/types';
import { loadSpriteSheetMeta, loadSpriteSheetTexture } from '../billboard/loader';

const SPRITE_URL = '/models/chars/sprite_003_.png';
const SPRITE_META_URL = '/models/chars/sprite_003_.json';

/** Preview direction — always show the front-facing view. */
const PREVIEW_DIRECTION: Direction = 'SE';

export interface SpritePreviewOptions {
  /** Width of the canvas (default: container width). */
  width?: number;
  /** Height of the canvas (default: container height). */
  height?: number;
}

/**
 * Lightweight canvas-based sprite preview.
 * Renders the idle frame of the player sprite on a 2D canvas,
 * suitable for character creation/selection screens.
 */
export class SpritePreview {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private meta: SpriteSheetMeta | null = null;
  private image: HTMLImageElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, canvas?: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.objectFit = 'contain';
    this.ctx = this.canvas.getContext('2d')!;

    if (!canvas) {
      this.container.appendChild(this.canvas);
    }

    this.setupResizeObserver();
    void this.loadSprite();
  }

  private async loadSprite(): Promise<void> {
    if (this.destroyed) return;
    try {
      const [meta] = await Promise.all([
        loadSpriteSheetMeta(SPRITE_META_URL),
        this.loadImage(SPRITE_URL),
      ]);
      if (this.destroyed) return;
      this.meta = meta;
      this.render();
    } catch (err) {
      console.error('Failed to load sprite preview:', err);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.image = img;
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Set the class (no-op for sprite — always shows the same sprite). */
  setClass(_cls: string): void {
    // Sprite preview shows the same sprite regardless of class.
    // The 3D GLB model was class-specific, but the sprite is universal.
    this.render();
  }

  /** Set the skin index (no-op for sprite — single skin). */
  setSkin(_skinIndex: number): void {
    // No skin variation in the sprite sheet yet.
  }

  /** Set appearance (no-op for sprite). */
  setAppearance(_a: unknown): void {
    this.render();
  }

  /** Sync canvas size to container and re-render. */
  syncSize(): void {
    if (this.destroyed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      const dpr = Math.min(window.devicePixelRatio, 2);
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.ctx.scale(dpr, dpr);
      this.render();
    }
  }

  /** Capture a closeup PNG data URL (for avatars, player cards, etc.). */
  captureCloseup(opts: { width?: number; height?: number } = {}): string {
    const width = Math.max(1, Math.round(opts.width ?? 540));
    const height = Math.max(1, Math.round(opts.height ?? 720));

    // Save current state
    const prevWidth = this.canvas.width;
    const prevHeight = this.canvas.height;
    const prevStyle = this.canvas.style.width;

    // Temporarily resize for capture
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.render();

    const url = this.canvas.toDataURL('image/png');

    // Restore
    this.canvas.width = prevWidth;
    this.canvas.height = prevHeight;
    this.canvas.style.width = prevStyle;
    this.render();

    return url;
  }

  private render(): void {
    if (this.destroyed || !this.meta || !this.image) return;

    const { width: cw, height: ch } = this.canvas;
    if (cw === 0 || ch === 0) return;

    this.ctx.clearRect(0, 0, cw, ch);

    // Get the UV coordinates for the preview direction (idle, frame 0)
    const animRow = getAnimRow(this.meta, 'idle');
    const uvs = getFrameUVs(this.meta, PREVIEW_DIRECTION, animRow, 0);

    // Source rectangle in the sprite sheet.
    // For mirrored directions, u points to the RIGHT edge; the canvas flip
    // reads it right-to-left, so srcX must be the right edge minus srcW.
    const srcW = Math.abs(uvs.uSize) * this.image.width;
    const srcH = uvs.vSize * this.image.height;
    const srcX = uvs.mirror
      ? (uvs.u - Math.abs(uvs.uSize)) * this.image.width
      : uvs.u * this.image.width;
    const srcY = (1 - uvs.v - uvs.vSize) * this.image.height;

    // Destination: fit the sprite into the canvas while maintaining aspect ratio,
    // then scale to 50% for pixel art — full size is too large for the preview.
    const spriteAspect = srcW / srcH;
    const canvasAspect = cw / ch;
    const SCALE = 0.5;

    let drawW: number;
    let drawH: number;
    if (spriteAspect > canvasAspect) {
      drawW = cw * SCALE;
      drawH = (cw * SCALE) / spriteAspect;
    } else {
      drawH = ch * SCALE;
      drawW = (ch * SCALE) * spriteAspect;
    }

    // Center the sprite in the canvas
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    // Flip horizontally if the UV repeat is negative (mirrored direction)
    if (uvs.mirror) {
      this.ctx.save();
      this.ctx.translate(cw, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        this.image,
        srcX, srcY, srcW, srcH,
        drawX, drawY, drawW, drawH,
      );
      this.ctx.restore();
    } else {
      this.ctx.drawImage(
        this.image,
        srcX, srcY, srcW, srcH,
        drawX, drawY, drawW, drawH,
      );
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.syncSize();
    });
    this.resizeObserver.observe(this.container);
  }

  /** Move the canvas to a different container. */
  setContainer(container: HTMLElement): void {
    if (this.destroyed) return;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.container = container;
    this.container.appendChild(this.canvas);
    this.syncSize();
    this.setupResizeObserver();
  }

  /** Cleanup resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.canvas.remove();
  }
}

// ---------------------------------------------------------------------------
// Sprite headshot extractor — captures a head-and-shoulders portrait from a
// sprite sheet, suitable for use as a player avatar/portrait.
// ---------------------------------------------------------------------------

/** Headshot crop: top 40% of the sprite frame (head + shoulders). */
const HEADSHOT_CROP_HEIGHT = 0.4;

/** Cache for generated headshot data URLs, keyed by `${spriteKey}:${direction}`. */
const headshotCache = new Map<string, string>();

/**
 * Capture a head-and-shoulders portrait from a sprite sheet.
 * Returns a 256x256 PNG data URL, or null if the sprite hasn't loaded yet.
 *
 * @param spriteKey - sprite filename without extension (e.g., 'sprite_001_')
 * @param direction - direction column index (0=SE, 1=E, 2=N, 3=NW). Default 0 (SE).
 */
export async function captureSpriteHeadshot(
  spriteKey: string,
  direction: number = 0,
): Promise<string | null> {
  const cacheKey = `${spriteKey}:${direction}`;
  const cached = headshotCache.get(cacheKey);
  if (cached) return cached;

  const metaUrl = `/models/chars/${spriteKey}.json`;
  const textureUrl = `/models/chars/${spriteKey}.png`;

  try {
    const [meta, img] = await Promise.all([
      loadSpriteSheetMeta(metaUrl),
      loadImageAsync(textureUrl),
    ]);

    const frameW = meta.frameWidth;
    const frameH = meta.frameHeight;

    // Source rectangle: head area from the specified direction column
    const srcX = direction * frameW;
    const srcY = 0;
    const srcW = frameW;
    const srcH = Math.round(frameH * HEADSHOT_CROP_HEIGHT);

    // Create offscreen canvas for headshot
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Disable image smoothing for crisp pixel art
    ctx.imageSmoothingEnabled = false;

    // Draw the head area, scaled to fill 256x256
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 256, 256);

    const url = canvas.toDataURL('image/png');
    headshotCache.set(cacheKey, url);
    return url;
  } catch (err) {
    console.warn(`[sprite_preview] Failed to capture headshot for ${spriteKey}:`, err);
    return null;
  }
}

/** Load an image as a promise. */
function loadImageAsync(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
