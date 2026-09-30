"""Testopzet: app.py importeren zonder één echt extern verzoek en zonder de
productiecache of productielog te raken.

`requests` wordt vóór de import vervangen: `NEP.gedrag` bepaalt per host wat er
gebeurt ("fout" = direct ConnectionError, "hangt" = slapen tot de time-out).
"""
import os
import sys
import time
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import pytest
import requests

BACKEND = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="weertest-"))
os.environ["WEERCACHE_PAD"] = str(TMP / "cache.json")
os.environ["TOEGANG_DIR"] = str(TMP / "toegang")
os.environ.pop("KNMI_API_KEY", None)
if (BACKEND / "cache.json").exists():
    shutil.copy(BACKEND / "cache.json", TMP / "cache.json")


class _Nep:
    gedrag: dict[str, str] = {}

    def request(self, sessie, method, url, *a, **kw):
        host = urlparse(url).hostname or ""
        for sleutel, wat in self.gedrag.items():
            if sleutel in host and wat == "hangt":
                time.sleep(kw.get("timeout") or 10)
                raise requests.exceptions.ReadTimeout(f"test: {host} hangt")
        raise requests.exceptions.ConnectionError(f"test: geen extern verkeer ({host})")


NEP = _Nep()
requests.Session.request = lambda self, *a, **kw: NEP.request(self, *a, **kw)
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
import app as app_module  # noqa: E402


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


@pytest.fixture
def mod():
    return app_module


@pytest.fixture(autouse=True)
def _reset():
    NEP.gedrag = {}
    yield
    NEP.gedrag = {}
