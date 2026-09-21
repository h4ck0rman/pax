"""Draw the vines behind the sign-in page, and write them as a React component.

Decorative only. Generated rather than hand-authored so the density, the leaf
size and the way it thins out as it climbs can be tuned and regenerated:

    python scripts/generate_vine_art.py

The output is inline SVG in the page, so it costs no request and does not depend
on the Content-Security-Policy allowing external or data-URI images.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

WIDTH, HEIGHT = 600, 900
OUTPUT = Path(__file__).resolve().parents[1] / 'src' / 'auth' / 'VineArt.tsx'
SEED = 20260921

Point = tuple[float, float]


def fade(y: float, low: float, high: float) -> float:
    """Opacity for something at height y. Full near the base, gone near the top."""
    depth = max(0.0, min(1.0, y / HEIGHT)) ** 1.4
    return round(low + (high - low) * depth, 3)


def stem_points(base_x: float, top_y: float, amplitude: float, phase: float, steps: int) -> list[Point]:
    """A climbing line that wanders from side to side, widening as it rises."""
    points: list[Point] = []
    span = HEIGHT + 30 - top_y
    for step in range(steps + 1):
        f = step / steps
        y = HEIGHT + 30 - f * span
        sway = math.sin(phase + f * math.pi * 2.1) * amplitude * (0.35 + 0.85 * f)
        points.append((base_x + sway + random.uniform(-3, 3), y))
    return points


def smooth_path(points: list[Point]) -> str:
    """A Catmull-Rom spline through the points, emitted as cubic segments."""
    parts = [f'M{points[0][0]:.1f} {points[0][1]:.1f}']
    for index in range(len(points) - 1):
        p0 = points[max(0, index - 1)]
        p1 = points[index]
        p2 = points[index + 1]
        p3 = points[min(len(points) - 1, index + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        parts.append(
            f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
        )
    return ' '.join(parts)


def leaf_path(length: float, width: float) -> str:
    """An almond leaf pointing along positive x."""
    return (
        f'M0 0 '
        f'C{length * 0.3:.1f} {-width:.1f} {length * 0.78:.1f} {-width * 0.72:.1f} {length:.1f} 0 '
        f'C{length * 0.78:.1f} {width * 0.72:.1f} {length * 0.3:.1f} {width:.1f} 0 0 Z'
    )


def tendril(x: float, y: float, direction: int) -> str:
    """A small curl, so a stem does not end on a blunt stop."""
    parts = [f'M{x:.1f} {y:.1f}']
    radius = 7.5
    cx, cy = x, y
    for turn in range(3):
        cx += direction * radius * 1.45
        cy -= radius * 0.85
        parts.append(f'A{radius:.1f} {radius:.1f} 0 0 {1 if turn % 2 == 0 else 0} {cx:.1f} {cy:.1f}')
        radius *= 0.6
    return ' '.join(parts)


def leaves_along(points: list[Point], scale: float, leaves: list[str]) -> None:
    """Hang leaves off the interior nodes of a stem, alternating sides."""
    for index in range(1, len(points) - 1):
        x, y = points[index]
        if y > HEIGHT + 10:
            continue
        previous, following = points[index - 1], points[index + 1]
        along = math.degrees(math.atan2(following[1] - previous[1], following[0] - previous[0]))

        # A pair here and there, rather than one leaf per node forever.
        for splay in ((58, -58) if random.random() < 0.34 else (58 if index % 2 else -58,)):
            angle = along + splay + random.uniform(-14, 14)
            height_scale = scale * (0.58 + 0.42 * min(1.0, y / HEIGHT))
            length = random.uniform(24, 42) * height_scale
            width = length * random.uniform(0.33, 0.48)
            leaves.append(
                f'<path d="{leaf_path(length, width)}" '
                f'transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" '
                f'opacity="{fade(y, 0.05, 0.34)}"/>'
            )


def build() -> str:
    random.seed(SEED)
    stems: list[str] = []
    leaves: list[str] = []
    curls: list[str] = []

    # Vines rise from below the frame so no stem appears to start in mid air.
    for index in range(9):
        base_x = WIDTH * (index + 0.5) / 9 + random.uniform(-26, 26)
        top_y = HEIGHT * random.uniform(0.10, 0.54)
        amplitude = random.uniform(34, 86)
        phase = random.uniform(0, math.tau)
        points = stem_points(base_x, top_y, amplitude, phase, steps=random.randint(12, 17))

        stems.append(
            f'<path d="{smooth_path(points)}" opacity="{fade(HEIGHT * 0.62, 0.07, 0.26)}"/>'
        )
        leaves_along(points, 1.0, leaves)

        tip = points[-1]
        if random.random() < 0.65:
            direction = 1 if math.cos(phase) >= 0 else -1
            curls.append(
                f'<path d="{tendril(tip[0], tip[1], direction)}" '
                f'opacity="{fade(tip[1], 0.05, 0.2)}"/>'
            )

        # A side shoot, so the vines are not nine parallel lines.
        if random.random() < 0.7:
            node = points[random.randint(2, max(2, len(points) - 5))]
            shoot = stem_points(
                node[0],
                node[1] - random.uniform(130, 230),
                random.uniform(26, 52),
                random.uniform(0, math.tau),
                steps=random.randint(5, 8),
            )
            # Start the shoot at its parent node rather than below the frame.
            shoot = [(x, min(y, node[1])) for x, y in shoot]
            shoot[0] = node
            stems.append(
                f'<path d="{smooth_path(shoot)}" opacity="{fade(node[1], 0.05, 0.18)}"/>'
            )
            leaves_along(shoot, 0.74, leaves)

    indent = '\n        '
    stem_paths = indent.join(stems)
    leaf_paths = indent.join(leaves)
    curl_paths = indent.join(curls)

    return f'''/* Generated by scripts/generate_vine_art.py. Do not edit by hand; change the
   generator and rerun it. Decorative only, and hidden from assistive technology
   by the panel that contains it. */
export default function VineArt() {{
  return (
    <svg
      className="vine-art"
      viewBox="0 0 {WIDTH} {HEIGHT}"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {stem_paths}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        {curl_paths}
      </g>
      <g fill="currentColor" stroke="none">
        {leaf_paths}
      </g>
    </svg>
  );
}}
'''


OUTPUT.write_text(build(), encoding='utf-8')
print(f'wrote {OUTPUT.relative_to(Path(__file__).resolve().parents[1])}')
