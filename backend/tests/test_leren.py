"""Dekt leren.beste_model(): drempel, winnaar, en dat hij nooit een model
teruggeeft dat niet in de kandidatenlijst zit."""
from datetime import datetime, timedelta, timezone

import leren


def _uren(n):
    """n opeenvolgende, afgeronde uren eindigend bij nu."""
    nu = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for i in range(n):
        yield nu - timedelta(hours=n - i)


def test_onder_de_drempel_geeft_none(mod):
    spot = "test-spot-weinig-data"
    for uur in _uren(10):
        leren.leg_voorspelling_vast(spot, "gfs_seamless", [(uur, 7.0, 180)])
        leren.leg_meting_vast(spot, uur, 8.0, 180, "knmi")
    assert leren.beste_model(spot, ["gfs_seamless"]) is None


def test_kiest_het_model_met_de_laagste_afwijking(mod):
    spot = "test-spot-twee-modellen"
    for uur in _uren(150):
        # gfs: steeds 1 m/s te hoog. icon: steeds 4 m/s te hoog.
        leren.leg_voorspelling_vast(spot, "gfs_seamless", [(uur, 9.0, 180)])
        leren.leg_voorspelling_vast(spot, "icon_seamless", [(uur, 12.0, 180)])
        leren.leg_meting_vast(spot, uur, 8.0, 180, "knmi")
    assert leren.beste_model(spot, ["gfs_seamless", "icon_seamless"]) == "gfs_seamless"


def test_negeert_modellen_buiten_de_kandidatenlijst(mod):
    spot = "test-spot-kandidatengate"
    for uur in _uren(150):
        # Alleen icon heeft hier data, en icon zit niet in de kandidatenlijst
        # (bv. omdat _model_dekt die plek voor icon niet dekt).
        leren.leg_voorspelling_vast(spot, "icon_seamless", [(uur, 8.0, 180)])
        leren.leg_meting_vast(spot, uur, 8.0, 180, "knmi")
    assert leren.beste_model(spot, ["gfs_seamless"]) is None


def test_geen_kandidaten_geeft_meteen_none(mod):
    assert leren.beste_model("willekeurige-spot", []) is None
