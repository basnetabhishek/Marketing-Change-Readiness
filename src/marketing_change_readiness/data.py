import json
from pathlib import Path

from .models import Asset, ChangeEvent

DATA_DIR = Path(__file__).parent / "datasets"


def load_dataset(data_dir: Path = DATA_DIR) -> tuple[list[Asset], list[ChangeEvent], dict[str, set[str]]]:
    assets_raw = json.loads((data_dir / "assets.json").read_text(encoding="utf-8"))
    events_raw = json.loads((data_dir / "changes.json").read_text(encoding="utf-8"))
    labels_raw = json.loads((data_dir / "labels.json").read_text(encoding="utf-8"))
    assets = [Asset(**item) for item in assets_raw]
    events = [ChangeEvent(**{**item, "keywords": tuple(item.get("keywords", []))}) for item in events_raw]
    return assets, events, {event_id: set(asset_ids) for event_id, asset_ids in labels_raw.items()}

