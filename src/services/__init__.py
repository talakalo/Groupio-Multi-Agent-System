"""Services module for Groupio Multi-Agent System."""


def __getattr__(name: str):
    """Lazy imports to avoid circular dependency with orchestration module."""
    if name in ("WhatsAppBotService", "get_whatsapp_bot"):
        from src.services.whatsapp_bot import WhatsAppBotService, get_whatsapp_bot

        _exports = {
            "WhatsAppBotService": WhatsAppBotService,
            "get_whatsapp_bot": get_whatsapp_bot,
        }
        return _exports[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["WhatsAppBotService", "get_whatsapp_bot"]
