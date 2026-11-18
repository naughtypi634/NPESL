"""Result-oriented verification for the built NPESL site.

The old verify only checked that referenced files existed and ran a sampled
browser suite full of internal state assertions.  This package verifies what a
reader actually gets: every page loads, every link and asset resolves, the
visible text follows the content rules, and every app can actually play its
audio from the local deploy trees.
"""
