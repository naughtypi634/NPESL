"""Shared helpers for the build scripts.

Only side-effect-free plumbing lives here: UTF-8 console output and
subprocess step execution.  Content models, TTS clients and writers stay
inside the app that owns them.
"""
