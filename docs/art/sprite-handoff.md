# Artist Handoff: Sprite Sheet Production — World of ClaudeCraft

**Document Version:** 1.0  
**Date:** 2026-07-29  
**From:** Art Director  
**To:** Freelance / In-House Sprite Artist  
**Status:** Live — Phase 2 Target  

---

## Table of Contents

1. [Art Brief — Visual Direction](#1-art-brief--visual-direction)
2. [Sprite Sheet Template — Frame Grid & Layout](#2-sprite-sheet-template--frame-grid--layout)
3. [Style Guide — Reference Games & Application](#3-style-guide--reference-games--application)
4. [Technical Specifications](#4-technical-specifications)
5. [Quality Checklist](#5-quality-checklist)
6. [JSON Metadata Template](#6-json-metadata-template)

---

## 1. Art Brief — Visual Direction

### 1.1 Project Identity

World of ClaudeCraft is a 2.5D isometric MMORPG. Characters render as **hand-painted billboard sprites** embedded in a fully 3D-rendered world with dynamic lighting, PBR materials, and post-processing (bloom, ambient occlusion, depth-of-field). The visual identity sits at the intersection of classic Korean-style sprite-based MMORPGs and modern 3D rendering.

**Target emotional response:** Warm, vibrant, and crafted — the world should feel like a painted diorama come to life, not a realistic simulation.

### 1.2 Colour Palette Guidelines

The palette prioritises **warmth, saturation, and readability**:

```
WARM CORE            COOL ACCENTS          METALLIC ACCENTS
─ ─ ─ ─ ─ ─ ─ ─     ─ ─ ─ ─ ─ ─ ─ ─     ─ ─ ─ ─ ─ ─ ─ ─
#E8B870  gold        #2A3040  deep navy   #C0B090  bronze
#D4956A  amber       #406080  steel blue  #D4C098  brass
#C47D5A  rust        #5A6A7A  slate       #8A7A60  tarnished
#9A6040  burnished   #4A6A5A  muted teal  #E0D0B0  polished
```

**Rules:**

| Rule | Specification |
|------|--------------|
| Dominant hue range | 20°–50° (orange-amber) for warm zones; 200°–240° (blue-slate) for cool contrast |
| Minimum saturation (HSV) | **≥ 65** across character area. Local sampling: 5 random pixels per frame; reject if any fall below 40 saturation |
| Maximum value range | 25%–95% (keep proper shading range — don't flatten to midtones) |
| Class colour identities | Each class owns a dominant local colour (see §1.3). These override the warm default |
| Background / negative space | Transparent (alpha = 0). Frame edges should NOT contain painted background or ground plane |

### 1.3 Class Colour Identities

| Class | Dominant Colour | Accent | Notes |
|-------|----------------|--------|-------|
| Warrior | Steel blue `#4A6A8A` | Crimson `#8A2A2A` | Armour should read as burnished metal |
| Mage | Deep purple `#5A2A7A` | Gold `#D4A040` | Robes with inner-lining contrast |
| Rogue | Charcoal `#3A3A3A` | Emerald `#2A7A4A` | Leather textures, low-reflection |
| Paladin | Ivory `#D0C8B0` | Royal blue `#2A4A7A` | Clean, polished surfaces |
| Ranger | Forest green `#3A6A3A` | Leather brown `#8A6A3A` | Organic materials, muted reflections |
| Shadow Knight | Midnight `#1A1A2A` | Violet `#5A2A6A` | Dark with strategic bright accents |

### 1.4 Lighting Convention

All sprites are **pre-lit** with a fixed light-from-above-left convention that matches the world sun (sun elevation ~35°, azimuth south-east).

```
        ☀ LIGHT SOURCE (above-left)
          ↙
          ↙
          ↙
    ┌──────────┐
    │          │  ← Top-left facets catch the light
    │   ▓      │  ← Recessed areas (armpit, under chin, behind shield) go dark
    │          │  ← Right side receives soft fill
    └──────────┘
          ↘
          ↘ Shadow cast down-right (ground contact)
```

**Specific requirements:**

| Element | Specification |
|---------|--------------|
| Primary highlight | Top-left quadrant of each body part (shoulders, crown of head, top of weapon) |
| Core shadow | Right-lower edges, under-chin, under-arm, behind shield |
| Cast shadow (ground) | Do NOT paint ground shadows. The engine adds circle-blob shadows at runtime |
| Rim light | A thin warm rim (optional on high-tier sprites) along the right/back edge, matching sun tint `#FFEDD0` |
| Fill light | Subtle green-warm bounce on underside areas (simulating grass bounce `#46603A`) at ~15% intensity |
| Eye glint | Small white catch-light in the top-left quadrant of each eye |

### 1.5 Silhouette Readability Standards

At game resolution, characters render at approximately **64–128 px** visible height on a 1080p display. Every sprite must be readable at that scale.

| Criterion | Standard |
|-----------|----------|
| **Class silhouette** | Must distinguish class from shape alone at 64×64 px downscale (warrior = broad + shield, mage = robed + staff/cowl, rogue = slim + hood/cloak) |
| **Limb separation** | Arms must separate visually from torso. Use contrast outlines or colour-bridged gaps (3+ px separation between overlapping limbs) |
| **Weapon/profile break** | Held items (swords, staves, bows) must break the silhouette profile so they read as separate from the body mass |
| **Head/face area** | Minimum 20×20 px of face area for expression readability. Eyes must be distinct specks at full resolution |
| **No dark-on-dark occlusion** | Avoid dark-coloured limbs in front of dark-coloured torso. Use a lighter rim or outline to separate layers |

### 1.6 Anatomy Proportions

| Body Part | Proportion (relative to total height = 1536 px) |
|-----------|--------------------------------------------------|
| Head | ~8% (120–130 px) |
| Torso (shoulder to hip) | ~30% (450–470 px) |
| Legs (hip to foot) | ~45% (680–700 px) |
| Arms | Extend to mid-thigh |
| Total character height | Should fill approximately **80–90% of frame height** (1230–1380 px tall). Leave 75–150 px above head and 75–150 px below feet for safe zone |

---

## 2. Sprite Sheet Template — Frame Grid & Layout

### 2.1 Canvas Overview

| Property | Value | Visual |
|----------|-------|--------|
| **Canvas size** | **2752 × 6144 px** (4 columns × 1536 px rows) | |
| **Frames per row** | 4 | `[SE] [E] [N] [NW]` |
| **Rows** | 4 | `[idle] [walk] [attack] [cast]` |
| **Total cells** | 16 (4 cols × 4 rows) | |
| **Export name** | `sprite_XXX_.png` | |

```
┌─────────┬─────────┬─────────┬─────────┐  ─── row 0 (idle)
│   SE    │    E    │    N    │   NW    │
│  col 0  │  col 1  │  col 2  │  col 3  │
├─────────┼─────────┼─────────┼─────────┤  ─── row 1 (walk)
│   SE    │    E    │    N    │   NW    │
│  col 0  │  col 1  │  col 2  │  col 3  │
├─────────┼─────────┼─────────┼─────────┤  ─── row 2 (attack)
│   SE    │    E    │    N    │   NW    │
│  col 0  │  col 1  │  col 2  │  col 3  │
├─────────┼─────────┼─────────┼─────────┤  ─── row 3 (cast)
│   SE    │    E    │    N    │   NW    │
│  col 0  │  col 1  │  col 2  │  col 3  │
└─────────┴─────────┴─────────┴─────────┘
    688 px each frame
```

### 2.2 Frame Dimensions

| Parameter | Value |
|-----------|-------|
| **Frame width** | **688 px** |
| **Frame height** | **1536 px** |
| Aspect ratio | ~1:2.23 (portrait) |
| Per-frame pixel budget | 688 × 1536 = 1,056,768 px (1 MP) |

### 2.3 Direction Mapping

The sprite sheet contains **4 source directions** arranged as columns:

| Column | Direction | Shorthand | Angle from camera | When It Displays |
|--------|-----------|-----------|-------------------|------------------|
| 0 | SE | Front-right 3/4 | 0°–67° | Camera in front-right quadrant |
| 1 | E | Right profile | 68°–112° | Camera directly to the right |
| 2 | N | Back | 113°–180° | Camera behind the character |
| 3 | NW | Back-left 3/4 | 181°–247° | Camera in back-left quadrant |

These 4 source directions cover 68.75% of the viewing circle. The remaining 31.25% is covered by mirroring (see §2.5).

**Character facing convention:**  
The character's "forward" is +Z (south). The camera rotates around the character. The direction displayed depends on which side of the character the camera sees (Ragnarok Online convention), not the character's world-space facing.

### 2.4 Animation Row Assignments

| Row | Animation | Frame Count | Loop | Visual Description |
|-----|-----------|-------------|------|--------------------|
| **0** | **idle** | 2 | Yes | Frame 0: neutral standing stance. Frame 1 (optional): subtle weight shift — hip sway or gentle breath. Loop period ~1 s (1 FPS). If only 1 frame, paint Frame 0 only; Frame 1 should be blank/unused |
| **1** | **walk** | 2 | Yes | Frame 0: left foot forward, right arm forward. Frame 1: right foot forward, left arm forward. Loop at 6 FPS (~167 ms per frame). Hair, cloak, and loose fabric should sway opposite to movement direction |
| **2** | **attack** | 2 | No | Frame 0: wind-up (weapon pulled back, weight on rear foot). Frame 1: strike pose (weapon extended, weight forward). Plays once, returns to idle. Weapon must follow a clear arc between frames |
| **3** | **cast** | 2 | No | Frame 0: hands raised to chest height, glowing focus (spell effect implied by hand pose). Frame 1: release (arms extended forward/upward, fingers splayed). Plays once, returns to idle |

**Important:** Row 0 (idle) is the **fallback row**. Until multi-row sprites are delivered, all animations reference row 0. When creating full sprites, each row should be self-consistent in character design.

### 2.5 Mirroring Pairs

To reduce art production by ~43%, the game flips certain source frames horizontally at runtime rather than requiring them to be painted:

| Mirror Direction | Mirrors From | Horizontal Flip |
|-----------------|--------------|-----------------|
| **SW** (front-left 3/4) | **SE** (front-right 3/4) | Flip X |
| **W** (left profile) | **E** (right profile) | Flip X |
| **NE** (back-right 3/4) | **NW** (back-left 3/4) | Flip X |

**What this means for the artist:**
- You only paint **4 of the 7 directions**: SE, E, N, NW
- The engine mirrors SE→SW, E→W, and NW→NE at runtime using negative UV repeat on the texture
- **Critical requirement:** Mirrored pairs must be **paintable as exact horizontals flips of each other**. This means:
  - The character must be centred in the frame (see §2.6)
  - Symmetrical character design is preferred for the torso/core. Asymmetrical details (scar on one cheek, pauldron on one shoulder) should be placed on the SE or NW frames where the mirrored counterpart is rotationally distinct
  - Weapons held in the character's right hand (viewer's right in SE frame) will appear in the left hand when mirrored to SW. This is correct and intended — the billboard system treats the sprite as a 2D illustration, not a 3D model
  - **Trailing cloth, hair, or accessories that flow in a specific direction:** Paint them neutrally or with a symmetrical flow pattern. Extreme asymmetry (e.g., cape always blowing left) will appear wrong when mirrored

### 2.6 Safe Zones and Character Positioning

```
┌──────────────────────┐
│  ▲  75 px safe zone  │  ← Keep 75+ px empty above highest point
│                      │     (hair, hat, weapon tip)
│                      │
│   ┌──────────────┐   │
│   │  ACTIVE AREA  │   │  ← Character occupies this zone
│   │  540×1300 px  │   │     (centered horizontally)
│   │              │   │
│   │   ◉ pivot    │   │  ← Pivot point: 344 px from left,
│   │              │   │     1050 px from top (belt line)
│   └──────────────┘   │
│                      │
│  ▼  75+ px safe zone │  ← Keep 75+ px empty below lowest point
│                      │     (feet, robe hem, ground-contact)
└──────────────────────┘
 ◄── 688 px ──►
```

**Rules:**

| Rule | Specification |
|------|--------------|
| **Horizontal centring** | Character's centre-line must align with frame centre (344 px from left edge), across ALL frames and ALL directions |
| **Vertical ground line** | Character feet should rest at ~1360 px from top of frame (±10 px tolerance). This leaves ~176 px above the head. ALL frames must share this ground line — if the character walks "up" in a walk frame, the stride sways the body; the lowest foot point stays at ~1360 px |
| **Pivot consistency** | The belt-line pivot point (344×1050) should be the centre of rotation/weight shift. The character should not drift laterally from frame to frame — use onion-skinning to verify |
| **Frame boundary** | No part of the character may touch the frame edge. Minimum 75 px margin on all sides |
| **Inter-cell bleeding** | Due to bilinear filtering (`LinearFilter`), neighbouring pixels bleed ~1 px across frame edges. Paint a 1–2 px transparent gutter between each frame's content and the cell boundary. **Do NOT leave opaque pixels at the exact column/row boundaries** |
| **Weapon/prop overlap** | Two-handed weapons, staves, and bows may extend into the side margin but must not exceed the frame edge. Keep weapon tips at least 30 px from the frame edge |

### 2.7 Single-Frame Sheets (Current Phase 1)

If creating a single-frame sprite (idle-only, row 0 only):

| Setting | Value |
|---------|-------|
| Canvas size | **2752 × 1536 px** (1 row) |
| Frame count | 1 per direction (4 total cells) |
| All animations | Point to row 0 in JSON |

---

## 3. Style Guide — Reference Games & Application

### 3.1 Reference Alignment Overview

| Reference | What to Study | How to Apply |
|-----------|---------------|--------------|
| **Tree of Savior** | Warm fantasy palette, painterly textures, 2D billboards in 3D world | Sprite colour integration with environment; avoid "cutout" look via soft edge feathering |
| **Ragnarok Origin** | Bold class silhouettes, clean colour blocking, directional sprite system | Strong shape language per class; high-contrast outlines; 4-direction + mirror convention |
| **Granblue Fantasy Relink** (billboard NPCs) | High-resolution illustrated detail, crisp at close zoom | Paint at 100% resolution — details must survive close-up inspection |
| **Eiyuden Chronicle** | Vibrant saturation, hand-crafted feel, emotional warmth | Saturation ≥ 65 HSV; avoid flat digital shading; embrace visible brushwork |

### 3.2 Tree of Savior — Painterly Integration

**Study:** Tree of Savior characters sit naturally in 3D environments without feeling like paper cutouts.

**Application:**

| Technique | Specification |
|-----------|--------------|
| Edge feathering | Outer edges of the sprite should have 1–3 px of partial alpha (fade to transparent). Do NOT use hard "cut-out" edges except on metallic armour plates |
| Colour bleed from environment | Accept subtle hints of warm green on underside edges (grass bounce). Paint a faint green-warm tint (#46603A at 10–15% opacity) along the lower-right edges |
| Shadow gradient | Do not paint harsh shadow lines. Use soft, gradient-like shading transitions. The "painterly" look comes from soft value shifts, not airbrush though — keep visible brush texture |
| Texture in flat areas | Large flat armour/robe surfaces should have subtle texture variation (cloth weave, leather grain, brushed metal). Avoid perfectly flat digital fills |
| Outline weight | No uniform black outline. Use colour-based separation — darker versions of the local colour for internal lines, not black |

### 3.3 Ragnarok Origin — Silhouette & Direction

**Study:** Ragnarok Origin's sprites are immediately identifiable by silhouette alone at game resolution.

**Application:**

| Technique | Specification |
|-----------|--------------|
| **Class-specific profile** | Each class must have a distinct outer silhouette. Check: if the sprite is converted to a solid black shape, can you still identify the class? |
| **Shoulder width** | Exaggerate shoulder breadth on warrior/melee classes. Mages/ranged have narrower shoulders, wider robe bottom |
| **Head-to-body ratio** | Slightly heroic ~1:6.5 to 1:7 ratio (head is slightly smaller than realistic, making the character feel taller and more heroic) |
| **High-contrast blocking** | Use 3–4 clear value bands (light, mid-light, mid-dark, dark) rather than smooth 256-step gradients. This creates the "clean colour blocking" look |
| **Directional clarity** | In the E and N views, the character's profile/back must read immediately. Do not add so much detail that the direction is ambiguous |

### 3.4 Granblue Fantasy Relink — Close-Up Crispness

**Study:** Granblue Relink's 2D billboard NPCs hold up when the camera moves close.

**Application:**

| Technique | Specification |
|-----------|--------------|
| **Full-resolution painting** | Paint at 688 × 1536 px per frame. Do NOT paint small and scale up. Every hair strand, armour rivet, and facial feature must be intentionally painted at final resolution |
| **Face detail** | Eyes must be distinct (minimum 8×4 px each). Eyebrows visible. Mouth defined by shadow line, not a solid line. Hair should have 3+ highlight strands |
| **Armour texture** | Metallic surfaces need distinct highlight shapes (reflecting the light source above-left), not gradient fills. At least 2 highlight facets per armour piece |
| **Fabric texture** | Robes and cloth should show fold lines (3–5 major folds, 2–3 minor folds per garment) |
| **Weapon detail** | Weapon blades must have a clear edge highlight and a reflection streak along the blade axis |

### 3.5 Eiyuden Chronicle — Vibrancy & Hand-Crafted Feel

**Study:** Eiyuden Chronicle's characters burst with saturated colour and feel hand-painted.

**Application:**

| Technique | Specification |
|-----------|--------------|
| **Saturation floor** | Average saturation across character area ≥ 65 in HSV. This is measured and enforced. Muted, desaturated palettes will be rejected |
| **Visible brushwork** | Allow visible stroke texture and slight colour variation within colour areas. Avoid the "flat fill + airbrush shadow" look. Use a textured brush for base colour fills |
| **Colour temperature contrast** | Warm characters against cool background (world environment is warm-tinted, but the character should lean slightly warmer still). Use cool-toned shadows (purple-blue, not grey) to create depth |
| **Saturated shadows** | Shadow areas should shift in hue towards purple-blue, not just darken. Example: a red robe shadow should move toward burgundy-plum, not brown-black |
| **Emotional readability** | The character's expression and pose should communicate class archetype at a glance: Warrior = stern/ready, Mage = mystical/focused, Rogue = crouched/sly |

### 3.6 What to Avoid

| Pitfall | Why | Reference Counter-Example |
|---------|-----|--------------------------|
| Flat digital airbrush shading | Looks procedural, not hand-crafted | Study Eiyuden Chronicle's visible stroke work |
| Dark outlines around shapes | Makes sprites look like cel-shaded cartoons | Tree of Savior has NO black outlines — use colour-based separation |
| Over-detailed at small scale | Wasted art time — details lost at 64 px | Ragnarok Origin prioritises bold silhouette over internal detail |
| Muddy midtones (low saturation) | Characters disappear against the warm world | Granblue Relink keeps saturation high even in shadows |
| Neon/glow colours | Breaks the "warm fantasy" palette | Keep saturated colours in the amber/gold/purple/emerald range |

---

## 4. Technical Specifications

### 4.1 File Format & Colour

| Property | Specification | Rationale |
|----------|--------------|-----------|
| **File format** | **PNG** (Portable Network Graphics) | Lossless, universal browser/WebGL support |
| **Colour depth** | **32-bit RGBA** (24-bit colour + 8-bit alpha) | Full colour fidelity with smooth transparency |
| **Colour space** | **sRGB** (with gamma ~2.2) | Loaded with `THREE.SRGBColorSpace` in the engine. Ensure your painting software is in sRGB mode, NOT Adobe RGB or ProPhoto RGB |
| **Alpha channel** | **8-bit greyscale alpha** | Smooth alpha gradients are critical — no binary transparency. Feather outer edges with 1–3 px partial alpha |
| **Interlacing** | **None** (Adam7 off) | Interlaced PNGs increase decode time |
| **Maximum file size** | ≤ 16 MB uncompressed | Build-time check enforces this |

### 4.2 Resolution & Dimensions

| Specification | Phase 1 (Current) | Phase 2 (Target) |
|---------------|-------------------|-------------------|
| Canvas size | **2752 × 1536 px** | **2752 × 6144 px** |
| Frame size | **688 × 1536 px** | **688 × 1536 px** |
| Columns | 4 | 4 |
| Rows | 1 | 4 |
| Max texture dimension | 4096 × 4096 px | 4096 × 4096 px |

**Note on max texture size:** WebGL 1.0 guarantees 4096 × 4096 px maximum texture dimension across all target devices. Our sprite sheet at 2752 × 6144 px would exceed this for certain GPUs. **Do NOT deliver a single 4-row PNG.** Instead, deliver **two images per character**:

- `sprite_XXX_.png` — Rows 0–1 (idle + walk): **2752 × 3072 px**
- `sprite_XXX__b.png` — Rows 2–3 (attack + cast): **2752 × 3072 px**

Each image independently fits within the 4096 × 4096 limit. The JSON metadata will reference both images.

### 4.3 Naming Convention

All assets follow the project convention:

```
sprite_XXX_[variant].[ext]
```

| Component | Rule | Example |
|-----------|------|---------|
| Prefix | Always `sprite_` | `sprite_` |
| Number | 3-digit zero-padded sequential ID | `001`, `014`, `042` |
| Variant (optional) | Suffix for multi-file sheets | `_b` for rows 2–3 |
| Extension | `.png` for image, `.json` for metadata | `.png`, `.json` |

**Examples:**

| File | Contents |
|------|----------|
| `sprite_001_.png` | Rows 0–1: idle + walk (4 cols × 2 rows = 8 frames) |
| `sprite_001__b.png` | Rows 2–3: attack + cast (4 cols × 2 rows = 8 frames) |
| `sprite_001_.json` | Metadata for both images (or for the single-image sheet) |

### 4.4 Folder Structure

Deliverables go into:

```
public/models/chars/
├── sprite_001_.png        # Rows 0-1 or full single-image sheet
├── sprite_001__b.png      # Rows 2-3 (if split)
├── sprite_001_.json       # Metadata
├── sprite_002_.png
├── sprite_002_.json
...
```

### 4.5 Export Checklist from Painting Software

| Step | Setting |
|------|---------|
| 1. Colour mode | **RGB** (NOT CMYK) |
| 2. Colour profile | **sRGB IEC61966-2.1** embedded |
| 3. Bit depth | **8-bit per channel** (NOT 16-bit) |
| 4. Alpha | **Transparent background** saved as alpha channel |
| 5. Compression | PNG compression level: **maximum** (slow save, fast load) |
| 6. Metadata | Strip EXIF, copyright, and timestamp metadata from PNG |
| 7. Naming | Confirm filename matches `sprite_XXX_[variant].png` exactly |

### 4.6 Software Recommendations

| Tool | Recommended For | Notes |
|------|-----------------|-------|
| **Clip Studio Paint EX** | Full sprite sheet authoring | Best brush engine for painterly texture. Use animation cels for frame-by-frame |
| **Photoshop CC** | Full sprite sheet authoring | Timeline panel for frame management. Use sRGB working space |
| **Aseprite** | Quick sprite work | Limited to pixel art. Acceptable for low-res prototyping only — NOT for final quality |
| **Krita** | Free alternative | Excellent brush engine. Supports animation with onion-skinning |

**Canvas setup per tool:**
- Create a document at final canvas size (2752 × 3072 px for 2-row sheets)
- Set DPI to **72** (we export pixels, not print dimensions)
- Enable **snapping to grid** (688 px grid width, 1536 px grid height)
- Use **onion-skinning** to verify frame-to-frame coherence

---

## 5. Quality Checklist

### 5.1 Pre-Delivery Checklist

The artist must verify every criterion below before delivering a sprite sheet. **Reject the sheet if any criterion fails.**

#### Colour & Saturation

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 1 | **Average saturation ≥ 65 HSV** | Sample 5 random pixels across the character area per frame using an eyedropper tool (HSV readout). Compute average | Reject if any sample falls below **40 saturation** |
| 2 | **Colour banding ≤ 3 bands** | Visual review at 100% zoom on continuous surfaces (robe chest, armour plate) | No more than 3 visible colour bands. Posterized gradients rejected |
| 3 | **Class colour identity matches §1.3** | Compare dominant hue against class colour table | Dominant colour must fall within ±15° hue of specified class colour |
| 4 | **No neon/out-of-palette colours** | Visual scan | Reject pure `#FF00FF`, `#00FF00`, `#0000FF` (magenta, pure green, pure blue) as accent colours |

#### Edge & Alpha

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 5 | **No harsh alpha transitions** | Check sprite outer edge with "Checkerboard" background in painting software | Alpha gradient must span **1–3 px minimum**. No binary alpha (0→255 in 0 px) on intended soft edges |
| 6 | **No inter-cell bleeding** | Create a 1–2 px transparent gutter at column/row boundaries | Zero opaque pixels within 1 px of column/row boundaries (688 px multiples) |
| 7 | **Frame boundary clear** | Verify no character part touches frame edge | Minimum **75 px margin** on all sides of each 688×1536 cell |
| 8 | **Alpha channel present** | Open in software that shows alpha mask | 8-bit alpha channel must exist and be non-empty |

#### Silhouette & Readability

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 9 | **Silhouette readable at 64×64 px** | Downscale a single frame to 64×64 px in your painting software using bilinear sampling | Must identify class (warrior/mage/rogue/etc.) from shape alone. If ambiguous, redesign silhouette |
| 10 | **Limb separation visible** | View each frame at game resolution (~137 px visible height on 1080p) | Arms must visually detach from torso. No merged blobs |
| 11 | **Weapon/profile break** | Silhouette test: convert to solid black on white | Weapon/staff/bow must protrude from body mass silhouette |

#### Lighting & Shading

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 12 | **Light direction consistent (above-left)** | Draw an arrow from the light source on a transparent layer. Verify shadow placement on all body parts across ALL frames | All highlights must be in the top-left quadrant of curved surfaces. Shadows must fall to lower-right |
| 13 | **Eye glint present** | Zoom to 200% on face area | White catch-light visible in top-left of each eye |
| 14 | **Frame-to-frame lighting consistent** | Onion-skin frames 0 and 1 for each animation | Light position must NOT shift between frames. Only motion changes; shading stays locked |

#### Frame Coherence

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 15 | **Anatomy consistent across frames** | Onion-skin frames of the same animation type | Face, hands, armour details remain recognisably the same. No anatomical drift (different nose shape, different armour curvature) |
| 16 | **Ground line consistent** | Overlay a horizontal guide line at 1360 px from top | Lowest foot point in every frame stays within ±10 px of 1360 px |
| 17 | **Pivot point consistent** | Overlay a vertical guide at 344 px (frame centre) | Character centre-line does not drift horizontally. Maximum 5 px wander allowed |

#### Technical Integrity

| # | Criterion | How to Verify | Pass/Fail Threshold |
|---|-----------|---------------|---------------------|
| 18 | **File ≤ 16 MB uncompressed** | Check file properties in OS | Must be ≤ 16 MB |
| 19 | **Dimensions match spec** | Verify image dimensions in OS/file info | Must be exactly 2752 × N (N = multiple of 1536) |
| 20 | **Colour mode is RGB** | Check in software colour info panel | NOT CMYK, NOT Greyscale, NOT Indexed |
| 21 | **No EXIF/embedded metadata** | Check file properties for metadata | Strip camera info, timestamps, software tags |
| 22 | **sRGB profile embedded** | Check in colour management software | sRGB IEC61966-2.1 must be embedded |

### 5.2 Post-Delivery Validation (Engine-Side)

These checks run in the build pipeline and will reject the sprite sheet automatically:

| Check | Tool/Process |
|-------|-------------|
| Texture memory ≤ 16 MB | Build-time PNG size check |
| JSON schema valid | JSON schema validation (`npm run build`) |
| Frame count ≤ 2 per animation | JSON row validation |
| Direction coverage (4 source + 3 mirrors) | JSON directions field validation |
| Dimensions correct | Build-time dimension check |

---

## 6. JSON Metadata Template

### 6.1 Complete Structure

```json
{
  "image": "sprite_XXX_.png",
  "imageB": "sprite_XXX__b.png",
  "frameWidth": 688,
  "frameHeight": 1536,
  "columns": 4,
  "rows": 2,
  "fps": {
    "idle": 1,
    "walk": 6,
    "attack": 10,
    "cast": 6
  },
  "directions": {
    "SE": 0,
    "E": 1,
    "N": 2,
    "NW": 3
  },
  "mirrorDirections": {
    "SW": "SE",
    "W": "E",
    "NE": "NW"
  },
  "animations": {
    "idle":   { "row": 0, "frames": 2 },
    "walk":   { "row": 1, "frames": 2 },
    "attack": { "row": 0, "frames": 2, "image": "imageB" },
    "cast":   { "row": 1, "frames": 2, "image": "imageB" }
  }
}
```

### 6.2 Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | String | **Yes** | Filename of the primary PNG (rows 0–1: idle + walk). Must match the actual file on disk exactly. Example: `"sprite_001_.png"` |
| `imageB` | String | No | Filename of the secondary PNG (rows 2–3: attack + cast). Only required when the sheet is split across two files due to 4096 px max texture limit. Example: `"sprite_001__b.png"` |
| `frameWidth` | Number | **Yes** | Width of one frame in pixels. **Must be `688`** |
| `frameHeight` | Number | **Yes** | Height of one frame in pixels. **Must be `1536`** |
| `columns` | Number | **Yes** | Number of columns (directions) in the sprite sheet. **Must be `4`** |
| `rows` | Number | **Yes** | Number of rows (animation types) in this image file. For single-image sheets: `4`. For split sheets: `2` per file |
| `fps` | Object | **Yes** | Frames-per-second for each animation type. Controls playback speed. Values: `idle: 1`, `walk: 6`, `attack: 10`, `cast: 6` |
| `directions` | Object | **Yes** | Maps direction names to column indices (0-based). **Must contain exactly** `SE: 0`, `E: 1`, `N: 2`, `NW: 3` |
| `mirrorDirections` | Object | **Yes** | Maps mirrored direction names to their source direction. **Must contain exactly** `SW: "SE"`, `W: "E"`, `NE: "NW"` |
| `animations` | Object | **Yes** | Maps animation type names to their sheet location |

### 6.3 Animation Entry Fields

Each entry under `animations` is an object with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `row` | Number | **Yes** | The row index (0-based) in the PNG where this animation's frames live. Row 0 = idle, Row 1 = walk, etc. If animations share a row (Phase 1 fallback), all point to row 0 |
| `frames` | Number | No | Number of frames in this animation sequence. Default: `1`. Max: `2`. Animations with 1 frame stay static; animations with 2 frames cycle frame 0 → frame 1 → frame 0 |
| `image` | String | No | Which image file this animation lives in. Acceptable values: `"image"` (default, primary file) or `"imageB"` (secondary file for split sheets). If omitted, defaults to `"image"` |
| `note` | String | No | Optional human-readable note. Not parsed by engine. Use for handover comments like `"Use idle until walk sprites available"` |

### 6.4 Example: Phase 1 Single-Row Sheet

For a 1-row sprite (all animations reference row 0):

```json
{
  "image": "sprite_014_.png",
  "frameWidth": 688,
  "frameHeight": 1536,
  "columns": 4,
  "rows": 1,
  "fps": {
    "idle": 4,
    "walk": 8,
    "attack": 10,
    "cast": 6
  },
  "directions": {
    "SE": 0,
    "E": 1,
    "N": 2,
    "NW": 3
  },
  "mirrorDirections": {
    "SW": "SE",
    "W": "E",
    "NE": "NW"
  },
  "animations": {
    "idle":   { "row": 0 },
    "walk":   { "row": 0, "note": "Uses idle until walk sprites available" },
    "attack": { "row": 0, "note": "Uses idle until attack sprites available" },
    "cast":   { "row": 0, "note": "Uses idle until cast sprites available" }
  }
}
```

### 6.5 Example: Phase 2 Full Four-Row Sheet (Single Image)

If the target device supports 6144 px height textures:

```json
{
  "image": "sprite_015_.png",
  "frameWidth": 688,
  "frameHeight": 1536,
  "columns": 4,
  "rows": 4,
  "fps": {
    "idle": 1,
    "walk": 6,
    "attack": 10,
    "cast": 6
  },
  "directions": {
    "SE": 0,
    "E": 1,
    "N": 2,
    "NW": 3
  },
  "mirrorDirections": {
    "SW": "SE",
    "W": "E",
    "NE": "NW"
  },
  "animations": {
    "idle":   { "row": 0, "frames": 2 },
    "walk":   { "row": 1, "frames": 2 },
    "attack": { "row": 2, "frames": 2 },
    "cast":   { "row": 3, "frames": 2 }
  }
}
```

### 6.6 Example: Phase 2 Split Two-Image Sheet

For cross-device compatibility (both images are ≤ 4096 px):

**File 1: `sprite_015_.png`** (2752 × 3072 px — rows 0–1)

```json
{
  "image": "sprite_015_.png",
  "imageB": "sprite_015__b.png",
  "frameWidth": 688,
  "frameHeight": 1536,
  "columns": 4,
  "rows": 2,
  "fps": {
    "idle": 1,
    "walk": 6,
    "attack": 10,
    "cast": 6
  },
  "directions": {
    "SE": 0,
    "E": 1,
    "N": 2,
    "NW": 3
  },
  "mirrorDirections": {
    "SW": "SE",
    "W": "E",
    "NE": "NW"
  },
  "animations": {
    "idle":   { "row": 0, "frames": 2, "image": "image" },
    "walk":   { "row": 1, "frames": 2, "image": "image" },
    "attack": { "row": 0, "frames": 2, "image": "imageB" },
    "cast":   { "row": 1, "frames": 2, "image": "imageB" }
  }
}
```

**File 2: `sprite_015__b.png`** (2752 × 3072 px — rows 2–3)

### 6.7 JSON Validation Rules (Engine-Side)

| Rule | Error If Violated |
|------|-------------------|
| `frameWidth` must be 688 | Frame UV calculations depend on this exact value |
| `frameHeight` must be 1536 | Frame UV calculations depend on this exact value |
| `columns` must be 4 | Direction-to-column mapping is hard-coded for 4 columns |
| `directions` must contain exactly SE, E, N, NW | Missing direction causes undefined UV offset |
| `mirrorDirections` must contain exactly SW→SE, W→E, NE→NW | Missing pair causes missing sprite view |
| `animations` must contain exactly idle, walk, attack, cast | Missing animation type causes crash on animation switch |
| Each `animations` entry row must be ≤ rows − 1 | Row index out of bounds causes UV to sample outside image |
| `fps` must contain exactly idle, walk, attack, cast | Missing key causes NaN in animation timing |
| `fps` values must be ≥ 1 | Zero or negative FPS causes division by zero |
| `image` filename must match an existing PNG on disk | Texture fails to load |
| `imageB` filename (if present) must match an existing PNG on disk | Texture fails to load |

---

## Appendix A — Delivery Checklist Summary

Use this quick checklist before sending files:

- [ ] PNG files are exactly 2752 × N px (N = 1536 × row count)
- [ ] Colour mode is RGB with sRGB profile
- [ ] Alpha channel present, edges feathered 1–3 px
- [ ] File size ≤ 16 MB per PNG
- [ ] Frame content does not touch edges (75+ px margins)
- [ ] Ground line consistent across all frames (±10 px)
- [ ] Character centred horizontally in each frame (±5 px)
- [ ] Light direction consistent (above-left) across ALL frames
- [ ] Onion-skin check: no anatomical drift between frames
- [ ] Silhouette test: class identifiable at 64×64 px
- [ ] JSON matches schema exactly (all required fields present)
- [ ] JSON `image` field matches actual PNG filename
- [ ] FPS values match spec (idle: 1, walk: 6, attack: 10, cast: 6)
- [ ] No inter-cell bleeding (1 px transparent gutter at cell boundaries)
- [ ] Class colour identity matches §1.3

---

## Appendix B — Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-07-29 | Art Director | Initial creation from rendering-goal.md §4.3 and Appendix A |

---

*End of Artist Handoff Document*
