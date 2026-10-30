"""Início automático do agente com a sessão do usuário (opcional, desligado por padrão).

Usa apenas mecanismos do próprio usuário, sem privilégios nem Agendador de Tarefas:
- Windows: atalho na pasta Inicializar (shell:startup) apontando para o pythonw.exe do venv.
- Linux: arquivo .desktop em ~/.config/autostart (padrão XDG, aceito por GNOME, KDE etc.).
"""

import os
import sys
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[2]
WINDOWS_SHORTCUT = "Dashboard Agent.lnk"
LINUX_DESKTOP_FILE = "dashboard-agent.desktop"


def _autostart_dir() -> Path | None:
    override = os.environ.get("DASHBOARD_AUTOSTART_DIR")
    if override:
        return Path(override)
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" if appdata else None
    if sys.platform.startswith("linux"):
        return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "autostart"
    return None


def _entry_path() -> Path | None:
    directory = _autostart_dir()
    if directory is None:
        return None
    return directory / (WINDOWS_SHORTCUT if sys.platform == "win32" else LINUX_DESKTOP_FILE)


def _python_executable() -> Path:
    executable = Path(sys.executable)
    if sys.platform == "win32":
        # pythonw.exe roda sem janela de console.
        windowless = executable.with_name("pythonw.exe")
        if windowless.exists():
            return windowless
    return executable


def status() -> dict:
    entry = _entry_path()
    return {
        "supported": entry is not None,
        "enabled": bool(entry and entry.exists()),
        "path": str(entry) if entry else None,
        "method": "startup-folder" if sys.platform == "win32" else "xdg-autostart" if entry else None,
    }


def _create_windows_shortcut(path: Path) -> None:
    import pythoncom
    from win32com.client import Dispatch

    pythoncom.CoInitialize()
    try:
        shortcut = Dispatch("WScript.Shell").CreateShortcut(str(path))
        shortcut.TargetPath = str(_python_executable())
        shortcut.Arguments = "-m src.main"
        shortcut.WorkingDirectory = str(AGENT_DIR)
        shortcut.Description = "Agente local do Dashboard Produtividade"
        shortcut.WindowStyle = 7  # minimizado
        shortcut.Save()
    finally:
        pythoncom.CoUninitialize()


def _write_linux_desktop_file(path: Path) -> None:
    executable = str(_python_executable()).replace('"', '\\"')
    path.write_text(
        "\n".join(
            [
                "[Desktop Entry]",
                "Type=Application",
                "Name=Dashboard Agent",
                "Comment=Agente local do Dashboard Produtividade",
                f'Exec="{executable}" -m src.main',
                f"Path={AGENT_DIR}",
                "Terminal=false",
                "NoDisplay=true",
                "X-GNOME-Autostart-enabled=true",
                "",
            ]
        ),
        encoding="utf-8",
    )


def set_enabled(enabled: bool) -> dict:
    entry = _entry_path()
    if entry is None:
        raise RuntimeError("Início automático não é suportado neste sistema")

    if enabled:
        entry.parent.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            _create_windows_shortcut(entry)
        else:
            _write_linux_desktop_file(entry)
    elif entry.exists():
        entry.unlink()
    return status()
