# Generates src/index.css: Tailwind setup, the themeable "brand" palette, per-theme overrides
# of the neutral (zinc) scale, and the light "Paper" theme's inverted status colors.
# Run: python3 scripts/gen-themes.py
from pathlib import Path

STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
TW = {
    'emerald': ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
    'red': ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
    'rose': ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
    'amber': ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
    'sky': ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'],
    'blue': ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
    'orange': ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
    'indigo': ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
    'violet': ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
    'teal': ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
    'cyan': ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'],
    'pink': ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724'],
    'fuchsia': ['#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75', '#4a044e'],
    'green': ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16'],
    'lime': ['#f7fee7', '#ecfccb', '#d9f99d', '#bef264', '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314', '#1a2e05'],
}
STATUS = ['emerald', 'red', 'rose', 'amber', 'sky', 'blue', 'orange', 'indigo', 'violet', 'teal', 'cyan', 'pink', 'fuchsia', 'green', 'lime']


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def tint(base, hue, amount):
    """Mix a neutral scale toward a hue — gives tinted greys (teal-black, warm cream…)."""
    t = hexrgb(hue)
    return ['#' + ''.join(f'{round(c * (1 - amount) + h * amount):02x}' for c, h in zip(hexrgb(v), t)) for v in base]

NEUTRAL = ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a']
SLATE = ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617']
WARM = ['#faf6f6', '#f2e9e9', '#e2d3d3', '#c9b3b3', '#a08585', '#7a6262', '#5c4848', '#433434', '#2e2323', '#1f1818', '#140f0f']
PAPER = ['#14110e', '#1f1b17', '#2e2924', '#453e35', '#5e564b', '#857b6c', '#a89e8e', '#cfc7b9', '#e4ded4', '#efebe4', '#f7f5f1']
# deep, near-pure blacks for the minimal "luxury" themes
ONYX = ['#fafafa', '#efefef', '#d9d9d9', '#b8b8b8', '#8c8c8c', '#666666', '#474747', '#2b2b2b', '#1a1a1a', '#101010', '#060606']
GOLD = ['#fbf8f1', '#f4ecd8', '#e9d9b1', '#dcc48a', '#d1b26f', '#c5a059', '#b08b47', '#8e6f38', '#6c542b', '#4d3c1f', '#2a2111']
PLATINUM = ['#ffffff', '#f7f7f7', '#ececec', '#dedede', '#cfcfcf', '#bdbdbd', '#d6d6d6', '#a9a9a9', '#5c5c5c', '#333333', '#1a1a1a']
MONO_BRAND = ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#8a8a8a', '#5c5c5c', '#4a4a4a', '#333333', '#222222', '#111111']

DARK_THEMES = {
    'crimson': (WARM, TW['rose'], 'radial-gradient(1200px 600px at 20% -10%, #3a1218 0%, transparent 60%), #0f0a0b'),
    'noir': (ONYX, TW['red'], '#000000'),
    'onyx': (ONYX, GOLD, '#000000'),
    'obsidian': (ONYX, PLATINUM, '#000000'),
    'midnight': (SLATE, TW['blue'], 'radial-gradient(1200px 600px at 20% -10%, #14234a 0%, transparent 60%), #020617'),
    'mono': (NEUTRAL, MONO_BRAND, '#0b0b0b'),
    'ocean': (tint(NEUTRAL, '#0e7490', 0.22), TW['cyan'], 'radial-gradient(1200px 600px at 80% -10%, #0b3a4a 0%, transparent 60%), #041317'),
    'ember': (tint(NEUTRAL, '#7c2d12', 0.12), TW['orange'], 'radial-gradient(1000px 500px at 10% -10%, #3b1607 0%, transparent 60%), #0d0907'),
    'royal': (tint(NEUTRAL, '#4c1d95', 0.2), TW['violet'], 'radial-gradient(1200px 600px at 50% -20%, #2a1550 0%, transparent 60%), #0a0612'),
    'coffee': (tint(WARM, '#78350f', 0.18), TW['amber'], '#120c08'),
    'nord': (tint(SLATE, '#5e81ac', 0.18), TW['sky'], '#1c212b'),
    'synthwave': (tint(NEUTRAL, '#86198f', 0.25), TW['pink'], 'linear-gradient(180deg, #1a0b2e 0%, #2b0f3f 55%, #3a0f3a 100%) fixed'),
    'matrix': (tint(ONYX, '#14532d', 0.25), TW['green'], '#020603'),
}

# Light themes: a light-to-dark neutral scale (reversed so zinc-950 is the page and zinc-50 the ink).
LIGHT_THEMES = {
    'paper': (PAPER, TW['red'], '#f7f5f1', False),
    'daylight': (list(reversed(SLATE)), TW['blue'], '#f8fafc', True),
    'sand': (list(reversed(tint(WARM, '#c2410c', 0.12))), TW['orange'], 'linear-gradient(180deg, #fbf3e8 0%, #f4e7d6 100%) fixed', True),
    'mint': (list(reversed(tint(NEUTRAL, '#0f766e', 0.1))), TW['teal'], '#f3faf8', True),
    'lavender': (list(reversed(tint(NEUTRAL, '#6d28d9', 0.1))), TW['violet'], '#f7f5fc', True),
    'ivory': (list(reversed(tint(NEUTRAL, '#8e6f38', 0.08))), GOLD, '#fbf9f4', True),
}


def scale(name, vals):
    return '\n'.join(f'  --color-{name}-{s}: {v};' for s, v in zip(STEPS, vals))


def block(selector, lines):
    return selector + ' {\n' + '\n'.join(lines) + '\n}\n'


out = ['@import "tailwindcss";\n', block('@theme', [scale('brand', TW['emerald']), "  --font-display: 'Inter', ui-sans-serif, system-ui, sans-serif;"])]
out.append(block(':root', [
    '  color-scheme: dark;',
    '  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;',
    '  --app-bg: radial-gradient(1200px 600px at 20% -10%, #1c2a22 0%, transparent 60%), #0b0d0c;',
]))
for name, (zinc, brand, bg) in DARK_THEMES.items():
    out.append(block(f':root[data-theme="{name}"]', [scale('zinc', zinc), scale('brand', brand), f'  --app-bg: {bg};']))

# Light themes: invert neutrals and status colors (keeping the solid 500/600 fills) so the same
# utility classes still read as dark-on-light.
for name, (zinc, brand, bg, rev) in LIGHT_THEMES.items():
    lb = list(reversed(brand))
    lb[5], lb[6] = brand[5], brand[6]  # solid fills stay; light tints become dark ink
    lines = ['  color-scheme: light;', scale('zinc', zinc), scale('brand', lb)]
    for c in STATUS:
        inv = list(reversed(TW[c]))
        inv[5], inv[6] = TW[c][5], TW[c][6]
        lines.append(scale(c, inv))
    lines.append(f'  --app-bg: {bg};')
    out.append(block(f':root[data-theme="{name}"]', lines))

out.append(Path(__file__).with_name('theme-base.css').read_text())
Path(__file__).parent.parent.joinpath('src/index.css').write_text('\n'.join(out))
print('wrote src/index.css')
