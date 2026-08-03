#!/usr/bin/env python3
"""
Turn an image into layered, coloured ASCII art.

Two things separate this from the usual one-liner asciifier:

  * Colour is preserved per cell, sampled from the source, so the output
    is a coloured mosaic rather than a monochrome silhouette.
  * Cells are matched on *shape*, not just brightness. Each candidate
    glyph is pre-rendered once and compared against the cell's own 2x2
    luminance quadrants, so an edge running through a cell picks a glyph
    whose ink sits on the same side. That is what stops portraits
    turning to mush.

Smaller cells mean more glyphs across the same area, so detail rises as
--cell falls — which is the "smaller the element, the more detail"
behaviour asked for.

Outputs SVG (sharp at any size, and the site can inline it) or HTML.

    python3 scripts/asciify.py in.jpg -o out.svg --cols 120
    python3 scripts/asciify.py in.jpg -o out.svg --palette phosphor --mono

Requires Pillow:  pip install pillow
"""

from __future__ import annotations

import argparse
import html
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install pillow")

# Ramps are ordered light -> dark. `blocks` carries directional glyphs,
# which is what makes shape matching worth doing at all.
RAMPS = {
    "blocks": " ░▒▓█▀▄▌▐▖▗▘▝",
    "ascii": " .:-=+*#%@",
    "dense": " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    "dots": " ⠁⠃⠇⠏⠟⠿⡿⣿",
}

PALETTES = {
    "source": None,  # sample the image
    "phosphor": [(0x0A, 0x14, 0x0C), (0x2E, 0x8B, 0x4A), (0x7A, 0xE5, 0x8F), (0xE6, 0xFF, 0xEC)],
    "amber": [(0x14, 0x0C, 0x02), (0x8A, 0x55, 0x06), (0xE8, 0xA0, 0x20), (0xFF, 0xE6, 0xB8)],
    "pink": [(0x14, 0x04, 0x0E), (0x8A, 0x12, 0x55), (0xE8, 0x3D, 0x9B), (0xFF, 0xC9, 0xE6)],
    "mono": [(0x00, 0x00, 0x00), (0x55, 0x55, 0x55), (0xAA, 0xAA, 0xAA), (0xFF, 0xFF, 0xFF)],
}


# Quadrant ink coverage per glyph, as (top-left, top-right, bottom-left,
# bottom-right). These are declared rather than measured: rendering them
# through PIL's default bitmap font produced identical blank signatures
# for every block character, so shape matching collapsed onto a single
# glyph. Block geometry is exactly known, so there is nothing to measure.
BLOCK_SIGNATURES: dict[str, tuple[float, float, float, float]] = {
    " ": (0.0, 0.0, 0.0, 0.0),
    "░": (0.25, 0.25, 0.25, 0.25),
    "▒": (0.5, 0.5, 0.5, 0.5),
    "▓": (0.75, 0.75, 0.75, 0.75),
    "█": (1.0, 1.0, 1.0, 1.0),
    "▀": (1.0, 1.0, 0.0, 0.0),
    "▄": (0.0, 0.0, 1.0, 1.0),
    "▌": (1.0, 0.0, 1.0, 0.0),
    "▐": (0.0, 1.0, 0.0, 1.0),
    "▘": (1.0, 0.0, 0.0, 0.0),
    "▝": (0.0, 1.0, 0.0, 0.0),
    "▖": (0.0, 0.0, 1.0, 0.0),
    "▗": (0.0, 0.0, 0.0, 1.0),
}


def glyph_signature(ch: str):
    """Quadrant coverage for a glyph, or None if its shape is unknown."""
    return BLOCK_SIGNATURES.get(ch)


def cell_signature(img: Image.Image, x0: int, y0: int, w: int, h: int):
    """Same four quadrants, measured on the image instead."""
    px = img.load()
    hw, hh = max(1, w // 2), max(1, h // 2)
    quads = []
    for oy in (0, hh):
        for ox in (0, hw):
            vals = [
                px[min(x0 + ox + x, img.width - 1), min(y0 + oy + y, img.height - 1)]
                for y in range(hh)
                for x in range(hw)
            ]
            quads.append(sum(vals) / (len(vals) * 255))
    return quads


def average_colour(img: Image.Image, x0: int, y0: int, w: int, h: int):
    px = img.load()
    r = g = b = n = 0
    for y in range(y0, min(y0 + h, img.height)):
        for x in range(x0, min(x0 + w, img.width)):
            pr, pg, pb = px[x, y][:3]
            r += pr
            g += pg
            b += pb
            n += 1
    return (r // n, g // n, b // n) if n else (0, 0, 0)


def luminance(rgb) -> float:
    r, g, b = rgb[:3]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def quantise(rgb, palette, lum: float):
    """
    Palettes are indexed by brightness, not by nearest colour.

    Nearest-RGB looks correct and is wrong here: a dark source collapses
    onto the darkest swatch and the whole image renders black on black.
    Ranking by normalised luminance keeps the full palette in play
    whatever the source's exposure.
    """
    if palette is None:
        return rgb
    idx = min(len(palette) - 1, max(0, int(lum * len(palette))))
    return palette[idx]


def build(args) -> str:
    src = Image.open(args.image).convert("RGB")

    # Character cells are about twice as tall as wide, so the vertical
    # sampling has to be halved or everything comes out stretched.
    aspect = 0.5
    cols = args.cols
    cell_w = max(1, src.width // cols)
    cell_h = max(1, int(cell_w / aspect))
    rows = max(1, src.height // cell_h)

    grey = src.convert("L")

    # Normalise exposure across the image, so a dark or flat source still
    # uses the whole ramp instead of bunching at one end.
    lo, hi = grey.getextrema()
    span = max(1, hi - lo)
    ramp = RAMPS[args.ramp]
    palette = PALETTES[args.palette]

    sigs = {ch: glyph_signature(ch) for ch in ramp}
    shape_ok = args.shape and all(v is not None for v in sigs.values())
    if args.shape and not shape_ok:
        print(
            f"note: ramp '{args.ramp}' has no shape data — matching on brightness",
            file=sys.stderr,
        )

    lines = []
    for ry in range(rows):
        row = []
        for rx in range(cols):
            x0, y0 = rx * cell_w, ry * cell_h
            raw = sum(cell_signature(grey, x0, y0, cell_w, cell_h)) / 4
            lum = min(1.0, max(0.0, (raw * 255 - lo) / span))

            if args.invert:
                lum = 1.0 - lum

            if shape_ok:
                target = [
                    min(1.0, max(0.0, (q * 255 - lo) / span))
                    for q in cell_signature(grey, x0, y0, cell_w, cell_h)
                ]
                if args.invert:
                    target = [1 - t for t in target]
                ch = min(
                    ramp,
                    key=lambda c: sum((a - b) ** 2 for a, b in zip(sigs[c], target)),
                )
            else:
                idx = int(lum * (len(ramp) - 1))
                ch = ramp[len(ramp) - 1 - idx]

            colour = quantise(average_colour(src, x0, y0, cell_w, cell_h), palette, lum)
            row.append((ch, colour))
        lines.append(row)

    return render_svg(lines, args) if args.out.suffix == ".svg" else render_html(lines, args)


def render_svg(lines, args) -> str:
    cw, ch = args.cell, int(args.cell * 2)
    w, h = len(lines[0]) * cw, len(lines) * ch
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" role="img" aria-label="{html.escape(args.alt)}">',
        f'<rect width="{w}" height="{h}" fill="{args.bg}"/>',
        f'<g font-family="ui-monospace,monospace" font-size="{ch * 0.9:.1f}" '
        'text-anchor="middle" dominant-baseline="central">',
    ]
    for ry, row in enumerate(lines):
        # Runs of identical colour collapse into one <text>, which keeps
        # the file to a sane size on large images.
        rx = 0
        while rx < len(row):
            ch_, col = row[rx]
            run = [ch_]
            rx2 = rx + 1
            while rx2 < len(row) and row[rx2][1] == col:
                run.append(row[rx2][0])
                rx2 += 1
            text = html.escape("".join(run))
            if text.strip():
                fill = f"rgb({col[0]},{col[1]},{col[2]})"
                out.append(
                    f'<text x="{rx * cw + cw / 2:.1f}" y="{ry * ch + ch / 2:.1f}" '
                    f'fill="{fill}" textLength="{len(run) * cw}" '
                    f'lengthAdjust="spacingAndGlyphs">{text}</text>'
                )
            rx = rx2
    out += ["</g>", "</svg>"]
    return "\n".join(out)


def render_html(lines, args) -> str:
    rows = []
    for row in lines:
        cells = []
        rx = 0
        while rx < len(row):
            ch_, col = row[rx]
            run = [ch_]
            rx2 = rx + 1
            while rx2 < len(row) and row[rx2][1] == col:
                run.append(row[rx2][0])
                rx2 += 1
            cells.append(
                f'<span style="color:rgb({col[0]},{col[1]},{col[2]})">'
                f"{html.escape(''.join(run))}</span>"
            )
            rx = rx2
        rows.append("".join(cells))
    body = "\n".join(rows)
    return (
        f'<pre style="background:{args.bg};line-height:1;font-family:ui-monospace,'
        f'monospace;font-size:{args.cell}px;margin:0">\n{body}\n</pre>'
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True, help=".svg or .html")
    ap.add_argument("--cols", type=int, default=120, help="glyphs across; higher = more detail")
    ap.add_argument("--cell", type=float, default=6, help="glyph width in output units")
    ap.add_argument("--ramp", choices=sorted(RAMPS), default="blocks")
    ap.add_argument("--palette", choices=sorted(PALETTES), default="source")
    ap.add_argument("--bg", default="#000000")
    ap.add_argument("--alt", default="ASCII rendering")
    ap.add_argument("--invert", action="store_true", help="for light-on-dark sources")
    ap.add_argument(
        "--no-shape",
        dest="shape",
        action="store_false",
        help="match on brightness only (faster, mushier)",
    )
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build(args))
    kb = args.out.stat().st_size // 1024
    print(f"{args.image.name} -> {args.out}  ({args.cols} cols, {kb}K)")


if __name__ == "__main__":
    main()
