#!/usr/bin/env python3
"""Top-down venue maps for the Travel English app.

Every scene picks an archetype (terminal, cabin, station, street, retail,
dining, lobby, room, clinic, office, attraction) and a variant.  The zones and
fixtures live here, not in the content JSON, so 23 scenes share one visual
language and authors only place hotspots.

The SVG is decorative; the page overlays real <button> hotspots using the
percentage positions returned by render_map().
"""

from __future__ import annotations

import html

VIEW_W = 640
VIEW_H = 400


def _zone(zid, x, y, w, h, label, tone=1):
    return {"id": zid, "x": x, "y": y, "w": w, "h": h,
            "label": label, "tone": tone}


# ------------------------------------------------------------------ archetypes
ARCHETYPES = {
    "terminal": {
        "departures": {
            "zones": [
                _zone("checkin", 36, 44, 236, 104, "CHECK-IN"),
                _zone("bagdrop", 292, 44, 150, 104, "BAG DROP", 2),
                _zone("info", 462, 44, 142, 104, "INFO", 3),
                _zone("security", 36, 178, 220, 104, "SECURITY", 2),
                _zone("gates", 276, 178, 328, 178, "GATES"),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 204, "h": 18},
                {"kind": "counter", "x": 308, "y": 62, "w": 118, "h": 16},
                {"kind": "desk", "x": 486, "y": 64, "w": 94, "h": 24},
                {"kind": "lane", "x": 56, "y": 196, "w": 180, "h": 66, "n": 2},
                {"kind": "seats", "x": 300, "y": 208, "w": 200, "h": 92,
                 "cols": 5, "rows": 3},
                {"kind": "door", "x": 506, "y": 300, "w": 70, "h": 34},
            ],
        },
        "arrivals": {
            "zones": [
                _zone("immigration", 36, 44, 260, 104, "IMMIGRATION"),
                _zone("customs", 316, 44, 288, 104, "CUSTOMS", 2),
                _zone("baggage", 36, 178, 300, 178, "BAGGAGE"),
                _zone("lost", 356, 178, 248, 178, "LOST & FOUND", 3),
            ],
            "props": [
                {"kind": "lane", "x": 56, "y": 64, "w": 220, "h": 64, "n": 3},
                {"kind": "desk", "x": 336, "y": 64, "w": 246, "h": 22},
                {"kind": "carousel", "x": 60, "y": 220, "w": 250, "h": 72},
                {"kind": "desk", "x": 380, "y": 214, "w": 198, "h": 24},
                {"kind": "door", "x": 540, "y": 300, "w": 44, "h": 34},
            ],
        },
    },
    "cabin": {
        "default": {
            "zones": [
                _zone("seats", 36, 44, 250, 300, "SEATS"),
                _zone("aisle", 300, 44, 56, 300, "AISLE", 2),
                _zone("galley", 370, 44, 234, 150, "GALLEY", 3),
                _zone("cockpit", 370, 210, 234, 134, "COCKPIT", 2),
            ],
            "props": [
                {"kind": "seats", "x": 56, "y": 70, "w": 208, "h": 248,
                 "cols": 4, "rows": 7},
                {"kind": "shelf", "x": 370, "y": 60, "w": 220, "h": 26, "n": 3},
                {"kind": "cart", "x": 396, "y": 112, "w": 96, "h": 44},
                {"kind": "console", "x": 390, "y": 240, "w": 192, "h": 70},
            ],
        },
    },
    "station": {
        "subway": {
            "zones": [
                _zone("tickets", 36, 44, 180, 120, "TICKETS"),
                _zone("gates", 36, 184, 180, 120, "FARE GATES", 2),
                _zone("platform", 240, 44, 364, 180, "PLATFORM"),
                _zone("exit", 240, 244, 364, 100, "EXIT", 3),
            ],
            "props": [
                {"kind": "machine", "x": 56, "y": 64, "w": 44, "h": 72, "n": 2},
                {"kind": "gates", "x": 56, "y": 208, "w": 132, "h": 54, "n": 3},
                {"kind": "train", "x": 262, "y": 66, "w": 320, "h": 84},
                {"kind": "stairs", "x": 274, "y": 268, "w": 136, "h": 52},
            ],
        },
        "trains": {
            "zones": [
                _zone("tickets", 36, 44, 180, 120, "TICKET OFFICE"),
                _zone("platform", 240, 44, 364, 140, "PLATFORM"),
                _zone("boarding", 240, 204, 364, 80, "BOARDING", 2),
                _zone("info", 36, 184, 180, 160, "INFO", 3),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 148, "h": 18},
                {"kind": "train", "x": 262, "y": 62, "w": 320, "h": 98},
                {"kind": "platform", "x": 262, "y": 174, "w": 320, "h": 12},
                {"kind": "desk", "x": 52, "y": 220, "w": 148, "h": 24},
            ],
        },
    },
    "street": {
        "taxi": {
            "zones": [
                _zone("curb", 36, 44, 568, 80, "CURB"),
                _zone("car", 36, 144, 568, 120, "TAXI / CAR", 2),
                _zone("corner", 36, 284, 200, 72, "CORNER", 3),
                _zone("pickup", 260, 284, 344, 72, "PICKUP", 2),
            ],
            "props": [
                {"kind": "curb", "x": 40, "y": 100, "w": 560, "h": 8},
                {"kind": "car", "x": 128, "y": 166, "w": 320, "h": 72},
                {"kind": "pin", "x": 420, "y": 300, "w": 40, "h": 40},
            ],
        },
        "driving": {
            "zones": [
                _zone("gas", 36, 44, 200, 140, "GAS"),
                _zone("parking", 260, 44, 344, 140, "PARKING", 2),
                _zone("toll", 36, 204, 240, 80, "TOLL", 3),
                _zone("shoulder", 300, 204, 304, 152, "ROAD", 2),
            ],
            "props": [
                {"kind": "pump", "x": 56, "y": 66, "w": 38, "h": 72, "n": 2},
                {"kind": "parking", "x": 280, "y": 66, "w": 300, "h": 92},
                {"kind": "toll", "x": 60, "y": 222, "w": 186, "h": 40},
                {"kind": "car", "x": 324, "y": 240, "w": 250, "h": 66},
            ],
        },
        "directions": {
            "zones": [
                _zone("corner", 36, 44, 220, 160, "CORNER"),
                _zone("storefront", 280, 44, 324, 160, "STORES", 2),
                _zone("map", 36, 224, 220, 132, "MAP", 3),
                _zone("street", 280, 224, 324, 132, "STREET", 2),
            ],
            "props": [
                {"kind": "street", "x": 40, "y": 188, "w": 560, "h": 22},
                {"kind": "store", "x": 300, "y": 62, "w": 284, "h": 76, "n": 3},
                {"kind": "mapboard", "x": 56, "y": 246, "w": 180, "h": 76},
                {"kind": "person", "x": 130, "y": 120, "w": 34, "h": 34},
            ],
        },
        "car-rental": {
            "zones": [
                _zone("counter", 36, 44, 240, 140, "RENTAL COUNTER"),
                _zone("lot", 300, 44, 304, 220, "LOT", 2),
                _zone("return", 36, 204, 240, 152, "RETURN", 3),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 200, "h": 18},
                {"kind": "car", "x": 324, "y": 70, "w": 120, "h": 50},
                {"kind": "car", "x": 460, "y": 70, "w": 120, "h": 50},
                {"kind": "car", "x": 324, "y": 140, "w": 120, "h": 50},
                {"kind": "car", "x": 460, "y": 140, "w": 120, "h": 50},
                {"kind": "pump", "x": 60, "y": 228, "w": 34, "h": 60, "n": 3},
            ],
        },
    },
    "retail": {
        "shopping": {
            "zones": [
                _zone("floor", 36, 44, 260, 260, "SHOP FLOOR"),
                _zone("fitting", 316, 44, 128, 140, "FITTING"),
                _zone("checkout", 464, 44, 140, 140, "CHECKOUT", 2),
                _zone("service", 316, 204, 288, 100, "SERVICE", 3),
            ],
            "props": [
                {"kind": "shelf", "x": 54, "y": 64, "w": 220, "h": 18, "n": 3},
                {"kind": "shelf", "x": 54, "y": 108, "w": 220, "h": 18, "n": 3},
                {"kind": "fitting", "x": 334, "y": 64, "w": 92, "h": 100, "n": 3},
                {"kind": "counter", "x": 482, "y": 64, "w": 104, "h": 18},
                {"kind": "desk", "x": 334, "y": 224, "w": 250, "h": 24},
            ],
        },
        "pharmacy": {
            "zones": [
                _zone("counter", 36, 44, 240, 120, "COUNTER"),
                _zone("rx", 296, 44, 308, 120, "PRESCRIPTIONS", 2),
                _zone("consult", 36, 184, 240, 172, "CONSULT", 3),
                _zone("shelves", 296, 184, 308, 172, "SHELVES", 2),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 208, "h": 18},
                {"kind": "desk", "x": 312, "y": 62, "w": 274, "h": 24},
                {"kind": "desk", "x": 52, "y": 204, "w": 208, "h": 24},
                {"kind": "shelf", "x": 312, "y": 204, "w": 274, "h": 18, "n": 4},
                {"kind": "shelf", "x": 312, "y": 248, "w": 274, "h": 18, "n": 4},
            ],
        },
        "connectivity": {
            "zones": [
                _zone("counter", 36, 44, 240, 120, "CARRIER"),
                _zone("plans", 296, 44, 308, 120, "PLANS", 2),
                _zone("setup", 36, 184, 240, 172, "SETUP", 3),
                _zone("seating", 296, 184, 308, 172, "SEATING", 2),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 208, "h": 18},
                {"kind": "phones", "x": 312, "y": 62, "w": 274, "h": 54},
                {"kind": "desk", "x": 52, "y": 204, "w": 208, "h": 24},
                {"kind": "seats", "x": 312, "y": 214, "w": 274, "h": 100,
                 "cols": 5, "rows": 2},
            ],
        },
        "money": {
            "zones": [
                _zone("atm", 36, 44, 180, 140, "ATM"),
                _zone("exchange", 236, 44, 180, 140, "EXCHANGE", 2),
                _zone("card", 436, 44, 168, 140, "CARDS", 3),
                _zone("bank", 36, 204, 568, 152, "BANK", 2),
            ],
            "props": [
                {"kind": "atm", "x": 56, "y": 70, "w": 60, "h": 86},
                {"kind": "counter", "x": 252, "y": 62, "w": 148, "h": 18},
                {"kind": "terminal", "x": 456, "y": 72, "w": 120, "h": 56},
                {"kind": "counter", "x": 54, "y": 224, "w": 520, "h": 20},
            ],
        },
    },
    "dining": {
        "restaurant": {
            "zones": [
                _zone("host", 36, 44, 150, 100, "HOST"),
                _zone("check", 206, 44, 130, 100, "CHECK", 3),
                _zone("tables", 36, 164, 300, 192, "DINING"),
                _zone("bar", 356, 44, 248, 120, "BAR", 2),
                _zone("kitchen", 356, 184, 248, 172, "KITCHEN", 3),
            ],
            "props": [
                {"kind": "desk", "x": 52, "y": 62, "w": 118, "h": 22},
                {"kind": "counter", "x": 222, "y": 62, "w": 98, "h": 18},
                {"kind": "table", "x": 84, "y": 206, "r": 28},
                {"kind": "table", "x": 190, "y": 206, "r": 28},
                {"kind": "table", "x": 84, "y": 296, "r": 28},
                {"kind": "table", "x": 190, "y": 296, "r": 28},
                {"kind": "bar", "x": 376, "y": 64, "w": 208, "h": 18},
                {"kind": "kitchen", "x": 376, "y": 204, "w": 208, "h": 40},
            ],
        },
        "cafe": {
            "zones": [
                _zone("counter", 36, 44, 260, 120, "ORDER"),
                _zone("pickup", 316, 44, 288, 120, "PICKUP", 2),
                _zone("seating", 36, 184, 380, 172, "SEATING"),
                _zone("condiments", 436, 184, 168, 172, "CONDIMENTS", 3),
            ],
            "props": [
                {"kind": "counter", "x": 52, "y": 62, "w": 228, "h": 18},
                {"kind": "shelf", "x": 332, "y": 62, "w": 256, "h": 18, "n": 3},
                {"kind": "table", "x": 84, "y": 222, "r": 26},
                {"kind": "table", "x": 190, "y": 222, "r": 26},
                {"kind": "table", "x": 84, "y": 310, "r": 26},
                {"kind": "table", "x": 190, "y": 310, "r": 26},
                {"kind": "desk", "x": 452, "y": 214, "w": 136, "h": 22},
            ],
        },
        "nightlife": {
            "zones": [
                _zone("bar", 36, 44, 240, 140, "BAR"),
                _zone("tables", 296, 44, 308, 180, "TABLES", 2),
                _zone("stage", 36, 204, 240, 152, "STAGE", 3),
                _zone("door", 296, 244, 308, 112, "DOOR", 2),
            ],
            "props": [
                {"kind": "bar", "x": 52, "y": 64, "w": 208, "h": 18},
                {"kind": "table", "x": 336, "y": 92, "r": 26},
                {"kind": "table", "x": 444, "y": 92, "r": 26},
                {"kind": "table", "x": 336, "y": 164, "r": 26},
                {"kind": "stage", "x": 56, "y": 224, "w": 200, "h": 54},
                {"kind": "door", "x": 540, "y": 264, "w": 44, "h": 70},
            ],
        },
    },
    "lobby": {
        "hotel": {
            "zones": [
                _zone("frontdesk", 36, 44, 240, 120, "FRONT DESK"),
                _zone("seating", 36, 184, 240, 172, "LOBBY"),
                _zone("elevator", 296, 44, 120, 120, "ELEVATOR", 2),
                _zone("corridor", 436, 44, 168, 312, "ROOMS", 3),
            ],
            "props": [
                {"kind": "desk", "x": 52, "y": 62, "w": 208, "h": 24},
                {"kind": "sofa", "x": 60, "y": 210, "w": 180, "h": 30},
                {"kind": "elevator", "x": 312, "y": 60, "w": 88, "h": 88},
                {"kind": "doors", "x": 452, "y": 64, "w": 136, "h": 272, "n": 4},
            ],
        },
        "small-talk": {
            "zones": [
                _zone("breakfast", 36, 44, 260, 140, "BREAKFAST"),
                _zone("seating", 36, 204, 260, 152, "SEATING"),
                _zone("corridor", 316, 44, 288, 180, "LOBBY", 2),
                _zone("elevator", 316, 244, 288, 112, "ELEVATOR", 3),
            ],
            "props": [
                {"kind": "buffet", "x": 56, "y": 64, "w": 220, "h": 40},
                {"kind": "table", "x": 84, "y": 236, "r": 26},
                {"kind": "table", "x": 180, "y": 236, "r": 26},
                {"kind": "sofa", "x": 336, "y": 64, "w": 248, "h": 30},
                {"kind": "elevator", "x": 500, "y": 264, "w": 84, "h": 72},
            ],
        },
    },
    "room": {
        "default": {
            "zones": [
                _zone("door", 36, 44, 140, 100, "ENTRY"),
                _zone("living", 196, 44, 260, 160, "LIVING"),
                _zone("bed", 476, 44, 128, 160, "BED", 2),
                _zone("kitchen", 36, 224, 300, 132, "KITCHEN", 3),
                _zone("bath", 356, 224, 248, 132, "BATH", 2),
            ],
            "props": [
                {"kind": "door", "x": 52, "y": 62, "w": 108, "h": 64},
                {"kind": "sofa", "x": 220, "y": 196, "w": 200, "h": 30},
                {"kind": "bed", "x": 492, "y": 64, "w": 96, "h": 120},
                {"kind": "kitchen", "x": 56, "y": 244, "w": 260, "h": 40},
                {"kind": "bath", "x": 376, "y": 244, "w": 208, "h": 40},
            ],
        },
    },
    "clinic": {
        "default": {
            "zones": [
                _zone("reception", 36, 44, 220, 110, "RECEPTION"),
                _zone("waiting", 36, 174, 220, 182, "WAITING"),
                _zone("exam", 276, 44, 180, 312, "EXAM"),
                _zone("insurance", 476, 44, 128, 140, "INSURANCE", 2),
                _zone("er", 476, 204, 128, 152, "ER", 3),
            ],
            "props": [
                {"kind": "desk", "x": 52, "y": 62, "w": 188, "h": 22},
                {"kind": "seats", "x": 56, "y": 196, "w": 180, "h": 140,
                 "cols": 3, "rows": 3},
                {"kind": "bed", "x": 300, "y": 180, "w": 132, "h": 96},
                {"kind": "desk", "x": 492, "y": 62, "w": 96, "h": 22},
                {"kind": "door", "x": 500, "y": 262, "w": 80, "h": 60},
            ],
        },
    },
    "office": {
        "police": {
            "zones": [
                _zone("desk", 36, 44, 240, 120, "FRONT DESK"),
                _zone("waiting", 36, 184, 240, 172, "WAITING"),
                _zone("records", 296, 44, 180, 140, "REPORTS", 2),
                _zone("lounge", 296, 204, 308, 152, "PHONE / LOUNGE", 3),
            ],
            "props": [
                {"kind": "desk", "x": 52, "y": 62, "w": 208, "h": 24},
                {"kind": "seats", "x": 56, "y": 206, "w": 200, "h": 120,
                 "cols": 4, "rows": 2},
                {"kind": "shelf", "x": 312, "y": 64, "w": 148, "h": 18, "n": 3},
                {"kind": "sofa", "x": 320, "y": 228, "w": 260, "h": 30},
            ],
        },
        "business": {
            "zones": [
                _zone("desk", 36, 44, 220, 120, "DESK"),
                _zone("meeting", 276, 44, 328, 180, "MEETING"),
                _zone("lounge", 36, 184, 220, 172, "LOUNGE", 2),
                _zone("waiting", 276, 244, 328, 112, "WAITING", 3),
            ],
            "props": [
                {"kind": "desk", "x": 52, "y": 62, "w": 188, "h": 24},
                {"kind": "table", "x": 440, "y": 134, "r": 46},
                {"kind": "sofa", "x": 56, "y": 210, "w": 180, "h": 30},
                {"kind": "seats", "x": 292, "y": 264, "w": 296, "h": 72,
                 "cols": 6, "rows": 1},
            ],
        },
    },
    "attraction": {
        "default": {
            "zones": [
                _zone("tickets", 36, 44, 200, 120, "TICKETS"),
                _zone("entrance", 256, 44, 180, 120, "ENTRANCE", 2),
                _zone("plaza", 36, 184, 400, 172, "PLAZA"),
                _zone("tour", 456, 44, 148, 312, "TOURS", 3),
            ],
            "props": [
                {"kind": "booth", "x": 52, "y": 64, "w": 168, "h": 44},
                {"kind": "gate", "x": 272, "y": 64, "w": 148, "h": 44},
                {"kind": "path", "x": 60, "y": 206, "w": 352, "h": 24},
                {"kind": "flag", "x": 492, "y": 72, "w": 80, "h": 80},
            ],
        },
    },
}


# ------------------------------------------------------------------ primitives
def _rect(kind, x, y, w, h, extra="", rx=4):
    return (f'<rect class="map-fixture map-{kind}" x="{x:.1f}" y="{y:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}" rx="{rx}"{extra}/>')


def _prop(p):
    kind = p["kind"]
    x, y = p["x"], p["y"]
    w, h = p.get("w", 0), p.get("h", 0)
    if kind == "counter":
        return (_rect("counter", x, y, w, h, rx=6)
                + _rect("counter-top", x + 6, y + 6, w - 12, h - 12, rx=2))
    if kind == "desk":
        return (_rect("counter", x, y, w, h, rx=6)
                + f'<circle class="map-fixture" cx="{x + w * .18:.1f}" '
                  f'cy="{y + h / 2:.1f}" r="{max(4, h * .22):.1f}"/>')
    if kind == "lane":
        n = p.get("n", 2)
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(n):
            yy = y + (i + 1) * h / (n + 1)
            out.append(f'<path class="map-route" d="M{x:.1f} {yy:.1f} L{x + w:.1f} {yy:.1f}"/>')
        return "".join(out)
    if kind == "seats":
        cols, rows = p.get("cols", 4), p.get("rows", 3)
        gap = 8
        cw = (w - gap * (cols - 1)) / cols
        ch = (h - gap * (rows - 1)) / rows
        out = []
        for r in range(rows):
            for c in range(cols):
                out.append(_rect("seat", x + c * (cw + gap), y + r * (ch + gap),
                                 cw, ch, rx=4))
        return "".join(out)
    if kind == "table":
        r = p.get("r", 24)
        cx, cy = x, y
        return (f'<circle class="map-fixture map-table" cx="{cx}" cy="{cy}" r="{r}"/>'
                f'<circle class="map-fixture map-seat" cx="{cx - r - 7}" cy="{cy}" r="7"/>'
                f'<circle class="map-fixture map-seat" cx="{cx + r + 7}" cy="{cy}" r="7"/>')
    if kind == "shelf":
        n = p.get("n", 3)
        out = [_rect("shelf", x, y, w, h, rx=2)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(f'<path class="map-fixture-line" d="M{xx:.1f} {y:.1f} L{xx:.1f} {y + h:.1f}"/>')
        return "".join(out)
    if kind == "carousel":
        return (_rect("fixture-soft", x, y, w, h, rx=18)
                + f'<ellipse class="map-fixture map-belt" cx="{x + w / 2}" '
                  f'cy="{y + h / 2}" rx="{w * .38:.1f}" ry="{h * .28:.1f}"/>')
    if kind == "door":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + f'<path class="map-fixture-line" d="M{x:.1f} {y + h:.1f} '
                  f'Q{x + w:.1f} {y + h:.1f} {x + w:.1f} {y:.1f}"/>')
    if kind == "stairs":
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(1, 5):
            yy = y + i * h / 5
            out.append(f'<path class="map-fixture-line" d="M{x + 4:.1f} {yy:.1f} '
                       f'L{x + w - 4:.1f} {yy:.1f}"/>')
        return "".join(out)
    if kind == "car":
        return (_rect("car", x, y, w, h, rx=12)
                + _rect("car-window", x + w * .18, y + h * .2, w * .22, h * .6, rx=4)
                + _rect("car-window", x + w * .48, y + h * .2, w * .22, h * .6, rx=4))
    if kind == "train":
        return (_rect("train", x, y, w, h, rx=10)
                + _rect("train-window", x + 12, y + h * .22, w - 24, h * .22, rx=3))
    if kind == "pump":
        n = p.get("n", 2)
        out = []
        for i in range(n):
            out.append(_rect("pump", x + i * (w + 18), y, w, h, rx=5))
        return "".join(out)
    if kind == "parking":
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(5):
            xx = x + i * w / 5
            out.append(f'<path class="map-fixture-line" d="M{xx:.1f} {y:.1f} L{xx:.1f} {y + h:.1f}"/>')
        return "".join(out)
    if kind == "toll":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2))
    if kind == "street":
        return _rect("fixture-soft", x, y, w, h, rx=2)
    if kind == "store":
        n = p.get("n", 3)
        out = [_rect("fixture-soft", x, y, w, h, rx=4)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(f'<path class="map-fixture-line" d="M{xx:.1f} {y:.1f} L{xx:.1f} {y + h:.1f}"/>')
        return "".join(out)
    if kind == "mapboard":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2))
    if kind == "person":
        return (f'<circle class="map-fixture map-person" cx="{x + w / 2}" '
                f'cy="{y + h * .3}" r="{w * .28}"/>'
                + f'<path class="map-fixture-line" d="M{x + w / 2} {y + h * .58} '
                  f'L{x + w / 2} {y + h}"/>')
    if kind == "machine":
        n = p.get("n", 2)
        return "".join(_rect("counter", x + i * (w + 18), y, w, h, rx=4)
                       for i in range(n))
    if kind == "gates":
        n = p.get("n", 3)
        out = []
        for i in range(n):
            xx = x + i * (w + 10)
            out.append(_rect("fixture-soft", xx, y, w, h, rx=3))
            out.append(f'<path class="map-fixture-line" d="M{xx + w / 2} {y:.1f} '
                       f'L{xx + w / 2} {y + h:.1f}"/>')
        return "".join(out)
    if kind == "platform":
        return _rect("fixture-soft", x, y, w, h, rx=2)
    if kind == "curb":
        return _rect("fixture-soft", x, y, w, h, rx=2)
    if kind == "pin":
        return (f'<path class="map-fixture map-pin" d="M{x + w / 2} {y + h} '
                f'C{x + w / 2} {y + h * .55} {x + w * .18} {y + h * .5} '
                f'{x + w * .18} {y + h * .28} A{w * .32} {h * .28} 0 1 1 '
                f'{x + w * .82} {y + h * .28} C{x + w * .82} {y + h * .5} '
                f'{x + w / 2} {y + h * .55} {x + w / 2} {y + h}Z"/>')
    if kind == "bar":
        return _rect("counter", x, y, w, h, rx=6)
    if kind == "kitchen":
        return (_rect("fixture-soft", x, y, w, h, rx=3)
                + _rect("counter", x + 12, y + 8, w - 24, h - 16, rx=3))
    if kind == "fitting":
        n = p.get("n", 3)
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(f'<path class="map-fixture-line" d="M{xx:.1f} {y:.1f} '
                       f'L{xx:.1f} {y + h:.1f}"/>')
        return "".join(out)
    if kind == "phones":
        out = []
        for i in range(4):
            out.append(_rect("counter", x + i * 66, y, 46, 54, rx=5))
        return "".join(out)
    if kind == "atm":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 28, rx=2))
    if kind == "terminal":
        return (_rect("counter", x, y, w, h, rx=6)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2))
    if kind == "sofa":
        return (_rect("sofa", x, y, w, h, rx=10)
                + _rect("sofa-seat", x + 8, y + 6, w - 16, h - 12, rx=6))
    if kind == "elevator":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + f'<path class="map-fixture-line" d="M{x + w / 2:.1f} {y:.1f} '
                  f'L{x + w / 2:.1f} {y + h:.1f}"/>')
    if kind == "doors":
        n = p.get("n", 4)
        out = []
        for i in range(n):
            out.append(_rect("fixture-soft", x, y + i * h / n, w, h / n - 8, rx=3))
        return "".join(out)
    if kind == "buffet":
        return (_rect("counter", x, y, w, h, rx=6)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2))
    if kind == "bed":
        return (_rect("bed", x, y, w, h, rx=8)
                + _rect("pillow", x + 10, y + 12, w - 20, h * .22, rx=6))
    if kind == "bath":
        return (_rect("fixture-soft", x, y, w, h, rx=3)
                + f'<ellipse class="map-fixture" cx="{x + w / 2}" cy="{y + h / 2}" '
                  f'rx="{w * .3:.1f}" ry="{h * .3:.1f}"/>')
    if kind == "booth":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2))
    if kind == "gate":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + f'<path class="map-fixture-line" d="M{x + w / 2:.1f} {y:.1f} '
                  f'L{x + w / 2:.1f} {y + h:.1f}"/>')
    if kind == "path":
        return _rect("fixture-soft", x, y, w, h, rx=10)
    if kind == "flag":
        return (f'<path class="map-fixture-line" d="M{x + 12} {y + h} L{x + 12} {y}"/>'
                + f'<path class="map-fixture map-flag" d="M{x + 12} {y} L{x + w} {y + 18} '
                  f'L{x + 12} {y + 36}Z"/>')
    if kind == "console":
        return (_rect("fixture-soft", x, y, w, h, rx=6)
                + _rect("counter", x + 10, y + 10, w - 20, h - 20, rx=3))
    if kind == "cart":
        return (_rect("counter", x, y, w, h, rx=6)
                + f'<circle class="map-fixture" cx="{x + 12}" cy="{y + h}" r="6"/>'
                + f'<circle class="map-fixture" cx="{x + w - 12}" cy="{y + h}" r="6"/>')
    return ""


def _zone_svg(z):
    x, y, w, h = z["x"], z["y"], z["w"], z["h"]
    label = html.escape(z["label"])
    return (
        f'<g class="map-zone" data-zone="{html.escape(z["id"], quote=True)}">'
        f'<rect class="map-zone-shape" x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/>'
        f'<text class="map-zone-label" x="{x + 10}" y="{y + h - 8}">{label}</text>'
        f'</g>'
    )


def render_map(scene) -> dict:
    """Return {"svg": str, "hotspots": [...], "zones": {id: rect}} for a scene."""
    spec = scene.get("map") or {}
    archetype = spec.get("archetype")
    if archetype not in ARCHETYPES:
        raise ValueError(f"{scene.get('id')}: unknown map archetype {archetype!r}")
    variants = ARCHETYPES[archetype]
    variant = spec.get("variant") or "default"
    if variant not in variants:
        raise ValueError(f"{scene.get('id')}: unknown {archetype} variant {variant!r}")
    layout = variants[variant]
    zones = {z["id"]: z for z in layout["zones"]}

    svg = [
        f'<svg class="map-svg" viewBox="0 0 {VIEW_W} {VIEW_H}" '
        'aria-hidden="true" focusable="false">',
        f'<rect class="map-plate" x="8" y="8" width="{VIEW_W - 16}" '
        f'height="{VIEW_H - 16}" rx="18"/>',
    ]
    svg.extend(_zone_svg(z) for z in layout["zones"])
    svg.extend(_prop(p) for p in layout["props"])
    svg.append("</svg>")

    hotspots = []
    for spot in spec.get("hotspots", []):
        zone = zones.get(spot.get("zone"))
        if zone is None:
            raise ValueError(
                f"{scene.get('id')}: hotspot {spot.get('id')!r} uses unknown zone "
                f"{spot.get('zone')!r}")
        x = spot.get("x", zone["x"] + zone["w"] / 2 + spot.get("dx", 0))
        y = spot.get("y", zone["y"] + zone["h"] / 2 + spot.get("dy", 0))
        hotspots.append({
            "id": spot["id"],
            "encounter": spot["encounter"],
            "zone": spot["zone"],
            "short_en": spot.get("short_en", ""),
            "short_zh": spot.get("short_zh", ""),
            "left": round(x / VIEW_W * 100, 2),
            "top": round(y / VIEW_H * 100, 2),
            "x": x,
            "y": y,
        })

    return {"svg": "".join(svg), "hotspots": hotspots, "zones": zones}


def archetype_zones(archetype: str, variant: str) -> dict:
    """Zone ids for validation."""
    try:
        return {z["id"]: z for z in ARCHETYPES[archetype][variant]["zones"]}
    except KeyError as error:
        raise ValueError(f"unknown map {archetype}/{variant}") from error
