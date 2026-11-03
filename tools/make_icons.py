"""Рисует PNG-иконки PWA и icon.ico для .exe по мотивам app/icons/icon.svg (нужен Pillow).

    python tools/make_icons.py
"""
import math, pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / 'app' / 'icons'
SS = 4  # supersampling for smooth edges


def draw(size, maskable=False):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (109, 40, 217, 255)
    if maskable:
        d.rectangle([0, 0, s, s], fill=bg)
        k = 0.78  # keep the motif inside the maskable safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 112 / 512), fill=bg)
        k = 1.0
    c, r, off = s / 2, s * 118 / 512 * k, s * 56 / 512 * k
    left, right = (c - off, c), (c + off, c)
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([left[0] - r, c - r, left[0] + r, c + r], fill=(240, 171, 252, 235))
    img.alpha_composite(layer)
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([right[0] - r, c - r, right[0] + r, c + r], fill=(165, 243, 252, 220))
    img.alpha_composite(layer)
    # white lens = intersection of the two circles
    mask_a = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask_a).ellipse([left[0] - r, c - r, left[0] + r, c + r], fill=255)
    mask_b = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask_b).ellipse([right[0] - r, c - r, right[0] + r, c + r], fill=255)
    lens = Image.new('L', (s, s), 0)
    lens.paste(mask_b, (0, 0), mask_a)
    img.paste((255, 255, 255, 255), (0, 0), lens)
    return img.resize((size, size), Image.LANCZOS)


ICONS.mkdir(parents=True, exist_ok=True)
draw(192).save(ICONS / 'icon-192.png', optimize=True)
draw(512).save(ICONS / 'icon-512.png', optimize=True)
draw(512, maskable=True).save(ICONS / 'icon-maskable-512.png', optimize=True)
# iOS ignores transparency: full-bleed square, the system rounds the corners
draw(180, maskable=True).save(ICONS / 'apple-touch-icon.png', optimize=True)
draw(256).save(ROOT / 'desktop' / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icons: ok')
