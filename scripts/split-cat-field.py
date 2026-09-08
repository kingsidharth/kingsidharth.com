#!/usr/bin/env python3
"""Split lab-cat-field-grid.json into layered plates for the art lab.

Outputs (to static/art/):
  lab-field-sky-grid.json    clouds + sky, everything above the flower line
  lab-field-far-grid.json    far half of the flower bed + far blooms
  lab-field-mid-grid.json    near half of the flower bed + mid blooms
  lab-field-near-grid.json   near blooms only — a scattering for the front
  lab-field-cat-grid.json    the cat, flat and bright (coloured dark by the
                             renderer's per-plate ink override)

Design constraints (from the renderer, ArtLabScene.astro):
  - whole blooms go to ONE layer (per-cell dither tears subjects apart)
  - flower layers are infilled behind the cat at reduced luminance so
    parallax never exposes a cat-shaped hole
  - the cat plate is dilated by 1 so the thin ears survive
"""
import json, base64, sys, random
from collections import deque

SRC = '/Users/kingsidharth/Sites/kingsidharth.com/static/art/lab-cat-field-grid.json'
OUT = '/Users/kingsidharth/Sites/kingsidharth.com/static/art/'

g = json.load(open(SRC))
C, R = g['cols'], g['rows']
L = list(base64.b64decode(g['lum']))
def v(x, y): return L[y * C + x]

def hash01(x, y):
    return ((((x * 374761393) ^ (y * 668265263)) & 0xFFFFFFFF) % 1024) / 1024

# ---------------------------------------------------------------- cat mask
# Flood fill dark cells from a seed inside the body, bounded to the lower
# middle of the frame so the (also dark) sky cannot join in.
CAT_DARK = 62
seed = None
for y in range(115, 85, -1):
    for x in range(245, 285):
        if v(x, y) < 45:
            seed = (x, y); break
    if seed: break
assert seed, 'no dark seed found for the cat'

cat = set()
q = deque([seed])
while q:
    x, y = q.popleft()
    if (x, y) in cat: continue
    if not (195 <= x <= 345 and 58 <= y < R): continue
    if v(x, y) >= CAT_DARK: continue
    cat.add((x, y))
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        q.append((x+dx, y+dy))
print(f'cat mask: {len(cat)} cells, seed {seed}', file=sys.stderr)

def dilate(mask, n=1):
    m = set(mask)
    for _ in range(n):
        grow = set()
        for x, y in m:
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < C and 0 <= ny < R: grow.add((nx, ny))
        m |= grow
    return m

cat_draw = dilate(cat, 1)      # the plate itself, ears intact
cat_fill = dilate(cat, 5)      # region flower layers must infill behind —
                               # wide enough that parallax plus sway can
                               # never slide a flower plate's void out
                               # from under the cat plate

# ------------------------------------------------------- sky/field boundary
# Per column: first row where bright bloom texture appears, smoothed.
raw_top = []
for x in range(C):
    y0 = next((y for y in range(R) if v(x, y) > 150), R // 2)
    raw_top.append(y0)
W = 12
field_top = []
for x in range(C):
    a, b = max(0, x - W), min(C, x + W + 1)
    field_top.append(sorted(raw_top[a:b])[(b - a) // 2])

# --------------------------------------------------------- bloom components
# Bright blobs in the field, each assigned WHOLE to one flower layer by the
# depth of its centroid (with a hash jitter so bands interleave).
BLOOM = 148
labels = {}
blooms = []
for y in range(R):
    for x in range(C):
        if (x, y) in labels or (x, y) in cat_draw: continue
        if y < field_top[x] - 2 or v(x, y) < BLOOM: continue
        comp = []
        q = deque([(x, y)])
        labels[(x, y)] = len(blooms)
        while q:
            cx, cy = q.popleft()
            comp.append((cx, cy))
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                nx, ny = cx+dx, cy+dy
                if not (0 <= nx < C and 0 <= ny < R): continue
                if (nx, ny) in labels or (nx, ny) in cat_draw: continue
                if ny < field_top[nx] - 2 or v(nx, ny) < BLOOM: continue
                labels[(nx, ny)] = len(blooms)
                q.append((nx, ny))
        blooms.append(comp)
print(f'{len(blooms)} blooms', file=sys.stderr)

def band(d):
    return 0 if d < 0.34 else (1 if d < 0.62 else 2)

# Small components are blooms and go whole to one layer. Anything big is
# a merged carpet, not a subject — its cells split by their own depth.
CARPET = 120
bloom_layer = []
for i, comp in enumerate(blooms):
    if len(comp) > CARPET:
        bloom_layer.append(None)
        continue
    cx = sum(p[0] for p in comp) / len(comp)
    cy = sum(p[1] for p in comp) / len(comp)
    top = field_top[int(cx)]
    d = (cy - top) / max(1, (R - top))            # 0 horizon .. 1 front
    d += (hash01(i * 7 + 3, i * 13 + 5) - 0.5) * 0.16
    bloom_layer.append(band(d))

# ------------------------------------------------------------ write plates
def blank(): return [0] * (C * R)
sky, far, mid, near, catp = blank(), blank(), blank(), blank(), blank()

for y in range(R):
    for x in range(C):
        i = y * C + x
        lum = L[i]
        if (x, y) in cat_fill:
            continue                               # handled below
        if y < field_top[x]:
            sky[i] = lum
            continue
        top = field_top[x]
        d = (y - top) / max(1, (R - top))
        lab = labels.get((x, y))
        which = bloom_layer[lab] if lab is not None else None
        if which is None:
            # bed texture and carpet cells: split by their own depth,
            # dithered so no seam shows
            d += (hash01(x, y) - 0.5) * 0.14
            which = band(d)
        (far, mid, near)[which][i] = lum

# infill flower layers behind the cat: sample the nearest column OUTSIDE
# the fill region on the same row, dimmed so it reads as shadow under the
# cat rather than blooms shining through it
def outside(x, y, step):
    sx = x
    while 0 < sx < C - 1 and (sx, y) in cat_fill:
        sx += step
    return max(0, min(C - 1, sx + step * 2))

for x, y in cat_fill:
    i = y * C + x
    # blend both sides so the patch is not one column repeated
    lx, rx = outside(x, y, -1), outside(x, y, 1)
    wl = (rx - x) / max(1, rx - lx)
    src = int(L[y * C + lx] * wl + L[y * C + rx] * (1 - wl))
    if y >= field_top[x]:
        top = field_top[x]
        d = (y - top) / max(1, (R - top))
        tgt = (far, mid, near)[band(d)]
        tgt[i] = max(tgt[i], int(src * 0.9))
    else:
        sky[i] = max(sky[i], src)

# a moonlit glow in the clouds along the horizon, centred behind the
# cat — the silhouette only reads as a cat if the sky behind it is
# lighter than it is
import math
GLOW_X, GLOW_SX, GLOW_SY, GLOW_A = 265, 110, 15, 115
for y in range(R):
    for x in range(C):
        if y >= field_top[x]: continue
        i = y * C + x
        if sky[i] < 8: continue
        b = GLOW_A * math.exp(-((x - GLOW_X) ** 2) / (2 * GLOW_SX ** 2)) \
                   * math.exp(-((field_top[x] - 6 - y) ** 2) / (2 * GLOW_SY ** 2))
        sky[i] = min(255, int(sky[i] + b))

# The cat itself: a solid silhouette. Bright, so the renderer picks
# dense glyphs (the colour comes from the per-plate ink override), with
# only a whisper of jitter — enough to keep the body from being one
# unbroken slab, not enough to make it fuzzy. Uniform density right to
# the boundary: a lighter edge ring reads as a SECOND outline around
# the form, and one outline is the correct number.
for x, y in cat_draw:
    catp[y * C + x] = 228 + int(hash01(x, y) * 24)

def save(name, buf):
    data = {'cols': C, 'rows': R, 'lum': base64.b64encode(bytes(buf)).decode()}
    json.dump(data, open(OUT + name + '-grid.json', 'w'), separators=(',', ':'))
    print(f'{name}: {sum(1 for b in buf if b > 30)} live cells', file=sys.stderr)

# The sky itself is two depths: the high thin clouds move slower than
# the bank sitting on the horizon (which carries the glow), the same
# trick as the flower bands. The boundary is dithered mid-sky, through
# the emptiest rows, so no cloud is cut along a visible line.
sky_far, sky_near = blank(), blank()
for y in range(R):
    for x in range(C):
        i = y * C + x
        if not sky[i]:
            continue
        split = field_top[x] * 0.55 + (hash01(x, y) - 0.5) * 6
        (sky_far if y < split else sky_near)[i] = sky[i]

save('lab-field-sky-far', sky_far)
save('lab-field-sky', sky_near)
save('lab-field-far', far)
save('lab-field-mid', mid)
save('lab-field-near', near)
save('lab-field-cat', catp)

# preview PNGs for inspection
import struct, zlib
def png(path, buf, s=2):
    w, h = C * s, R * s
    big = bytearray(w * h)
    for y in range(R):
        for x in range(C):
            val = buf[y * C + x]
            for dy in range(s):
                for dx in range(s):
                    big[(y * s + dy) * w + x * s + dx] = val
    raw = b''.join(b'\x00' + bytes(big[y * w:(y + 1) * w]) for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    hdr = struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', hdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

import os
pv = os.path.dirname(os.path.abspath(__file__))
for nm, buf in [('sky', sky), ('far', far), ('mid', mid), ('near', near), ('cat', catp)]:
    png(f'{pv}/layer-{nm}.png', buf)
print('previews written', file=sys.stderr)
