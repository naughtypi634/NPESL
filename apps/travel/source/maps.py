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
                {"kind": "queue", "x": 60, "y": 106, "w": 180, "h": 30},
                {"kind": "counter", "x": 308, "y": 62, "w": 118, "h": 16},
                {"kind": "desk", "x": 486, "y": 64, "w": 94, "h": 24},
                {"kind": "lane", "x": 56, "y": 196, "w": 180, "h": 66, "n": 2},
                {"kind": "scan", "x": 74, "y": 202, "w": 40, "h": 46},
                {"kind": "scan", "x": 146, "y": 202, "w": 40, "h": 46},
                {"kind": "seats", "x": 300, "y": 208, "w": 200, "h": 92,
                 "cols": 5, "rows": 3},
                {"kind": "jetbridge", "x": 556, "y": 196, "w": 40, "h": 76},
                {"kind": "wc", "x": 512, "y": 248, "w": 46, "h": 40},
                {"kind": "plant", "x": 470, "y": 318, "w": 26, "h": 26},
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
                {"kind": "plant", "x": 36, "y": 316, "w": 26, "h": 26},
                {"kind": "wc", "x": 548, "y": 244, "w": 46, "h": 40},
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


def _line(x1, y1, x2, y2, cls="map-fixture-line", extra=""):
    return (f'<path class="{cls}" d="M{x1:.1f} {y1:.1f} '
            f'L{x2:.1f} {y2:.1f}"{extra}/>')


def _circle(cx, cy, r, cls="map-fixture"):
    return f'<circle class="{cls}" cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}"/>'


def _prop(p):
    kind = p["kind"]
    x, y = p["x"], p["y"]
    w, h = p.get("w", 0), p.get("h", 0)

    if kind == "counter":
        out = [_rect("counter", x, y, w, h, rx=6),
               _rect("counter-top", x + 6, y + 6, w - 12, h - 12, rx=2)]
        n = max(1, int(w // 46))
        for i in range(1, n):
            xx = x + i * w / n
            out.append(_line(xx, y + 3, xx, y + h - 3))
        return "".join(out)

    if kind == "desk":
        out = [_rect("counter", x, y, w, h, rx=6),
               _circle(x + w * .18, y + h / 2, max(4, h * .22)),
               _rect("counter-top", x + 6, y + 5, w - 12, h - 10, rx=2)]
        out.append(_line(x + w * .55, y + h * .3, x + w * .82, y + h * .3))
        return "".join(out)

    if kind == "lane":
        n = p.get("n", 2)
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(n):
            yy = y + (i + 1) * h / (n + 1)
            out.append(_line(x + 8, yy, x + w - 8, yy, "map-route"))
        return "".join(out)

    if kind == "seats":
        cols, rows = p.get("cols", 4), p.get("rows", 3)
        gap = 8
        cw = (w - gap * (cols - 1)) / cols
        ch = (h - gap * (rows - 1)) / rows
        out = []
        for r in range(rows):
            for c in range(cols):
                sx = x + c * (cw + gap)
                sy = y + r * (ch + gap)
                out.append(_rect("seat", sx, sy, cw, ch, rx=4))
                out.append(_line(sx + 3, sy + 3, sx + cw - 3, sy + 3,
                                 "map-seat-back"))
        return "".join(out)

    if kind == "table":
        r = p.get("r", 24)
        cx, cy = x, y
        out = [_circle(cx, cy, r, "map-fixture map-table")]
        for dx, dy in ((-r - 8, 0), (r + 8, 0), (0, -r - 8), (0, r + 8)):
            out.append(_circle(cx + dx, cy + dy, 7, "map-fixture map-seat"))
        return "".join(out)

    if kind == "shelf":
        n = p.get("n", 3)
        out = [_rect("shelf", x, y, w, h, rx=2)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(_line(xx, y, xx, y + h))
        for i in range(1, n):
            xx = x + i * w / n
            out.append(_line(xx + 3, y + h * .35, xx + 3, y + h * .65,
                             "map-stock"))
        return "".join(out)

    if kind == "carousel":
        out = [_rect("fixture-soft", x, y, w, h, rx=18),
               f'<ellipse class="map-fixture map-belt" cx="{x + w / 2:.1f}" '
               f'cy="{y + h / 2:.1f}" rx="{w * .38:.1f}" '
               f'ry="{h * .28:.1f}"/>']
        for i in range(1, 8):
            xx = x + 10 + i * (w - 20) / 8
            out.append(_line(xx, y + 8, xx, y + h - 8, "map-belt-slat"))
        return "".join(out)

    if kind == "door":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + f'<path class="map-fixture-line" d="M{x:.1f} {y + h:.1f} '
                  f'Q{x + w:.1f} {y + h:.1f} {x + w:.1f} {y:.1f}"/>'
                + _line(x, y + h, x + 4, y + h, "map-door-leaf"))

    if kind == "stairs":
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(1, 5):
            yy = y + i * h / 5
            out.append(_line(x + 4, yy, x + w - 4, yy))
        out.append(_line(x + w * .5, y + h - 6, x + w * .5, y + 6,
                         "map-arrow"))
        out.append(f'<path class="map-arrow" d="M{x + w * .5:.1f} {y + 6:.1f} '
                   f'l-4 7 l8 0 z"/>')
        return "".join(out)

    if kind == "car":
        out = [_rect("car", x, y, w, h, rx=12),
               _rect("car-window", x + w * .18, y + h * .2, w * .22, h * .6, rx=4),
               _rect("car-window", x + w * .48, y + h * .2, w * .22, h * .6, rx=4)]
        out.append(_circle(x + w * .1, y + 4, 3, "map-fixture map-headlight"))
        out.append(_circle(x + w * .1, y + h - 4, 3, "map-fixture map-headlight"))
        return "".join(out)

    if kind == "train":
        out = [_rect("train", x, y, w, h, rx=10),
               _rect("train-window", x + 12, y + h * .22, w - 24, h * .22, rx=3)]
        for i in range(1, 5):
            xx = x + i * w / 5
            out.append(_line(xx, y + 3, xx, y + h - 3, "map-train-door"))
        return "".join(out)

    if kind == "pump":
        n = p.get("n", 2)
        out = []
        for i in range(n):
            px = x + i * (w + 18)
            out.append(_rect("pump", px, y, w, h, rx=5))
            out.append(_rect("counter-top", px + 5, y + 6,
                             w - 10, h * .28, rx=2))
            out.append(_line(px + w, y + 6, px + w + 8, y + h * .5,
                             "map-fixture-line"))
        return "".join(out)

    if kind == "parking":
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(5):
            xx = x + i * w / 5
            out.append(_line(xx, y, xx, y + h))
        return "".join(out)

    if kind == "toll":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2)
                + _line(x + w * .5, y + 2, x + w * .5, y + h - 2,
                        "map-fixture-line"))

    if kind == "street":
        out = [_rect("fixture-soft", x, y, w, h, rx=2)]
        for i in range(1, 7):
            xx = x + i * w / 7
            out.append(_line(xx - 8, y + h / 2, xx, y + h / 2,
                             "map-street-dash"))
        return "".join(out)

    if kind == "store":
        n = p.get("n", 3)
        out = [_rect("fixture-soft", x, y, w, h, rx=4)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(_line(xx, y, xx, y + h))
        out.append(_line(x, y + 5, x + w, y + 5, "map-awning"))
        return "".join(out)

    if kind == "mapboard":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2)
                + _line(x + 12, y + h * .5, x + w - 12, y + h * .5,
                        "map-fixture-line"))

    if kind == "person":
        return (_circle(x + w / 2, y + h * .3, w * .28,
                        "map-fixture map-person")
                + _line(x + w / 2, y + h * .58, x + w / 2, y + h,
                        "map-fixture-line")
                + _line(x + w * .3, y + h * .72, x + w * .7, y + h * .72,
                        "map-fixture-line"))

    if kind == "machine":
        n = p.get("n", 2)
        out = []
        for i in range(n):
            mx = x + i * (w + 18)
            out.append(_rect("counter", mx, y, w, h, rx=4))
            out.append(_rect("counter-top", mx + 4, y + 5, w - 8, h * .3, rx=2))
            out.append(_line(mx + 6, y + h * .6, mx + w - 6, y + h * .6,
                             "map-fixture-line"))
        return "".join(out)

    if kind == "gates":
        n = p.get("n", 3)
        out = []
        for i in range(n):
            gx = x + i * (w + 10)
            out.append(_rect("fixture-soft", gx, y, w, h, rx=3))
            out.append(_line(gx + w / 2, y, gx + w / 2, y + h))
            out.append(f'<path class="map-arrow" d="M{gx + 4:.1f} '
                       f'{y + h / 2:.1f} l6 -4 l0 8 z"/>')
        return "".join(out)

    if kind == "platform":
        return (_rect("fixture-soft", x, y, w, h, rx=2)
                + _line(x, y + h - 3, x + w, y + h - 3, "map-tactile"))

    if kind == "curb":
        return (_rect("fixture-soft", x, y, w, h, rx=2)
                + _line(x, y + h / 2, x + w, y + h / 2, "map-street-dash"))

    if kind == "pin":
        return (f'<path class="map-fixture map-pin" d="M{x + w / 2} {y + h} '
                f'C{x + w / 2} {y + h * .55} {x + w * .18} {y + h * .5} '
                f'{x + w * .18} {y + h * .28} A{w * .32} {h * .28} 0 1 1 '
                f'{x + w * .82} {y + h * .28} C{x + w * .82} {y + h * .5} '
                f'{x + w / 2} {y + h * .55} {x + w / 2} {y + h}Z"/>')

    if kind == "bar":
        out = [_rect("counter", x, y, w, h, rx=6)]
        for i in range(1, 6):
            out.append(_circle(x + i * w / 6, y + h + 10, 6,
                               "map-fixture map-stool"))
        return "".join(out)

    if kind == "kitchen":
        out = [_rect("fixture-soft", x, y, w, h, rx=3),
               _rect("counter", x + 12, y + 8, w - 24, h - 16, rx=3)]
        for i in range(3):
            out.append(_circle(x + 30 + i * 24, y + h / 2, 6,
                               "map-fixture map-burner"))
        return "".join(out)

    if kind == "fitting":
        n = p.get("n", 3)
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(1, n):
            xx = x + i * w / n
            out.append(_line(xx, y, xx, y + h))
        for i in range(n):
            xx = x + i * w / n + w / n * .5
            out.append(_line(xx, y + h - 8, xx, y + h - 2, "map-curtain"))
        return "".join(out)

    if kind == "phones":
        out = []
        for i in range(4):
            px = x + i * 66
            out.append(_rect("counter", px, y, 46, 54, rx=5))
            out.append(_rect("counter-top", px + 5, y + 6, 36, 22, rx=2))
            out.append(_line(px + 8, y + 40, px + 38, y + 40,
                             "map-fixture-line"))
        return "".join(out)

    if kind == "atm":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 28, rx=2)
                + _line(x + 12, y + h - 12, x + w - 12, y + h - 12,
                        "map-fixture-line"))

    if kind == "terminal":
        return (_rect("counter", x, y, w, h, rx=6)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2)
                + _circle(x + w * .5, y + h * .5, min(w, h) * .16,
                          "map-fixture map-screen"))

    if kind == "sofa":
        out = [_rect("sofa", x, y, w, h, rx=10),
               _rect("sofa-seat", x + 8, y + 6, w - 16, h - 12, rx=6)]
        if w > 80:
            out.append(_line(x + w / 2, y + 8, x + w / 2, y + h - 8,
                             "map-sofa-seam"))
        return "".join(out)

    if kind == "elevator":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + _line(x + w / 2, y + 5, x + w / 2, y + h - 5)
                + f'<path class="map-arrow" d="M{x + w / 2 - 4:.1f} '
                  f'{y + h * .35:.1f} l4 -5 l4 5 z"/>')

    if kind == "doors":
        n = p.get("n", 4)
        out = []
        for i in range(n):
            dy = y + i * h / n
            out.append(_rect("fixture-soft", x, dy, w, h / n - 8, rx=3))
            out.append(_line(x + w - 5, dy + 5, x + w - 5, dy + h / n - 13,
                             "map-fixture-line"))
        return "".join(out)

    if kind == "buffet":
        out = [_rect("counter", x, y, w, h, rx=6),
               _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2)]
        for i in range(4):
            out.append(_circle(x + 24 + i * (w - 48) / 3, y + h / 2, 7,
                               "map-fixture map-bowl"))
        return "".join(out)

    if kind == "bed":
        out = [_rect("bed", x, y, w, h, rx=8),
               _rect("pillow", x + 10, y + 12, w - 20, h * .22, rx=6)]
        out.append(_line(x + 8, y + h * .55, x + w - 8, y + h * .55,
                         "map-blanket"))
        return "".join(out)

    if kind == "bath":
        return (_rect("fixture-soft", x, y, w, h, rx=3)
                + f'<ellipse class="map-fixture" cx="{x + w / 2:.1f}" '
                  f'cy="{y + h / 2:.1f}" rx="{w * .3:.1f}" '
                  f'ry="{h * .3:.1f}"/>'
                + _line(x + w * .8, y + 4, x + w * .8, y + h * .3,
                        "map-fixture-line"))

    if kind == "booth":
        return (_rect("counter", x, y, w, h, rx=4)
                + _rect("counter-top", x + 8, y + 8, w - 16, h - 16, rx=2)
                + _circle(x + w * .5, y + h * .5, 5, "map-fixture map-screen"))

    if kind == "gate":
        return (_rect("fixture-soft", x, y, w, h, rx=4)
                + _line(x + w / 2, y, x + w / 2, y + h)
                + f'<path class="map-arrow" d="M{x + 6:.1f} {y + h / 2:.1f} '
                  f'l7 -4 l0 8 z"/>')

    if kind == "path":
        return (_rect("fixture-soft", x, y, w, h, rx=10)
                + _line(x + 10, y + h / 2, x + w - 10, y + h / 2,
                        "map-street-dash"))

    if kind == "flag":
        return (_line(x + 12, y + h, x + 12, y, "map-fixture-line")
                + f'<path class="map-fixture map-flag" d="M{x + 12:.1f} '
                  f'{y:.1f} L{x + w:.1f} {y + 18:.1f} '
                  f'L{x + 12:.1f} {y + 36:.1f}Z"/>')

    if kind == "console":
        return (_rect("fixture-soft", x, y, w, h, rx=6)
                + _rect("counter", x + 10, y + 10, w - 20, h - 20, rx=3))

    if kind == "cart":
        return (_rect("counter", x, y, w, h, rx=6)
                + _circle(x + 12, y + h, 6, "map-fixture map-wheel")
                + _circle(x + w - 12, y + h, 6, "map-fixture map-wheel"))

    if kind == "queue":
        out = []
        for i in range(3):
            xx = x + i * 10
            out.append(_line(xx, y, xx, y + h, "map-queue-line"))
        return "".join(out)

    if kind == "scan":
        return (_rect("counter", x, y, w, h * .5, rx=4)
                + _line(x + w * .5, y, x + w * .5, y + h * .5,
                        "map-fixture-line")
                + _circle(x + w * .5, y + h * .25, min(w, h) * .12,
                          "map-fixture map-screen")
                + _rect("fixture-soft", x + w * .2, y + h * .55,
                        w * .6, h * .28, rx=3))

    if kind == "jetbridge":
        return (_rect("fixture-soft", x, y, w, h, rx=6)
                + _line(x, y + 4, x + w, y + 4, "map-window")
                + _line(x, y + h - 4, x + w, y + h - 4, "map-window"))

    if kind == "wc":
        return (_rect("fixture-soft", x, y, w, h, rx=3)
                + f'<text class="map-wc" x="{x + w / 2:.1f}" '
                  f'y="{y + h / 2 + 4:.1f}" text-anchor="middle">WC</text>')

    if kind == "plant":
        out = [_circle(x + w / 2, y + h / 2, w * .38,
                       "map-fixture map-plant")]
        for dx, dy in ((-.2, -.2), (.2, -.2), (-.2, .2), (.2, .2)):
            out.append(_circle(x + w / 2 + dx * w, y + h / 2 + dy * h,
                               w * .16, "map-fixture map-leaf"))
        return "".join(out)

    if kind == "escalator":
        out = [_rect("fixture-soft", x, y, w, h, rx=3)]
        for i in range(1, 5):
            xx = x + i * w / 5
            out.append(_line(xx, y + h * .25, xx, y + h * .75,
                             "map-fixture-line"))
        out.append(_line(x + 4, y + h * .5, x + w - 4, y + h * .5,
                         "map-arrow"))
        return "".join(out)

    return ""


# ------------------------------------------------------------------ 3D helpers
ISO_A = 0.8660254037844386
WALL_H = 26
SLAB_DEPTH = 14

# Small wayfinding/furnishing details that make a plan read as a real place.
# Kept separate from the zone data so hotspot placement stays simple.
DECOR = {
    ("lobby", "hotel"): [
        {"kind": "plant", "x": 250, "y": 320, "w": 26, "h": 26},
        {"kind": "wc", "x": 300, "y": 150, "w": 36, "h": 14},
    ],
    ("dining", "restaurant"): [
        {"kind": "plant", "x": 300, "y": 320, "w": 26, "h": 26},
        {"kind": "wc", "x": 540, "y": 110, "w": 50, "h": 30},
    ],
    ("dining", "cafe"): [
        {"kind": "plant", "x": 300, "y": 330, "w": 24, "h": 24},
        {"kind": "wc", "x": 560, "y": 300, "w": 40, "h": 30},
    ],
    ("station", "subway"): [
        {"kind": "plant", "x": 450, "y": 280, "w": 24, "h": 24},
        {"kind": "wc", "x": 540, "y": 270, "w": 40, "h": 30},
    ],
    ("retail", "shopping"): [
        {"kind": "plant", "x": 330, "y": 280, "w": 24, "h": 24},
        {"kind": "wc", "x": 560, "y": 260, "w": 40, "h": 30},
    ],
    ("clinic", "default"): [
        {"kind": "plant", "x": 420, "y": 330, "w": 24, "h": 24},
        {"kind": "wc", "x": 420, "y": 60, "w": 36, "h": 28},
    ],
    ("attraction", "default"): [
        {"kind": "plant", "x": 400, "y": 320, "w": 24, "h": 24},
        {"kind": "wc", "x": 390, "y": 120, "w": 36, "h": 28},
    ],
}


def _iso(x, y, z=0):
    return ((x - y) * ISO_A, (x + y) * 0.5 - z)


class _Projector:
    def __init__(self):
        corners = [(0, 0), (VIEW_W, 0), (VIEW_W, VIEW_H), (0, VIEW_H)]
        points = []
        for x, y in corners:
            for z in (0, WALL_H):
                points.append(_iso(x, y, z))
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        self.scale = min((VIEW_W - 36) / (max(xs) - min(xs)),
                         (VIEW_H - 36) / (max(ys) - min(ys)))
        self.tx = ((VIEW_W - (max(xs) - min(xs)) * self.scale) / 2
                   - min(xs) * self.scale)
        self.ty = ((VIEW_H - (max(ys) - min(ys)) * self.scale) / 2
                   - min(ys) * self.scale)

    def __call__(self, x, y, z=0):
        sx, sy = _iso(x, y, z)
        return (sx * self.scale + self.tx, sy * self.scale + self.ty)


def _poly(pr, points, cls):
    coords = " ".join(f"{pr(x, y, z)[0]:.1f},{pr(x, y, z)[1]:.1f}"
                      for x, y, z in points)
    return f'<polygon class="{cls}" points="{coords}"/>'


def _b(x, y, w, h, z=0, hgt=12, tone=1):
    return {"x": x, "y": y, "w": w, "h": h, "z": z, "hgt": hgt, "tone": tone}


def _prop_boxes(p):
    kind = p["kind"]
    x, y = p["x"], p["y"]
    w, h = p.get("w", 0), p.get("h", 0)

    if kind == "seats":
        cols, rows = p.get("cols", 4), p.get("rows", 3)
        gap = 8
        cw = (w - gap * (cols - 1)) / cols
        ch = (h - gap * (rows - 1)) / rows
        return [_b(x + c * (cw + gap), y + r * (ch + gap), cw, ch,
                   0, 7, 2)
                for r in range(rows) for c in range(cols)]

    if kind == "table":
        r = p.get("r", 24)
        cx, cy = x, y
        boxes = [_b(cx - r * .55, cy - r * .55, r * 1.1, r * 1.1, 0, 10, 2)]
        for dx, dy in ((-r - 7, 0), (r + 7, 0), (0, -r - 7), (0, r + 7)):
            boxes.append(_b(cx + dx - 7, cy + dy - 7, 14, 14, 0, 7))
        return boxes

    if kind == "car":
        return [_b(x, y, w, h, 0, 10, 2),
                _b(x + w * .24, y + h * .18, w * .48, h * .64, 10, 7, 1)]

    if kind in ("train", "elevator", "fitting"):
        height = {"train": 22, "elevator": 26, "fitting": 22}[kind]
        return [_b(x, y, w, h, 0, height, 2)]

    if kind == "stairs":
        boxes = []
        for i in range(4):
            boxes.append(_b(x, y + i * h / 4, w, h / 4, 0,
                            5 + i * 4, 1 + i % 2))
        return boxes

    if kind == "pump":
        n = p.get("n", 2)
        return [_b(x + i * (w + 18), y, w, h, 0, 18, 2) for i in range(n)]

    if kind == "machine":
        n = p.get("n", 2)
        return [_b(x + i * (w + 18), y, w, h, 0, 16, 2) for i in range(n)]

    if kind == "gates":
        n = p.get("n", 3)
        return [_b(x + i * (w + 10), y, w, h, 0, 14, 2) for i in range(n)]

    if kind == "doors":
        n = p.get("n", 4)
        return [_b(x, y + i * h / n, w, h / n - 8, 0, 24, 2)
                for i in range(n)]

    if kind == "phones":
        return [_b(x + i * 66, y, 46, 54, 0, 14, 2) for i in range(4)]

    if kind in ("parking", "street", "platform", "curb", "path"):
        return [_b(x, y, w, h, 0, 1, 1)]

    if kind in ("door", "flag", "pin"):
        return []

    if kind == "lane":
        return [_b(x, y, w, h, 0, 1, 1),
                _b(x, y, 3, h, 0, 6, 2),
                _b(x + w - 3, y, 3, h, 0, 6, 2)]

    if kind == "person":
        return [_b(x + w * .25, y + h * .2, w * .5, h * .6, 0, 18, 3)]

    if kind == "queue":
        return [_b(x + i * 10, y, 2, h, 0, 6, 2) for i in range(3)]

    if kind == "scan":
        return [_b(x, y, w, h * .5, 0, 14, 2),
                _b(x + w * .2, y + h * .55, w * .6, h * .28, 0, 5, 1)]

    if kind == "jetbridge":
        return [_b(x, y, w, h, 0, 9, 1)]

    if kind == "plant":
        return [_b(x + w * .15, y + h * .15, w * .7, h * .7, 0, 14, 3)]

    if kind == "wc":
        return [_b(x, y, w, h, 0, 24, 2)]

    if kind == "carousel":
        return [_b(x, y, w, h, 0, 8, 2)]

    if kind == "bed":
        return [_b(x, y, w, h, 0, 9, 2)]

    if kind == "sofa":
        return [_b(x, y, w, h, 0, 8, 2)]

    if kind == "bath":
        return [_b(x, y, w, h, 0, 4, 1)]

    height = {
        "counter": 13, "desk": 13, "toll": 13, "shelf": 20,
        "bar": 14, "kitchen": 12, "buffet": 12, "console": 10,
        "cart": 12, "mapboard": 16, "store": 18, "terminal": 14,
        "atm": 18, "booth": 14, "gate": 14, "escalator": 6,
    }.get(kind, 12)
    return [_b(x, y, w, h, 0, height, 1)]


def _box3d(pr, b):
    x, y, w, h = b["x"], b["y"], b["w"], b["h"]
    z0, z1 = b["z"], b["z"] + b["hgt"]
    tone = b.get("tone", 1)
    top = [(x, y, z1), (x + w, y, z1), (x + w, y + h, z1), (x, y + h, z1)]
    out = [_poly(pr, top, f"map-3d-top tone-{tone}")]
    if z1 - z0 > 1:
        east = [(x + w, y, z1), (x + w, y + h, z1),
                (x + w, y + h, z0), (x + w, y, z0)]
        south = [(x, y + h, z1), (x + w, y + h, z1),
                 (x + w, y + h, z0), (x, y + h, z0)]
        out.append(_poly(pr, east, "map-3d-side"))
        out.append(_poly(pr, south, "map-3d-side-2"))
    return "".join(out)


def _slab3d(pr):
    top = [(0, 0, 0), (VIEW_W, 0, 0), (VIEW_W, VIEW_H, 0), (0, VIEW_H, 0)]
    east = [(VIEW_W, 0, 0), (VIEW_W, VIEW_H, 0),
            (VIEW_W, VIEW_H, -SLAB_DEPTH), (VIEW_W, 0, -SLAB_DEPTH)]
    south = [(0, VIEW_H, 0), (VIEW_W, VIEW_H, 0),
             (VIEW_W, VIEW_H, -SLAB_DEPTH), (0, VIEW_H, -SLAB_DEPTH)]
    return (_poly(pr, east, "map-3d-slab-side")
            + _poly(pr, south, "map-3d-slab-side")
            + _poly(pr, top, "map-3d-slab"))


def _floor3d(pr, z):
    x, y, w, h = z["x"], z["y"], z["w"], z["h"]
    points = [(x, y, .4), (x + w, y, .4), (x + w, y + h, .4), (x, y + h, .4)]
    tone = (z.get("tone") or 1) - 1
    return (f'<g class="map-zone" data-zone="{html.escape(z["id"], quote=True)}">'
            f'{_poly(pr, points, f"map-3d-floor tone-{tone}")}</g>')


def _label3d(pr, z):
    sx, sy = pr(z["x"] + 10, z["y"] + z["h"] - 9, .6)
    return (f'<g class="map-zone" data-zone="{html.escape(z["id"], quote=True)}">'
            f'<text class="map-3d-label" x="{sx:.1f}" y="{sy:.1f}">'
            f'{html.escape(z["label"])}</text></g>')


# ------------------------------------------------------------------ renderers
def _zone_rect(z):
    tone = z.get("tone") or 1
    return (f'<g class="map-zone" data-zone="{html.escape(z["id"], quote=True)}">'
            f'<rect class="map-zone-shape tone-{tone}" x="{z["x"]}" '
            f'y="{z["y"]}" width="{z["w"]}" height="{z["h"]}" rx="8"/></g>')


def _zone_label(z):
    return (f'<g class="map-zone" data-zone="{html.escape(z["id"], quote=True)}">'
            f'<circle class="map-zone-dot" cx="{z["x"] + 12:.1f}" '
            f'cy="{z["y"] + z["h"] - 13:.1f}" r="2.2"/>'
            f'<text class="map-zone-label" x="{z["x"] + 19:.1f}" '
            f'y="{z["y"] + z["h"] - 9:.1f}">{html.escape(z["label"])}</text>'
            f'</g>')


def _route_2d(hotspots):
    if len(hotspots) < 2:
        return ""
    pts = " L".join(f'{s["x"]:.1f} {s["y"]:.1f}' for s in hotspots)
    return f'<path class="map-route" d="M{pts}"/>'


def render_svg_2d(layout, hotspots):
    svg = [
        f'<svg class="map-svg map-svg-2d" viewBox="0 0 {VIEW_W} {VIEW_H}" '
        'aria-hidden="true" focusable="false">',
        '<defs>'
        '<pattern id="mapDots2d" width="18" height="18" '
        'patternUnits="userSpaceOnUse">'
        '<circle class="map-dot" cx="1" cy="1" r=".9"/></pattern>'
        '<clipPath id="mapClip2d"><rect x="16" y="16" width="608" '
        'height="368" rx="16"/></clipPath>'
        '</defs>',
        f'<rect class="map-plate" x="8" y="8" width="{VIEW_W - 16}" '
        f'height="{VIEW_H - 16}" rx="18"/>',
        '<rect class="map-plate-inner" x="16" y="16" width="608" '
        'height="368" rx="16"/>',
        '<rect class="map-dot-field" x="16" y="16" width="608" height="368" '
        'fill="url(#mapDots2d)" clip-path="url(#mapClip2d)"/>',
    ]
    svg.extend(_zone_rect(z) for z in layout["zones"])
    svg.append('<rect class="map-wall" x="15.5" y="15.5" width="609" '
               'height="369" rx="16"/>')
    svg.extend(_prop(p) for p in layout["props"])
    svg.append(_route_2d(hotspots))
    svg.extend(_zone_label(z) for z in layout["zones"])
    svg.append("</svg>")
    return "".join(svg)


def render_svg_3d(layout):
    pr = _Projector()
    boxes = []
    for prop in layout["props"]:
        boxes.extend(_prop_boxes(prop))
    boxes.sort(key=lambda b: (b["x"] + b["w"] / 2) + (b["y"] + b["h"] / 2))

    svg = [
        f'<svg class="map-svg map-svg-3d" viewBox="0 0 {VIEW_W} {VIEW_H}" '
        'aria-hidden="true" focusable="false">',
        '<defs>'
        '<filter id="mapShadow3d" x="-20%" y="-20%" width="140%" '
        'height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" '
        'flood-color="#000" flood-opacity=".16"/></filter>'
        '</defs>',
        f'<g filter="url(#mapShadow3d)">{_slab3d(pr)}</g>',
    ]
    svg.extend(_floor3d(pr, z) for z in layout["zones"])
    svg.extend(_box3d(pr, b) for b in boxes)
    svg.extend(_label3d(pr, z) for z in layout["zones"])
    svg.append("</svg>")
    return "".join(svg)


def render_map(scene) -> dict:
    """Return both views, hotspot percentages for each, and zone metadata."""
    spec = scene.get("map") or {}
    archetype = spec.get("archetype")
    if archetype not in ARCHETYPES:
        raise ValueError(f"{scene.get('id')}: unknown map archetype {archetype!r}")
    variants = ARCHETYPES[archetype]
    variant = spec.get("variant") or "default"
    if variant not in variants:
        raise ValueError(f"{scene.get('id')}: unknown {archetype} variant {variant!r}")
    layout = variants[variant]
    decor = DECOR.get((archetype, variant))
    if decor:
        layout = {**layout, "props": [*layout["props"], *decor]}
    zones = {z["id"]: z for z in layout["zones"]}

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

    pr = _Projector()
    for spot in hotspots:
        sx, sy = pr(spot["x"], spot["y"], 0)
        spot["left3d"] = round(sx / VIEW_W * 100, 2)
        spot["top3d"] = round(sy / VIEW_H * 100, 2)
        spot["x3d"] = round(sx, 1)
        spot["y3d"] = round(sy, 1)

    return {
        "svg2d": render_svg_2d(layout, hotspots),
        "svg3d": render_svg_3d(layout),
        "hotspots": hotspots,
        "zones": zones,
    }


def archetype_zones(archetype: str, variant: str) -> dict:
    """Zone ids for validation."""
    try:
        return {z["id"]: z for z in ARCHETYPES[archetype][variant]["zones"]}
    except KeyError as error:
        raise ValueError(f"unknown map {archetype}/{variant}") from error
