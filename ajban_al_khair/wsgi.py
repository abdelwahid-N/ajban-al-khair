# WSGI entry point for PythonAnywhere (or any WSGI host).
# Makes sure the SQLite database/tables exist before serving requests.
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app import app as application, init_db  # noqa: E402

init_db()
