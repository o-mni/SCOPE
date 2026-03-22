"""
SCOPE — Template loader and in-process cache.

Scans report_templates/ at startup and on demand.
Invalid template folders are logged and skipped — startup never fails.
"""
import logging
from pathlib import Path

import yaml

from .schema import TemplateMetadata

log = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "report_templates"

# id → TemplateMetadata
_cache: dict[str, TemplateMetadata] = {}
_errors: dict[str, str] = {}      # id/folder → error message


def _load_one(folder: Path) -> tuple[TemplateMetadata | None, str | None]:
    """Parse and validate a single template folder. Returns (meta, error)."""
    yml_path = folder / "template.yml"
    if not yml_path.exists():
        return None, "missing template.yml"
    try:
        raw = yaml.safe_load(yml_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None, "template.yml is not a YAML mapping"
        meta = TemplateMetadata.model_validate(raw)
        if meta.id != folder.name:
            return None, f"id '{meta.id}' does not match folder name '{folder.name}'"
        if meta.template_type in ("report", "both") and not (folder / "report.html.j2").exists():
            return None, "template_type includes 'report' but report.html.j2 is missing"
        if meta.template_type in ("strategy", "both") and not (folder / "strategy.html.j2").exists():
            return None, "template_type includes 'strategy' but strategy.html.j2 is missing"
        return meta, None
    except Exception as exc:
        return None, str(exc)


def load_all() -> dict[str, TemplateMetadata]:
    """Rescan TEMPLATES_DIR, update cache, return loaded templates."""
    _cache.clear()
    _errors.clear()

    if not TEMPLATES_DIR.is_dir():
        log.warning("report_templates/ directory not found at %s", TEMPLATES_DIR)
        return {}

    for folder in sorted(TEMPLATES_DIR.iterdir()):
        if not folder.is_dir():
            continue
        meta, err = _load_one(folder)
        if err:
            log.warning("[templates] Skipping '%s': %s", folder.name, err)
            _errors[folder.name] = err
        else:
            _cache[meta.id] = meta

    log.info("[templates] Loaded %d template(s)", len(_cache))
    return dict(_cache)


def get_all() -> dict[str, TemplateMetadata]:
    if not _cache:
        load_all()
    return dict(_cache)


def get_errors() -> dict[str, str]:
    return dict(_errors)


def get(template_id: str) -> TemplateMetadata:
    if not _cache:
        load_all()
    if template_id not in _cache:
        raise KeyError(f"Template '{template_id}' not found")
    return _cache[template_id]


def get_folder(template_id: str) -> Path:
    get(template_id)   # raises KeyError if missing
    return TEMPLATES_DIR / template_id


def duplicate(source_id: str, new_id: str, new_name: str) -> TemplateMetadata:
    """Copy a template folder to a new id. Returns new TemplateMetadata."""
    import shutil
    src = get_folder(source_id)
    dst = TEMPLATES_DIR / new_id

    if dst.exists():
        raise ValueError(f"Folder '{new_id}' already exists")

    shutil.copytree(src, dst)

    # Patch the id and name in the new template.yml
    yml_path = dst / "template.yml"
    raw = yaml.safe_load(yml_path.read_text(encoding="utf-8"))
    raw["id"] = new_id
    raw["name"] = new_name
    raw["builtin"] = False
    yml_path.write_text(yaml.dump(raw, allow_unicode=True, sort_keys=False), encoding="utf-8")

    load_all()
    return get(new_id)


def delete(template_id: str) -> None:
    """Delete a custom template folder. Rejects built-ins."""
    import shutil
    meta = get(template_id)
    if meta.builtin:
        raise PermissionError(f"Template '{template_id}' is built-in and cannot be deleted")
    folder = get_folder(template_id)
    shutil.rmtree(folder)
    _cache.pop(template_id, None)
    _errors.pop(template_id, None)
