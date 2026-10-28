import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from ajban_al_khair.app import app, init_db

# Aliases for any WSGI server (gunicorn app:app or gunicorn app:application)
application = app

# Initialize DB on load
try:
    init_db()
except Exception as e:
    print("DB init error:", e)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port)
