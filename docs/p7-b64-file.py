#!/usr/bin/env python3
"""Emit base64 payload for browser file-drop injection (P7-005)."""
import base64
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
print(base64.b64encode(path.read_bytes()).decode("ascii"))
