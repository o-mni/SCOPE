"""
SCOPE — Domain, preview, and template API endpoints.

GET /api/domains                     — list all domains with module metadata
GET /api/domains/preview?modules=... — capability check for a module list
GET /api/templates                   — list built-in assessment templates
"""
from fastapi import APIRouter
from engine.domains import DOMAINS, TEMPLATES
from engine.registry import REGISTRY

router = APIRouter()


@router.get("/domains")
def list_domains():
    """Return all coverage domains with per-module metadata from the registry."""
    result = []
    for d in DOMAINS:
        modules = []
        for mod_name in d["modules"]:
            check_cls = REGISTRY.get(mod_name)
            if check_cls is None:
                continue
            modules.append({
                "name":         mod_name,
                "description":  check_cls.description,
                "requiresRoot": check_cls.requires_root,
            })
        result.append({
            "id":          d["id"],
            "label":       d["label"],
            "description": d["description"],
            "icon":        d["icon"],
            "modules":     modules,
        })
    return result


@router.get("/domains/preview")
def preview_modules(modules: str = ""):
    """
    Lightweight capability check for a comma-separated list of module names.
    Called by the wizard Step 4 before assessment creation.
    """
    from engine.capabilities import detect_capabilities

    module_list = [m.strip() for m in modules.split(",") if m.strip()]
    if not module_list:
        return {"euid": 0, "isRoot": False, "modules": [], "warnings": []}

    caps     = detect_capabilities()
    results  = []
    warnings = []

    for mod_name in module_list:
        check_cls = REGISTRY.get(mod_name)
        if check_cls is None:
            results.append({
                "name":   mod_name,
                "status": "unknown",
                "note":   "Module not found in registry",
            })
            continue

        check = check_cls()

        if check.requires_root and not caps.is_root:
            results.append({
                "name":   mod_name,
                "status": "limited",
                "note":   "Requires root — will run with reduced coverage",
            })
            warnings.append(f"{mod_name} requires root")
        elif not check.is_available():
            results.append({
                "name":   mod_name,
                "status": "blocked",
                "note":   "Required tools not available on this system",
            })
        else:
            results.append({
                "name":   mod_name,
                "status": "ready",
                "note":   None,
            })

    return {
        "euid":     caps.euid,
        "isRoot":   caps.is_root,
        "modules":  results,
        "warnings": warnings,
    }


@router.get("/templates")
def list_templates():
    """Return all built-in assessment templates."""
    return [
        {
            "id":          t["id"],
            "label":       t["label"],
            "description": t["description"],
            "modules":     t["modules"],
            "moduleCount": len(t["modules"]),
        }
        for t in TEMPLATES
    ]
