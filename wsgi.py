import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from ajban_al_khair.app import app as application, init_db

app = application

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    application.run(host="0.0.0.0", port=port)
