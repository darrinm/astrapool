"""Shared fal setup: loads FAL_API_KEY from ~/src/iris/.env into FAL_KEY."""
import os
env = dict(l.rstrip("\n").split("=", 1) for l in open(os.path.expanduser("~/src/iris/.env")) if "=" in l and not l.startswith("#"))
os.environ["FAL_KEY"] = env["FAL_API_KEY"].strip().strip('"')
import fal_client  # noqa: E402
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
