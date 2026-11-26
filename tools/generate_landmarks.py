#!/usr/bin/env python3
"""Generate stylized Rockville Town Center landmark buildings.

Run headless:

    blender -b -P tools/generate_landmarks.py

Outputs (1 unit = 1 meter, Y up):
    public/landmarks/regal-cinemas.glb
    public/landmarks/montgomery-colonnade.glb

Orientation for both files:
    +X east, +Y up, +Z south.
    The street facade (East Montgomery Avenue) faces +Z.
    The origin is the center of the main footprint on the ground plane.
    The colonnade's east end (+X) is the side that sits against the
    theater's west end (-X).

The Regal blade, cylinder, and curved marquee are on the theater's +Z face.
The colonnade, teal awnings, and recessed storefronts are on the
Montgomery building's +Z face. Screen auditoriums at the real cinema are
below grade; both models are the above-ground landmarks only.
"""

import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'landmarks')
PREVIEW_DIR = os.environ.get('LANDMARK_PREVIEW_DIR', '/opt/cursor/artifacts')

# Shared street-wall height so the two models can sit on one Montgomery frontage.
# Ground floor is tall (retail / theater lobby). The upper story is one office
# floor with two glass bands, matching the 199 E. Montgomery facade.
PARAPET_Y = 11.20
ROOF_Y = 10.48
SOFFIT_Y = 5.22
DEPTH = 22.0
HALF_D = DEPTH * 0.5
FRONT_Z = HALF_D

# Colonnade rhythm. Eight square columns, seven storefront bays.
COL_SIZE = 1.24
BAY_OPEN = 5.85
N_BAYS = 7
N_COLS = N_BAYS + 1
COLONNADE_W = N_COLS * COL_SIZE + N_BAYS * BAY_OPEN
# Storefront glazing is set back from the column line. This is the colonnade depth.
STORE_Z = FRONT_Z - 4.70

# Theater footprint. The marquee bows past FRONT_Z; the origin stays on the box.
THEATER_W = 30.0
SIGN_TOP = 23.55
SPHERE_TOP = 22.35


def srgb_to_linear(channel):
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_linear(value):
    value = value.lstrip('#')
    rgb = tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def make_material(name, color, roughness, metallic=0.0, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_linear(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = hex_linear(color)
        bsdf.inputs['Emission Strength'].default_value = emission
    return material


class Acc:
    """One material's worth of triangle-ready faces, in world meters."""

    def __init__(self):
        self.verts = []
        self.faces = []

    def face(self, pts, outward):
        pts = [Vector(p) for p in pts]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if normal.length_squared < 1e-12:
            return
        if normal.dot(Vector(outward)) < 0:
            pts = list(reversed(pts))
        base = len(self.verts)
        self.verts.extend(pts)
        if len(pts) == 4:
            self.faces.append((base, base + 1, base + 2, base + 3))
        elif len(pts) == 3:
            self.faces.append((base, base + 1, base + 2))
        else:
            for i in range(1, len(pts) - 1):
                self.faces.append((base, base + i, base + i + 1))

    def box(self, mn, mx):
        x0, y0, z0 = mn
        x1, y1, z1 = mx
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        c = [
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ]
        self.face([c[i] for i in (0, 1, 2, 3)], (0, 0, -1))
        self.face([c[i] for i in (4, 5, 6, 7)], (0, 0, 1))
        self.face([c[i] for i in (0, 1, 5, 4)], (0, -1, 0))
        self.face([c[i] for i in (3, 2, 6, 7)], (0, 1, 0))
        self.face([c[i] for i in (0, 3, 7, 4)], (-1, 0, 0))
        self.face([c[i] for i in (1, 2, 6, 5)], (1, 0, 0))

    def extrusion(self, ring, y0, y1):
        """Extrude an XZ ring (CCW from above) from y0 to y1."""
        count = len(ring)
        cx = sum(p[0] for p in ring) / count
        cz = sum(p[1] for p in ring) / count
        bottom = [(x, y0, z) for x, z in ring]
        top = [(x, y1, z) for x, z in ring]
        self.face(bottom, (0, -1, 0))
        self.face(top, (0, 1, 0))
        for i in range(count):
            j = (i + 1) % count
            hint = (
                (ring[i][0] + ring[j][0]) * 0.5 - cx,
                0.0,
                (ring[i][1] + ring[j][1]) * 0.5 - cz,
            )
            self.face([bottom[i], bottom[j], top[j], top[i]], hint)

    def mapped_box(self, corners, outward_fn):
        """corners: 8 points in the standard box index order. outward_fn(face_pts)->hint."""
        faces = (
            (0, 1, 2, 3),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (3, 2, 6, 7),
            (0, 3, 7, 4),
            (1, 2, 6, 5),
        )
        for idxs in faces:
            pts = [corners[i] for i in idxs]
            self.face(pts, outward_fn(pts))


def square_ring(x0, z0, x1, z1, chamfer):
    c = min(chamfer, (x1 - x0) * 0.45, (z1 - z0) * 0.45)
    return [
        (x0 + c, z0), (x1 - c, z0),
        (x1, z0 + c), (x1, z1 - c),
        (x1 - c, z1), (x0 + c, z1),
        (x0, z1 - c), (x0, z0 + c),
    ]


def cylinder_ring(cx, cz, radius, segments):
    ring = []
    for i in range(segments):
        theta = 2.0 * math.pi * i / segments
        ring.append((cx + radius * math.cos(theta), cz + radius * math.sin(theta)))
    return ring


def add_sphere(acc, center, radius, segments=16, rings=8):
    center = Vector(center)
    grid = []
    for i in range(1, rings):
        phi = math.pi * i / rings
        row = []
        for j in range(segments):
            theta = 2.0 * math.pi * j / segments
            local = Vector((
                math.sin(phi) * math.cos(theta),
                math.cos(phi),
                math.sin(phi) * math.sin(theta),
            ))
            row.append(center + local * radius)
        grid.append(row)

    def tri(a, b, c):
        mid = (Vector(a) + Vector(b) + Vector(c)) / 3.0
        acc.face((a, b, c), mid - center)

    north = center + Vector((0, radius, 0))
    south = center + Vector((0, -radius, 0))
    for j in range(segments):
        k = (j + 1) % segments
        tri(north, grid[0][k], grid[0][j])
        tri(south, grid[-1][j], grid[-1][k])
    for i in range(len(grid) - 1):
        for j in range(segments):
            k = (j + 1) % segments
            tri(grid[i][j], grid[i][k], grid[i + 1][k])
            tri(grid[i][j], grid[i + 1][k], grid[i + 1][j])


# Glyphs in a 0..1 em square. Boxes do not overlap. Bars are centerlines.
# 'bar' entries are (x0, y0, x1, y1, thickness).
GLYPHS = {
    'R': {
        'aspect': 0.78,
        'boxes': (
            (0.00, 0.00, 0.24, 1.00),
            (0.24, 0.76, 0.78, 1.00),
            (0.56, 0.48, 0.80, 0.76),
            (0.24, 0.48, 0.56, 0.68),
        ),
        'bars': ((0.36, 0.46, 0.98, 0.02, 0.22),),
    },
    'E': {
        'aspect': 0.66,
        'boxes': (
            (0.00, 0.00, 0.26, 1.00),
            (0.26, 0.78, 0.96, 1.00),
            (0.26, 0.40, 0.74, 0.60),
            (0.26, 0.00, 0.96, 0.22),
        ),
        'bars': (),
    },
    'G': {
        'aspect': 0.76,
        'boxes': (
            (0.00, 0.22, 0.24, 0.78),
            (0.00, 0.78, 0.24, 1.00),
            (0.24, 0.78, 0.90, 1.00),
            (0.00, 0.00, 0.90, 0.22),
            (0.66, 0.22, 0.90, 0.56),
            (0.40, 0.38, 0.66, 0.56),
        ),
        'bars': (),
    },
    'A': {
        'aspect': 0.80,
        'boxes': ((0.24, 0.34, 0.76, 0.52),),
        'bars': (
            (0.10, 0.00, 0.46, 1.00, 0.22),
            (0.90, 0.00, 0.54, 1.00, 0.22),
        ),
    },
    'L': {
        'aspect': 0.62,
        'boxes': (
            (0.00, 0.22, 0.26, 1.00),
            (0.00, 0.00, 0.94, 0.22),
        ),
        'bars': (),
    },
    'C': {
        'aspect': 0.72,
        'boxes': (
            (0.00, 0.22, 0.24, 0.78),
            (0.00, 0.78, 0.88, 1.00),
            (0.00, 0.00, 0.88, 0.22),
            (0.68, 0.72, 0.92, 0.86),
            (0.68, 0.16, 0.92, 0.32),
        ),
        'bars': (),
    },
    'I': {
        'aspect': 0.40,
        'boxes': ((0.30, 0.00, 0.70, 1.00),),
        'bars': (),
    },
    'N': {
        'aspect': 0.78,
        'boxes': (
            (0.00, 0.00, 0.24, 1.00),
            (0.76, 0.00, 1.00, 1.00),
        ),
        'bars': ((0.18, 0.96, 0.82, 0.04, 0.20),),
    },
    'M': {
        'aspect': 0.96,
        'boxes': (
            (0.00, 0.00, 0.20, 1.00),
            (0.80, 0.00, 1.00, 1.00),
        ),
        'bars': (
            (0.16, 1.00, 0.50, 0.32, 0.18),
            (0.84, 1.00, 0.50, 0.32, 0.18),
        ),
    },
    'S': {
        'aspect': 0.70,
        'boxes': (
            (0.08, 0.78, 0.94, 1.00),
            (0.08, 0.56, 0.32, 0.78),
            (0.08, 0.40, 0.94, 0.58),
            (0.68, 0.22, 0.94, 0.40),
            (0.06, 0.00, 0.94, 0.22),
        ),
        'bars': (),
    },
    '1': {
        'aspect': 0.46,
        'boxes': (
            (0.36, 0.00, 0.64, 1.00),
            (0.12, 0.70, 0.36, 0.94),
        ),
        'bars': (),
    },
    '3': {
        'aspect': 0.70,
        'boxes': (
            (0.08, 0.78, 0.92, 1.00),
            (0.20, 0.40, 0.68, 0.58),
            (0.08, 0.00, 0.92, 0.22),
            (0.68, 0.22, 0.92, 0.78),
        ),
        'bars': (),
    },
    '9': {
        'aspect': 0.70,
        'boxes': (
            (0.08, 0.78, 0.90, 1.00),
            (0.08, 0.56, 0.32, 0.78),
            (0.32, 0.42, 0.66, 0.58),
            (0.66, 0.20, 0.90, 0.78),
            (0.16, 0.00, 0.90, 0.22),
        ),
        'bars': (),
    },
}


def _map_glyph_point(lx, ly, lz, center, tangent, normal, width, height, depth):
    up = Vector((0.0, 1.0, 0.0))
    return (
        center
        + tangent * ((lx - 0.5) * width)
        + up * ((ly - 0.5) * height)
        + normal * (lz * depth)
    )


def add_glyph(acc, char, center, tangent, normal, height, depth):
    spec = GLYPHS[char]
    width = height * spec['aspect']
    center = Vector(center)
    tangent = Vector(tangent).normalized()
    normal = Vector(normal).normalized()

    def corner(lx, ly, lz):
        return _map_glyph_point(lx, ly, lz, center, tangent, normal, width, height, depth)

    def emit_corners(c000, c100, c110, c010, c001, c101, c111, c011):
        # Outward hints are the box face directions in glyph space, mapped.
        up = Vector((0.0, 1.0, 0.0))
        hints = {
            'back': -normal,
            'front': normal,
            'bottom': -up,
            'top': up,
            'left': -tangent,
            'right': tangent,
        }
        pairs = (
            ((c000, c100, c110, c010), hints['back']),
            ((c001, c101, c111, c011), hints['front']),
            ((c000, c100, c101, c001), hints['bottom']),
            ((c010, c110, c111, c011), hints['top']),
            ((c000, c010, c011, c001), hints['left']),
            ((c100, c110, c111, c101), hints['right']),
        )
        for pts, hint in pairs:
            acc.face(pts, hint)

    for x0, y0, x1, y1 in spec['boxes']:
        emit_corners(
            corner(x0, y0, 0), corner(x1, y0, 0), corner(x1, y1, 0), corner(x0, y1, 0),
            corner(x0, y0, 1), corner(x1, y0, 1), corner(x1, y1, 1), corner(x0, y1, 1),
        )
    for x0, y0, x1, y1, thick in spec['bars']:
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy)
        px, py = -dy / length * thick * 0.5, dx / length * thick * 0.5
        quad = (
            (x0 + px, y0 + py),
            (x1 + px, y1 + py),
            (x1 - px, y1 - py),
            (x0 - px, y0 - py),
        )
        # Lift bars a hair so they don't flicker where they meet the stems.
        lift = 0.08

        def lifted(lx, ly, lz):
            return corner(lx, ly, lz * 0.92 + lift)

        emit_corners(
            lifted(*quad[0], 0), lifted(*quad[1], 0), lifted(*quad[2], 0), lifted(*quad[3], 0),
            lifted(*quad[0], 1), lifted(*quad[1], 1), lifted(*quad[2], 1), lifted(*quad[3], 1),
        )
    return width


def add_string(acc, text, origin, tangent, normal, height, depth, gap):
    """Lay text out along tangent. origin is the back-face center of the first letter's left edge line."""
    cursor = 0.0
    up = Vector((0.0, 1.0, 0.0))
    tangent = Vector(tangent).normalized()
    normal = Vector(normal).normalized()
    origin = Vector(origin)
    for char in text:
        if char == ' ':
            cursor += height * 0.34
            continue
        aspect = GLYPHS[char]['aspect']
        width = height * aspect
        center = origin + tangent * (cursor + width * 0.5) + up * (height * 0.5)
        add_glyph(acc, char, center, tangent, normal, height, depth)
        cursor += width + gap
    return cursor


def finish(name, acc, material, collection, smooth='flat'):
    if not acc.faces:
        return None
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in acc.verts], [], acc.faces)
    mesh.validate(verbose=False)
    mesh.update()
    if smooth == 'tower':
        for poly in mesh.polygons:
            poly.use_smooth = abs(poly.normal.y) < 0.72
    elif smooth == 'smooth':
        for poly in mesh.polygons:
            poly.use_smooth = True
    else:
        for poly in mesh.polygons:
            poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    return obj


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def facade_windows(glass, trim, axis, fixed, u0, u1, y0, y1, outward, cols, rows):
    """Punch a grid of framed panes on an axis-aligned wall.

    axis 'z': wall faces ±Z, u runs along X, fixed is the wall's outer Z.
    axis 'x': wall faces ±X, u runs along Z, fixed is the wall's outer X.
    outward is +1 or -1 along that axis.
    """
    frame = 0.07
    mull = 0.065
    span_u = u1 - u0
    span_y = y1 - y0
    pane_u = (span_u - 2 * frame - (cols - 1) * mull) / cols
    pane_y = (span_y - 2 * frame - (rows - 1) * mull) / rows
    if pane_u < 0.18 or pane_y < 0.18:
        return
    glass_push = 0.025 * outward
    trim_push = 0.055 * outward
    glass_depth = 0.03
    trim_depth = 0.045

    def put(acc, ua, ub, ya, yb, push, depth, along_sign):
        start = fixed + push
        end = start + depth * along_sign
        lo, hi = (start, end) if start < end else (end, start)
        if axis == 'z':
            acc.box((ua, ya, lo), (ub, yb, hi))
        else:
            acc.box((lo, ya, ua), (hi, yb, ub))

    along = 1 if outward > 0 else -1
    for col in range(cols):
        for row in range(rows):
            u_a = u0 + frame + col * (pane_u + mull)
            y_a = y0 + frame + row * (pane_y + mull)
            u_b = u_a + pane_u
            y_b = y_a + pane_y
            put(glass, u_a, u_b, y_a, y_b, glass_push, glass_depth, along)
            # Frame sits proud of the glass and covers the pane perimeter.
            t = frame
            put(trim, u_a - t, u_b + t, y_a - t, y_a, trim_push, trim_depth, along)
            put(trim, u_a - t, u_b + t, y_b, y_b + t, trim_push, trim_depth, along)
            put(trim, u_a - t, u_a, y_a, y_b, trim_push, trim_depth, along)
            put(trim, u_b, u_b + t, y_a, y_b, trim_push, trim_depth, along)


def add_column(columns, x0, z_outer):
    """Thick square column with a plinth and a capital, outer face toward +Z."""
    x1 = x0 + COL_SIZE
    z1 = z_outer
    z0 = z_outer - COL_SIZE
    chamfer = 0.07
    columns.extrusion(square_ring(x0, z0, x1, z1, chamfer), 0.20, SOFFIT_Y - 0.02)
    # Plinth and capital stay square and a little wider so the column reads as structure.
    pad = 0.08
    columns.box((x0 - pad, 0.0, z0 - pad), (x1 + pad, 0.22, z1 + 0.02))
    columns.box((x0 - 0.04, SOFFIT_Y - 0.16, z0 - 0.04), (x1 + 0.04, SOFFIT_Y + 0.02, z1 + 0.04))


def build_colonnade(materials, collection):
    walls = Acc()
    columns = Acc()
    roof = Acc()
    glass = Acc()
    trim = Acc()
    awnings = Acc()
    address = Acc()

    half_w = COLONNADE_W * 0.5
    back_z = -HALF_D
    wall_t = 0.28

    # Enclosed retail volume, storefront at STORE_Z. Ends stay open in front of
    # this plane so the colonnade depth is visible from the side.
    walls.box((-half_w, 0.0, back_z), (half_w, SOFFIT_Y, STORE_Z))
    # Upper floor rides out to the street edge of the columns.
    walls.box((-half_w, SOFFIT_Y, back_z), (half_w, PARAPET_Y - 0.55, FRONT_Z))
    # Cornice / parapet cap. Projects past the column faces.
    walls.box((-half_w - 0.06, PARAPET_Y - 0.62, back_z - 0.06),
              (half_w + 0.06, PARAPET_Y, FRONT_Z + 0.22))
    # Soffit lip along the street, the edge of the deep overhang.
    walls.box((-half_w, SOFFIT_Y - 0.10, FRONT_Z - 0.08),
              (half_w, SOFFIT_Y + 0.08, FRONT_Z + 0.16))

    roof.box((-half_w + 0.45, ROOF_Y, back_z + 0.45),
             (half_w - 0.45, ROOF_Y + 0.18, FRONT_Z - 0.55))
    # Mechanical boxes keep the roof from reading as a blank slab.
    roof.box((-half_w + 4.0, ROOF_Y + 0.18, back_z + 3.2),
             (-half_w + 8.4, ROOF_Y + 1.35, back_z + 6.4))
    roof.box((half_w - 11.5, ROOF_Y + 0.18, -1.5),
             (half_w - 7.2, ROOF_Y + 1.15, 1.6))
    roof.box((-2.2, ROOF_Y + 0.18, back_z + 2.4),
             (1.4, ROOF_Y + 0.85, back_z + 4.6))

    def column_x(index):
        return -half_w + index * (COL_SIZE + BAY_OPEN)

    for index in range(N_COLS):
        add_column(columns, column_x(index), FRONT_Z)
        # Beam from the storefront head back to the column, under the soffit.
        x_mid = column_x(index) + COL_SIZE * 0.5
        columns.box((x_mid - 0.14, SOFFIT_Y - 0.32, STORE_Z),
                    (x_mid + 0.14, SOFFIT_Y - 0.02, FRONT_Z - COL_SIZE + 0.04))

    for bay in range(N_BAYS):
        x0 = column_x(bay) + COL_SIZE + 0.16
        x1 = column_x(bay + 1) - 0.16
        # Upper curtain wall: two glass bands, two panes wide. Dark mullions.
        facade_windows(
            glass, trim, 'z', FRONT_Z,
            x0, x1, SOFFIT_Y + 0.62, PARAPET_Y - 1.05,
            +1, cols=2, rows=2,
        )
        # Horizontal rail between the two glass bands, proud of the glazing.
        mid_y = (SOFFIT_Y + 0.62 + PARAPET_Y - 1.05) * 0.5
        trim.box((x0, mid_y - 0.055, FRONT_Z + 0.04), (x1, mid_y + 0.055, FRONT_Z + 0.10))

        has_door = bay in (1, 4, 6)
        address_bay = bay == 1
        header_y0, header_y1 = 3.48, 4.02
        trim.box((x0 - 0.06, header_y0, STORE_Z), (x1 + 0.06, header_y1, STORE_Z + 0.10))
        if has_door:
            door_w = 1.85 if address_bay else 1.15
            door_x0 = (x0 + x1 - door_w) * 0.5
            door_x1 = door_x0 + door_w
            facade_windows(glass, trim, 'z', STORE_Z, x0, door_x0 - 0.08, 0.08, header_y0 - 0.06, +1, 1, 1)
            facade_windows(glass, trim, 'z', STORE_Z, door_x1 + 0.08, x1, 0.08, header_y0 - 0.06, +1, 1, 1)
            facade_windows(glass, trim, 'z', STORE_Z, door_x0, door_x1, 0.02, 2.55, +1, 2 if address_bay else 1, 1)
            # Transom over the door. The 199 address sits on this band.
            facade_windows(glass, trim, 'z', STORE_Z, door_x0, door_x1, 2.68, header_y0 - 0.06, +1, 1, 1)
            trim.box((door_x0 + 0.08, 1.05, STORE_Z + 0.07), (door_x1 - 0.08, 1.14, STORE_Z + 0.12))
            if address_bay:
                band_y0, band_y1 = 2.78, 3.32
                trim.box((door_x0 + 0.08, band_y0, STORE_Z + 0.05),
                         (door_x1 - 0.08, band_y1, STORE_Z + 0.09))
                # "199" is centered on the transom. Width is height * (0.46+0.70+0.70) plus gaps.
                address_h = 0.42
                address_w = address_h * (0.46 + 0.70 + 0.70) + 0.035 * 2
                add_string(
                    address, '199',
                    Vector(((door_x0 + door_x1 - address_w) * 0.5, band_y0 + 0.06, STORE_Z + 0.10)),
                    (1, 0, 0), (0, 0, 1),
                    height=address_h, depth=0.04, gap=0.035,
                )
        else:
            facade_windows(glass, trim, 'z', STORE_Z, x0, x1, 0.08, header_y0 - 0.06, +1, 3, 1)

        # Teal awning. Sloped slab plus a short valance. Not a tenant logo.
        awn_x0 = x0 + 0.18
        awn_x1 = x1 - 0.18
        y_back, z_back = 3.92, STORE_Z + 0.12
        y_front, z_front = 3.18, STORE_Z + 2.85
        add_awning(awnings, awn_x0, awn_x1, y_back, z_back, y_front, z_front)

    # West end (exposed, away from the theater) gets glass. East end is the party wall.
    west_x = -half_w
    facade_windows(glass, trim, 'x', west_x, back_z + 1.1, STORE_Z - 0.8, 0.7, SOFFIT_Y - 0.45, -1, 3, 1)
    facade_windows(glass, trim, 'x', west_x, back_z + 1.1, FRONT_Z - 0.8, SOFFIT_Y + 0.7, PARAPET_Y - 1.15, -1, 4, 2)
    # Rear, facing the block interior. Smaller punched windows, one service door.
    facade_windows(glass, trim, 'z', back_z, -half_w + 1.4, half_w - 1.4, 0.85, SOFFIT_Y - 0.7, -1, 8, 1)
    facade_windows(glass, trim, 'z', back_z, -half_w + 1.4, half_w - 1.4, SOFFIT_Y + 0.75, PARAPET_Y - 1.2, -1, 8, 2)
    trim.box((-1.15, 0.0, back_z - 0.08), (1.15, 2.7, back_z - 0.02))
    glass.box((-0.95, 0.15, back_z - 0.12), (0.95, 2.5, back_z - 0.08))

    # Base course along the storefront so the glazing doesn't meet the ground as a knife edge.
    walls.box((-half_w, 0.0, STORE_Z - wall_t), (half_w, 0.10, STORE_Z + 0.02))

    built = {
        'Walls': finish('Walls', walls, materials['Walls'], collection),
        'Columns': finish('Columns', columns, materials['Columns'], collection),
        'Roof': finish('Roof', roof, materials['Roof'], collection),
        'Glass': finish('Glass', glass, materials['Glass'], collection),
        'Trim': finish('Trim', trim, materials['Trim'], collection),
        'Awnings': finish('Awnings', awnings, materials['Awnings'], collection),
        'Address': finish('Address', address, materials['Address'], collection),
    }
    return {name: obj for name, obj in built.items() if obj is not None}


def add_awning(acc, x0, x1, y_back, z_back, y_front, z_front):
    dy = y_front - y_back
    dz = z_front - z_back
    length = math.hypot(dy, dz)
    ny, nz = dz / length, -dy / length
    thick = 0.055
    off_y, off_z = ny * thick, nz * thick

    def quad_z(y, z):
        return y, z

    y0, z0 = quad_z(y_back, z_back)
    y1, z1 = quad_z(y_front, z_front)
    # Slab, normal tilted up/out. Valance hangs from the outer edge.
    slab = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z1), (x0, y1, z1),
        (x0, y0 + off_y, z0 + off_z), (x1, y0 + off_y, z0 + off_z),
        (x1, y1 + off_y, z1 + off_z), (x0, y1 + off_y, z1 + off_z),
    ]
    outward_pairs = (
        ((0, 1, 2, 3), (0, -ny, -nz)),
        ((4, 5, 6, 7), (0, ny, nz)),
        ((0, 1, 5, 4), (0, y0 - y1, z0 - z1)),
        ((3, 2, 6, 7), (0, y1 - y0, z1 - z0)),
        ((0, 3, 7, 4), (-1, 0, 0)),
        ((1, 2, 6, 5), (1, 0, 0)),
    )
    for idxs, hint in outward_pairs:
        acc.face([slab[i] for i in idxs], hint)

    drop = 0.20
    # Valance uses the outer lower/upper edge and hangs straight down.
    valance = [
        (x0, y1, z1),
        (x1, y1, z1),
        (x1, y1 - drop, z1 + 0.02),
        (x0, y1 - drop, z1 + 0.02),
        (x0, y1 + off_y, z1 + off_z),
        (x1, y1 + off_y, z1 + off_z),
        (x1, y1 - drop + off_y * 0.15, z1 + off_z),
        (x0, y1 - drop + off_y * 0.15, z1 + off_z),
    ]
    for idxs, hint in (
        ((0, 1, 2, 3), (0, 0, 1)),
        ((4, 5, 6, 7), (0, 0.2, 1)),
        ((0, 3, 7, 4), (-1, 0, 0)),
        ((1, 2, 6, 5), (1, 0, 0)),
        ((3, 2, 6, 7), (0, -1, 0)),
        ((0, 1, 5, 4), (0, 1, 0)),
    ):
        acc.face([valance[i] for i in idxs], hint)


def marquee_bow(x, half=11.0, rise=3.05):
    u = max(-1.0, min(1.0, x / half))
    return FRONT_Z + 0.22 + rise * (1.0 - u * u)


def marquee_frame(x, half=11.0, rise=3.05):
    """Outward XZ normal and unit tangent (toward +X) at a station on the marquee lip."""
    # Derivative of bow: dZ/dx = rise * (-2x) / half^2
    dz = rise * (-2.0 * x) / (half * half)
    tangent = Vector((1.0, 0.0, dz)).normalized()
    normal = Vector((dz, 0.0, -1.0))  # rotate tangent; flip to face +Z-ish below
    # Tangent (tx, tz), a perpendicular is (tz, -tx) or (-tz, tx).
    normal = Vector((tangent.z, 0.0, -tangent.x))
    if normal.z < 0:
        normal = -normal
    return tangent, normal.normalized()


def build_marquee(marquee, board, trim, x_left=-11.0, x_right=11.0, segments=22):
    y0, y1 = 3.82, 5.58
    stations = []
    for i in range(segments + 1):
        x = x_left + (x_right - x_left) * i / segments
        z_front = marquee_bow(x)
        stations.append((x, z_front))

    def pt(i, y, front):
        x, z_front = stations[i]
        z = z_front if front else FRONT_Z + 0.04
        return (x, y, z)

    for i in range(segments):
        # Curved beam: flat against the facade, arc toward the street.
        quads = {
            'bottom': (pt(i, y0, False), pt(i + 1, y0, False), pt(i + 1, y0, True), pt(i, y0, True)),
            'top': (pt(i, y1, False), pt(i + 1, y1, False), pt(i + 1, y1, True), pt(i, y1, True)),
            'front': (pt(i, y0, True), pt(i + 1, y0, True), pt(i + 1, y1, True), pt(i, y1, True)),
            'back': (pt(i, y0, False), pt(i, y1, False), pt(i + 1, y1, False), pt(i + 1, y0, False)),
        }
        _, normal = marquee_frame(0.5 * (stations[i][0] + stations[i + 1][0]))
        marquee.face(quads['bottom'], (0, -1, 0))
        marquee.face(quads['top'], (0, 1, 0))
        marquee.face(quads['front'], (normal.x, 0, normal.z))
        marquee.face(quads['back'], (0, 0, -1))

    # End caps, where the arc still has a little depth.
    for i, outward_x in ((0, -1), (segments, 1)):
        cap = (pt(i, y0, False), pt(i, y0, True), pt(i, y1, True), pt(i, y1, False))
        marquee.face(cap, (outward_x, 0, 0))

    # Letter board and black frame follow the outer face.
    board_y0, board_y1 = 4.08, 5.34
    for i in range(segments):
        x_mid = 0.5 * (stations[i][0] + stations[i + 1][0])
        _, normal = marquee_frame(x_mid)
        lift = 0.045

        def lifted(i_s, y):
            x, z = stations[i_s][0], marquee_bow(stations[i_s][0])
            return (x + normal.x * lift, y, z + normal.z * lift)

        board.face(
            (lifted(i, board_y0), lifted(i + 1, board_y0), lifted(i + 1, board_y1), lifted(i, board_y1)),
            (normal.x, 0, normal.z),
        )
        # Top and bottom rails of the black frame.
        for y_a, y_b in ((board_y1, board_y1 + 0.12), (board_y0 - 0.12, board_y0)):
            trim.face(
                (lifted(i, y_a), lifted(i + 1, y_a), lifted(i + 1, y_b), lifted(i, y_b)),
                (normal.x, 0, normal.z),
            )
        # Give the frame a little thickness so it isn't a single sheet.
        depth = 0.05

        def thick(i_s, y, scale):
            x, z = stations[i_s][0], marquee_bow(stations[i_s][0])
            return (
                x + normal.x * (lift + depth * scale),
                y,
                z + normal.z * (lift + depth * scale),
            )

        for y_a, y_b in ((board_y1, board_y1 + 0.12), (board_y0 - 0.12, board_y0)):
            trim.face(
                (thick(i, y_a, 1), thick(i + 1, y_a, 1), thick(i + 1, y_b, 1), thick(i, y_b, 1)),
                (normal.x, 0, normal.z),
            )
            trim.face((lifted(i, y_a), thick(i, y_a, 1), thick(i, y_b, 1), lifted(i, y_b)), (-1 if i == 0 else 0, 0, 0))


def build_theater(materials, collection):
    walls = Acc()
    columns = Acc()
    roof = Acc()
    glass = Acc()
    trim = Acc()
    marquee = Acc()
    board = Acc()
    sign = Acc()
    letters = Acc()
    posters = {
        'PosterBrick': Acc(),
        'PosterSand': Acc(),
        'PosterTeal': Acc(),
        'PosterBlue': Acc(),
    }
    awnings = Acc()

    half_w = THEATER_W * 0.5
    back_z = -HALF_D
    wall_front = FRONT_Z
    door_half = 3.15
    recess_z = wall_front - 1.85

    # Wings run to the street. The center stops at the recess, then continues
    # above the lobby doors so the entry is a real opening under the marquee.
    # The west wing is plain stone; it is the party wall toward the colonnade.
    walls.box((-half_w, 0.0, back_z), (-door_half, PARAPET_Y - 0.58, wall_front))
    walls.box((door_half, 0.0, back_z), (half_w, PARAPET_Y - 0.58, wall_front))
    walls.box((-door_half, 0.0, back_z), (door_half, PARAPET_Y - 0.58, recess_z))
    walls.box((-door_half, 3.72, recess_z), (door_half, PARAPET_Y - 0.58, wall_front))
    walls.box((-half_w - 0.05, PARAPET_Y - 0.64, back_z - 0.05),
              (half_w + 0.05, PARAPET_Y, wall_front + 0.16))
    # Floor line shared with the colonnade soffit, so the street wall can align.
    walls.box((-half_w, SOFFIT_Y - 0.08, wall_front), (-door_half, SOFFIT_Y + 0.10, wall_front + 0.18))
    walls.box((door_half, SOFFIT_Y - 0.08, wall_front), (half_w, SOFFIT_Y + 0.10, wall_front + 0.18))

    roof.box((-half_w + 0.5, ROOF_Y, back_z + 0.5), (half_w - 0.5, ROOF_Y + 0.16, wall_front - 0.7))
    roof.box((-half_w + 2.2, ROOF_Y + 0.16, back_z + 2.0), (-half_w + 6.4, ROOF_Y + 1.4, back_z + 5.2))
    roof.box((2.4, ROOF_Y + 0.16, back_z + 2.6), (6.2, ROOF_Y + 1.05, back_z + 5.0))

    trim.box((-door_half - 0.16, 0.0, recess_z), (-door_half, 3.72, wall_front + 0.06))
    trim.box((door_half, 0.0, recess_z), (door_half + 0.16, 3.72, wall_front + 0.06))
    trim.box((-door_half - 0.16, 3.52, recess_z), (door_half + 0.16, 3.78, wall_front + 0.08))
    facade_windows(glass, trim, 'z', recess_z, -door_half + 0.25, door_half - 0.25, 0.05, 2.72, +1, 2, 1)
    trim.box((-door_half + 0.45, 1.02, recess_z + 0.05), (door_half - 0.45, 1.12, recess_z + 0.11))
    facade_windows(glass, trim, 'z', recess_z, -door_half + 0.25, door_half - 0.25, 2.86, 3.48, +1, 2, 1)

    # Piers that carry the marquee, Columns material, proud of the stone wall.
    pier_specs = (-9.6, -4.05, 3.35, 8.85)
    for px in pier_specs:
        columns.extrusion(
            square_ring(px, wall_front - 0.15, px + 1.15, wall_front + 0.85, 0.06),
            0.0, 3.82,
        )

    # Poster cases between the outer and inner piers. Saturated, flat, no artwork.
    poster_colors = ('PosterBrick', 'PosterSand', 'PosterTeal', 'PosterBlue')
    poster_slots = (
        (-8.15, 0.55),
        (-6.55, 0.55),
        (4.70, 0.55),
        (6.40, 0.55),
    )
    for (px, py), name in zip(poster_slots, poster_colors):
        trim.box((px, py, wall_front + 0.02), (px + 1.35, py + 2.05, wall_front + 0.08))
        posters[name].box((px + 0.08, py + 0.08, wall_front + 0.08), (px + 1.27, py + 1.97, wall_front + 0.12))

    # Side bays outside the marquee: glass storefront and a small cream awning,
    # the retail frontage that flanks the cinema on Montgomery.
    for x0, x1 in ((-half_w + 0.45, -11.35), (11.35, half_w - 0.45)):
        facade_windows(glass, trim, 'z', wall_front, x0, x1, 0.15, 3.35, +1, 2, 1)
        add_awning(awnings, x0 + 0.15, x1 - 0.15, 3.55, wall_front + 0.08, 3.05, wall_front + 1.7)

    # Upper floor glass on either side of the blade, two bands like the colonnade.
    facade_windows(glass, trim, 'z', wall_front, -half_w + 0.7, -4.7, SOFFIT_Y + 0.55, PARAPET_Y - 1.05, +1, 3, 2)
    facade_windows(glass, trim, 'z', wall_front, 2.4, half_w - 0.7, SOFFIT_Y + 0.55, PARAPET_Y - 1.05, +1, 4, 2)

    # East wall is the glassy return seen beside the barber awning in the street photo.
    # West wall stays plain stone (party wall toward the colonnade).
    east_x = half_w
    facade_windows(glass, trim, 'x', east_x, back_z + 0.8, FRONT_Z - 0.7, 0.55, SOFFIT_Y - 0.4, +1, 3, 1)
    facade_windows(glass, trim, 'x', east_x, back_z + 0.8, FRONT_Z - 0.7, SOFFIT_Y + 0.55, PARAPET_Y - 1.05, +1, 3, 2)
    facade_windows(glass, trim, 'z', back_z, -half_w + 1.2, half_w - 1.2, 0.8, SOFFIT_Y - 0.55, -1, 5, 1)
    facade_windows(glass, trim, 'z', back_z, -half_w + 1.2, half_w - 1.2, SOFFIT_Y + 0.6, PARAPET_Y - 1.15, -1, 5, 2)
    trim.box((-6.4, 0.0, back_z - 0.08), (-4.1, 2.6, back_z - 0.02))
    glass.box((-6.2, 0.12, back_z - 0.12), (-4.3, 2.42, back_z - 0.08))

    build_marquee(marquee, board, trim)

    # Sign blade, just left of center, rising off the marquee.
    blade_cx = -2.05
    blade_half_x = 1.72
    blade_half_z = 0.40
    blade_z = marquee_bow(blade_cx) - 0.55
    sign.box(
        (blade_cx - blade_half_x, 5.35, blade_z - blade_half_z),
        (blade_cx + blade_half_x, SIGN_TOP - 0.18, blade_z + blade_half_z),
    )
    sign.box(
        (blade_cx - blade_half_x - 0.08, SIGN_TOP - 0.22, blade_z - blade_half_z - 0.06),
        (blade_cx + blade_half_x + 0.08, SIGN_TOP, blade_z + blade_half_z + 0.06),
    )

    letter_h = 2.92
    gap = 0.30
    stack_top = SIGN_TOP - 0.55
    for index, char in enumerate('REGAL'):
        y_top = stack_top - index * (letter_h + gap)
        y_center = y_top - letter_h * 0.5
        add_glyph(
            letters, char,
            (blade_cx, y_center, blade_z + blade_half_z + 0.012),
            (1, 0, 0), (0, 0, 1),
            letter_h, 0.16,
        )
        add_glyph(
            letters, char,
            (blade_cx, y_center, blade_z - blade_half_z - 0.012),
            (-1, 0, 0), (0, 0, -1),
            letter_h, 0.16,
        )

    # White cylinder and sphere immediately east of the blade.
    tower_cx = 1.15
    tower_z = marquee_bow(tower_cx) - 0.85
    tower_r = 0.96
    tower = Acc()
    tower.extrusion(cylinder_ring(tower_cx, tower_z, tower_r, 18), 5.45, 20.55)
    for band_y in (8.4, 11.7, 15.0, 18.35):
        tower.extrusion(cylinder_ring(tower_cx, tower_z, tower_r + 0.10, 18), band_y, band_y + 0.26)
    sphere_r = 1.38
    sphere_center_y = SPHERE_TOP - sphere_r
    sphere = Acc()
    add_sphere(sphere, (tower_cx, sphere_center_y, tower_z), sphere_r, segments=18, rings=10)
    # Ring just below where the shaft visually meets the sphere.
    tower.extrusion(
        cylinder_ring(tower_cx, tower_z, tower_r + 0.12, 18),
        19.62, 19.90,
    )

    # Mast just west of the blade, the thin pole in the street photo.
    trim.box((blade_cx - blade_half_x - 0.55, ROOF_Y, blade_z - 0.08),
             (blade_cx - blade_half_x - 0.37, 28.4, blade_z + 0.10))

    add_marquee_copy(letters, trim)

    built = {
        'Walls': finish('Walls', walls, materials['Walls'], collection),
        'Columns': finish('Columns', columns, materials['Columns'], collection),
        'Roof': finish('Roof', roof, materials['Roof'], collection),
        'Glass': finish('Glass', glass, materials['Glass'], collection),
        'Trim': finish('Trim', trim, materials['Trim'], collection),
        'Awnings': finish('Awnings', awnings, materials['Awnings'], collection),
        'Marquee': finish('Marquee', marquee, materials['Marquee'], collection),
        'MarqueeBoard': finish('MarqueeBoard', board, materials['MarqueeBoard'], collection),
        'RegalSign': finish('RegalSign', sign, materials['RegalSign'], collection),
        'RegalLetters': finish('RegalLetters', letters, materials['RegalLetters'], collection),
        'RegalTower': finish('RegalTower', tower, materials['RegalSign'], collection, smooth='tower'),
        'RegalSphere': finish('RegalSphere', sphere, materials['RegalSign'], collection, smooth='smooth'),
    }
    for name, acc in posters.items():
        obj = finish(name, acc, materials[name], collection)
        if obj:
            built[name] = obj
    return built


def add_marquee_copy(letters, trim):
    """CINEMAS 13 on the left of the board, and dark letter slots on the right.

    Slots are individual short boards following the curve, not readable titles.
    """
    text_h = 0.62
    # Place the string by walking the arc in X. Each letter is rotated to the lip.
    text = 'CINEMAS 13'
    # Estimate width so the block starts near the left end of the board.
    width = 0.0
    for char in text:
        if char == ' ':
            width += text_h * 0.34
        else:
            width += text_h * GLYPHS[char]['aspect'] + text_h * 0.08
    x_cursor = -10.15
    for char in text:
        if char == ' ':
            x_cursor += text_h * 0.34
            continue
        aspect = GLYPHS[char]['aspect']
        w = text_h * aspect
        x_mid = x_cursor + w * 0.5
        z = marquee_bow(x_mid)
        tangent, normal = marquee_frame(x_mid)
        center = Vector((
            x_mid + normal.x * 0.07,
            4.22,
            z + normal.z * 0.07,
        ))
        # add_glyph expects the center of the letter, tangent, normal.
        add_glyph(letters, char, center + Vector((0, text_h * 0.5, 0)), tangent, normal, text_h, 0.055)
        x_cursor += w + text_h * 0.08

    x = -0.6
    while x < 10.15:
        for y in (4.30, 4.72, 5.12):
            x_mid = x + 0.26
            z = marquee_bow(x_mid)
            tangent, normal = marquee_frame(x_mid)
            # A short slot, 0.52m along the tangent, 0.07m tall, 0.04m thick.
            up = Vector((0, 1, 0))
            center = Vector((x_mid + normal.x * 0.065, y, z + normal.z * 0.065))
            hx, hy, hz = 0.26, 0.035, 0.02
            corners = []
            for sx in (-1, 1):
                for sy in (-1, 1):
                    for sz in (-1, 1):
                        corners.append(center + tangent * (sx * hx) + up * (sy * hy) + normal * (sz * hz))
            # Reorder to the standard box corner indexing used by face() via explicit faces.
            # corners were appended sx, sy, sz with sx slowest? Nested loops: sx, then sy, then sz.
            # Index: sx=-1 sy=-1 sz=-1 -> 0, sz=+1 -> 1, sy=+1 sz=-1 -> 2, sz=+1 -> 3, then sx=+1...
            # That's not the box order. Build faces from the tangent frame directly.
            c = center
            t, n = tangent, normal
            p = [
                c - t * hx - up * hy - n * hz,
                c + t * hx - up * hy - n * hz,
                c + t * hx + up * hy - n * hz,
                c - t * hx + up * hy - n * hz,
                c - t * hx - up * hy + n * hz,
                c + t * hx - up * hy + n * hz,
                c + t * hx + up * hy + n * hz,
                c - t * hx + up * hy + n * hz,
            ]
            trim.face([p[0], p[1], p[2], p[3]], -n)
            trim.face([p[4], p[5], p[6], p[7]], n)
            trim.face([p[0], p[1], p[5], p[4]], -up)
            trim.face([p[3], p[2], p[6], p[7]], up)
            trim.face([p[0], p[3], p[7], p[4]], -t)
            trim.face([p[1], p[2], p[6], p[5]], t)
        x += 0.78


def setup_scene():
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 24
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 1.1
    scene.eevee.gtao_factor = 1.15
    scene.eevee.use_bloom = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'

    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs[0].default_value = hex_linear('#8EC8F0')
    background.inputs[1].default_value = 0.9

    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 3.6
    sun_data.angle = math.radians(1.4)
    sun_data.color = (1.0, 0.96, 0.90)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    # From the south-east, so the street facade takes the hard light.
    sun.rotation_euler = (math.radians(54), math.radians(4), math.radians(32))
    fill_data = bpy.data.lights.new('Fill', 'SUN')
    fill_data.energy = 0.45
    fill_data.angle = math.radians(8)
    fill_data.color = (0.75, 0.84, 0.95)
    fill = bpy.data.objects.new('Fill', fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(68), math.radians(-8), math.radians(210))

    ground = Acc()
    ground.box((-90, -0.06, -90), (90, -0.012, 90))
    ground_mat = make_material('PreviewGround', '#6A655F', 0.92)
    preview = new_collection('Preview')
    finish('PreviewGround', ground, ground_mat, preview)
    return scene


def look_at(camera, target):
    """Point a camera at target with world +Y as up.

    Blender's to_track_quat('-Z', 'Y') rolls the camera when the view is oblique,
    so the basis is built directly. Local -Z looks at the target.
    """
    from mathutils import Matrix
    direction = (Vector(target) - camera.location).normalized()
    z_axis = -direction
    x_axis = Vector((0.0, 1.0, 0.0)).cross(z_axis).normalized()
    y_axis = z_axis.cross(x_axis).normalized()
    rotation = Matrix((
        (x_axis.x, y_axis.x, z_axis.x),
        (x_axis.y, y_axis.y, z_axis.y),
        (x_axis.z, y_axis.z, z_axis.z),
    ))
    camera.rotation_mode = 'QUATERNION'
    camera.rotation_quaternion = rotation.to_quaternion()


def render_view(scene, collection, others, filename, location, target, lens):
    for other in others:
        if other is None:
            continue
        other.hide_render = True
    collection.hide_render = False
    for obj in collection.objects:
        obj.hide_render = False
    camera_data = bpy.data.cameras.new(filename)
    camera_data.lens = lens
    camera_data.clip_start = 0.05
    camera_data.clip_end = 400
    camera = bpy.data.objects.new(filename, camera_data)
    scene.collection.objects.link(camera)
    camera.location = Vector(location)
    look_at(camera, target)
    scene.camera = camera
    scene.render.filepath = os.path.join(PREVIEW_DIR, filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def export_collection(collection, path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = collection.objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        # Geometry is authored Y-up (+X east, +Y up, +Z south). The exporter's
        # Y-up option assumes a Z-up Blender scene and would lay the building over.
        export_yup=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_texcoords=True,
        export_normals=True,
    )


def mesh_report(collection):
    triangles = 0
    materials = []
    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    for obj in collection.objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        if obj.data.materials:
            materials.append(obj.data.materials[0].name)
        for vertex in mesh.vertices:
            world = obj.matrix_world @ vertex.co
            min_v = Vector((min(min_v.x, world.x), min(min_v.y, world.y), min(min_v.z, world.z)))
            max_v = Vector((max(max_v.x, world.x), max(max_v.y, world.y), max(max_v.z, world.z)))
    print(f'  {collection.name}: {triangles} tris')
    print(f'    bbox min {tuple(round(v, 3) for v in min_v)}')
    print(f'    bbox max {tuple(round(v, 3) for v in max_v)}')
    print(f'    size {(max_v.x - min_v.x):.2f} x {(max_v.y - min_v.y):.2f} x {(max_v.z - min_v.z):.2f} m')
    print(f'    materials {materials}')
    return triangles, min_v, max_v


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    setup_scene()

    # Separate material datablocks per building so each GLB carries its own set.
    def kit(extra):
        base = {
            'Walls': ('#E6D3AE', 0.84, 0.0),
            'Columns': ('#D7C4A4', 0.78, 0.0),
            'Roof': ('#3E4348', 0.92, 0.0),
            'Glass': ('#1C6798', 0.22, 0.35),
            'Trim': ('#23262B', 0.55, 0.08),
        }
        base.update(extra)
        return {name: make_material(name, color, rough, metal) for name, (color, rough, metal) in base.items()}

    def wipe(name):
        coll = bpy.data.collections.get(name)
        if coll is None:
            return
        for obj in list(coll.objects):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh is not None and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(coll)
        for mat in list(bpy.data.materials):
            if mat.users == 0:
                bpy.data.materials.remove(mat)

    scene = bpy.context.scene
    preview = bpy.data.collections['Preview']
    for obj in preview.objects:
        obj.hide_render = False

    # Build and export one landmark at a time so Blender does not rename
    # materials to Walls.001 when the second building is created.
    theater_mats = kit({
        'Walls': ('#E4CFA6', 0.84, 0.0),
        'Columns': ('#CDB892', 0.78, 0.0),
        'Awnings': ('#F3EEE4', 0.7, 0.0),
        'Marquee': ('#F4F0E6', 0.48, 0.0),
        'MarqueeBoard': ('#F6E7C2', 0.55, 0.0),
        'RegalSign': ('#F7F7F4', 0.32, 0.04),
        'RegalLetters': ('#E10600', 0.4, 0.02),
        'PosterBrick': ('#C4533A', 0.6, 0.0),
        'PosterSand': ('#E0B15A', 0.6, 0.0),
        'PosterTeal': ('#2A8F88', 0.6, 0.0),
        'PosterBlue': ('#3D6494', 0.6, 0.0),
    })

    theater = new_collection('RegalCinemas')
    build_theater(theater_mats, theater)
    render_view(
        scene, theater, [],
        'regal-cinemas-street.png',
        (0.4, 1.65, 52.0), (-0.6, 10.2, 4.0), 26,
    )
    render_view(
        scene, theater, [],
        'regal-cinemas-three-quarter.png',
        (32.0, 6.2, 40.0), (-1.0, 10.5, 2.0), 26,
    )
    print('LANDMARK REPORT')
    mesh_report(theater)
    export_collection(theater, os.path.join(OUT_DIR, 'regal-cinemas.glb'))
    wipe('RegalCinemas')

    colonnade_mats = kit({
        'Walls': ('#E7E0D0', 0.84, 0.0),
        'Columns': ('#C6B08A', 0.78, 0.0),
        'Awnings': ('#0C7F78', 0.7, 0.0),
        'Address': ('#E2B657', 0.42, 0.15),
    })
    colonnade = new_collection('MontgomeryColonnade')
    build_colonnade(colonnade_mats, colonnade)
    render_view(
        scene, colonnade, [],
        'montgomery-colonnade-street.png',
        (-16.0, 1.62, 22.5), (8.0, 4.2, 6.5), 26,
    )
    render_view(
        scene, colonnade, [],
        'montgomery-colonnade-three-quarter.png',
        (40.0, 7.5, 36.0), (-4.0, 4.6, 1.0), 26,
    )
    mesh_report(colonnade)
    export_collection(colonnade, os.path.join(OUT_DIR, 'montgomery-colonnade.glb'))
    print(f'  colonnade footprint {COLONNADE_W:.2f} m wide (X) by {DEPTH:.2f} m deep (Z)')
    print(f'  theater footprint {THEATER_W:.2f} m wide (X) by {DEPTH:.2f} m deep (Z)')
    print(f'  parapet {PARAPET_Y:.2f} m, sign top {SIGN_TOP:.2f} m, sphere top {SPHERE_TOP:.2f} m')
    print(f'  storefront setback {FRONT_Z - STORE_Z:.2f} m')


if __name__ == '__main__':
    main()
