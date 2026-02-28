"""Email service for sending verification and notification emails."""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via SMTP (async-safe).

    Uses asyncio.to_thread to avoid blocking the event loop on
    synchronous SMTP operations. If aiosmtplib is installed it can
    be swapped in as a drop-in replacement for even better performance.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

    def _is_configured(self) -> bool:
        """Check if email service is properly configured."""
        return bool(self.settings.SMTP_HOST and self.settings.SMTP_USER and self.settings.SMTP_PASSWORD)

    def _send_sync(self, msg: MIMEMultipart, to_email: str) -> None:
        """Synchronous SMTP send (run inside a thread)."""
        with smtplib.SMTP(self.settings.SMTP_HOST, self.settings.SMTP_PORT) as server:
            server.starttls()
            server.login(self.settings.SMTP_USER, self.settings.SMTP_PASSWORD)
            server.sendmail(
                self.settings.SMTP_FROM_EMAIL,
                to_email,
                msg.as_string(),
            )

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> bool:
        """Send an email without blocking the event loop.

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email body
            text_content: Plain text fallback (optional)

        Returns:
            True if email was sent successfully, False otherwise
        """
        if not self._is_configured():
            logger.warning("Email service not configured - email not sent to %s", to_email)
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.settings.SMTP_FROM_NAME} <{self.settings.SMTP_FROM_EMAIL}>"
            msg["To"] = to_email

            # Add plain text part
            if text_content:
                part1 = MIMEText(text_content, "plain", "utf-8")
                msg.attach(part1)

            # Add HTML part
            part2 = MIMEText(html_content, "html", "utf-8")
            msg.attach(part2)

            # Run blocking SMTP in a thread to avoid blocking the event loop
            await asyncio.to_thread(self._send_sync, msg, to_email)

            logger.info("Email sent successfully to %s", to_email)
            return True

        except Exception as e:
            logger.error("Failed to send email to %s: %s", to_email, e)
            return False

    async def send_verification_email(
        self,
        to_email: str,
        user_name: str,
        verification_token: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Send email verification email.

        Args:
            to_email: Recipient email address
            user_name: User's display name
            verification_token: Email verification token
            base_url: Base URL for verification link

        Returns:
            True if email was sent successfully
        """
        verification_url = f"{base_url}/verify-email?token={verification_token}"

        subject = "אימות כתובת האימייל שלך - Groupio"

        html_content = f"""
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; direction: rtl; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .button {{
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #4F46E5;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .footer {{ color: #666; font-size: 12px; margin-top: 30px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>שלום {user_name}!</h1>
                <p>תודה שנרשמת ל-Groupio. אנא אמת את כתובת האימייל שלך על ידי לחיצה על הכפתור למטה:</p>
                <a href="{verification_url}" class="button">אימות האימייל</a>
                <p>או העתק את הקישור הבא לדפדפן:</p>
                <p><a href="{verification_url}">{verification_url}</a></p>
                <p>הקישור תקף ל-24 שעות.</p>
                <div class="footer">
                    <p>אם לא נרשמת ל-Groupio, אנא התעלם מהודעה זו.</p>
                    <p>© Groupio - קניות קבוצתיות לבניינים</p>
                </div>
            </div>
        </body>
        </html>
        """

        text_content = f"""
        שלום {user_name}!

        תודה שנרשמת ל-Groupio. אנא אמת את כתובת האימייל שלך על ידי ביקור בקישור הבא:

        {verification_url}

        הקישור תקף ל-24 שעות.

        אם לא נרשמת ל-Groupio, אנא התעלם מהודעה זו.

        © Groupio - קניות קבוצתיות לבניינים
        """

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_password_reset_email(
        self,
        to_email: str,
        user_name: str,
        reset_token: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Send password reset email.

        Args:
            to_email: Recipient email address
            user_name: User's display name
            reset_token: Password reset token
            base_url: Base URL for reset link

        Returns:
            True if email was sent successfully
        """
        reset_url = f"{base_url}/reset-password?token={reset_token}"

        subject = "איפוס סיסמה - Groupio"

        html_content = f"""
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; direction: rtl; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .button {{
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #4F46E5;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .warning {{ color: #DC2626; }}
                .footer {{ color: #666; font-size: 12px; margin-top: 30px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>איפוס סיסמה</h1>
                <p>שלום {user_name},</p>
                <p>קיבלנו בקשה לאיפוס הסיסמה שלך. לחץ על הכפתור למטה ליצירת סיסמה חדשה:</p>
                <a href="{reset_url}" class="button">איפוס סיסמה</a>
                <p>או העתק את הקישור הבא לדפדפן:</p>
                <p><a href="{reset_url}">{reset_url}</a></p>
                <p class="warning">הקישור תקף לשעה אחת בלבד.</p>
                <div class="footer">
                    <p>אם לא ביקשת לאפס את הסיסמה, אנא התעלם מהודעה זו או צור איתנו קשר.</p>
                    <p>© Groupio - קניות קבוצתיות לבניינים</p>
                </div>
            </div>
        </body>
        </html>
        """

        text_content = f"""
        איפוס סיסמה

        שלום {user_name},

        קיבלנו בקשה לאיפוס הסיסמה שלך. בקר בקישור הבא ליצירת סיסמה חדשה:

        {reset_url}

        הקישור תקף לשעה אחת בלבד.

        אם לא ביקשת לאפס את הסיסמה, אנא התעלם מהודעה זו.

        © Groupio - קניות קבוצתיות לבניינים
        """

        return await self.send_email(to_email, subject, html_content, text_content)

    # ------------------------------------------------------------------
    # Offer lifecycle notification helpers
    # ------------------------------------------------------------------

    async def send_offer_joined(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        current_participants: int,
        min_participants: int,
        offer_id: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Notify resident they successfully joined an offer."""
        offer_url = f"{base_url}/offers/{offer_id}"
        subject = f"הצטרפת להצעה: {offer_title}"
        threshold_note = (
            f"כבר {current_participants} דיירים הצטרפו — הושג מינימום ההנחה!"
            if current_participants >= min_participants
            else f"נדרשים עוד {min_participants - current_participants} דיירים כדי לפתוח את ההנחה."
        )
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.btn{{display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;margin:20px 0;}}
.info{{background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin:16px 0;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name}!</h1>
<p>הצטרפת בהצלחה להצעה הקבוצתית: <strong>{offer_title}</strong></p>
<div class="info">
<p>📊 {threshold_note}</p>
<p>ניתן לעזוב את ההצעה בחופשיות עד לשלב התאמת הקבלן.</p>
</div>
<a href="{offer_url}" class="btn">צפייה בהצעה</a>
<div class="footer"><p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)

    async def send_offer_left(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        offer_id: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Notify resident they left an offer."""
        offer_url = f"{base_url}/offers/{offer_id}"
        subject = f"עזבת את ההצעה: {offer_title}"
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.btn{{display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;margin:20px 0;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name},</h1>
<p>עזבת את ההצעה הקבוצתית: <strong>{offer_title}</strong>.</p>
<p>אם תחזור בך, ניתן להצטרף שוב כל עוד ההצעה פתוחה ויש מקום.</p>
<a href="{offer_url}" class="btn">חזרה להצעה</a>
<div class="footer"><p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)

    async def send_offer_threshold_reached(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        participants: int,
        discount_percent: int,
        offer_id: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Notify all participants when minimum threshold is reached."""
        offer_url = f"{base_url}/offers/{offer_id}"
        subject = f"🎉 ההצעה {offer_title} הגיעה למינימום!"
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.btn{{display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;margin:20px 0;}}
.celebrate{{background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:16px;margin:16px 0;text-align:center;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name}!</h1>
<div class="celebrate">
<h2>🎉 ההצעה הגיעה למינימום!</h2>
<p>{participants} דיירים הצטרפו להצעה <strong>{offer_title}</strong>.</p>
<p>ההנחה הנוכחית: <strong>{discount_percent}%</strong></p>
</div>
<p>בקרוב נתאים לכם קבלן מאומת.</p>
<a href="{offer_url}" class="btn">צפייה בהצעה</a>
<div class="footer"><p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)

    async def send_offer_cancelled(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        reason: str | None = None,
    ) -> bool:
        """Notify participants that an offer was cancelled."""
        subject = f"ההצעה {offer_title} בוטלה"
        reason_html = f"<p>סיבה: {reason}</p>" if reason else ""
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.alert{{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin:16px 0;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name},</h1>
<div class="alert">
<p>ההצעה הקבוצתית <strong>{offer_title}</strong> בוטלה.</p>
{reason_html}
</div>
<p>אם שילמת, תקבל החזר מלא תוך 5 ימי עסקים.</p>
<div class="footer"><p>לשאלות: <a href="mailto:support@groupio.co.il">support@groupio.co.il</a></p>
<p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)

    async def send_offer_matched(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        contractor_name: str,
        offer_id: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Notify participants when their offer is matched to a contractor."""
        offer_url = f"{base_url}/offers/{offer_id}"
        subject = f"קבלן נמצא להצעה: {offer_title}"
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.btn{{display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;margin:20px 0;}}
.match{{background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin:16px 0;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name}!</h1>
<div class="match">
<h2>✅ קבלן נמצא!</h2>
<p>הצעתך <strong>{offer_title}</strong> הותאמה לקבלן <strong>{contractor_name}</strong>.</p>
</div>
<p>בקרוב תקבל פרטי תשלום ולוח זמנים לביצוע העבודה.</p>
<a href="{offer_url}" class="btn">צפייה בהצעה</a>
<div class="footer"><p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)

    async def send_offer_approved(
        self,
        to_email: str,
        user_name: str,
        offer_title: str,
        offer_id: str,
        base_url: str = "https://groupio.co.il",
    ) -> bool:
        """Notify offer creator when admin approves their offer."""
        offer_url = f"{base_url}/offers/{offer_id}"
        subject = f"ההצעה שלך אושרה: {offer_title}"
        html_content = f"""<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;direction:rtl;}}
.c{{max-width:600px;margin:0 auto;padding:20px;}}
.btn{{display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;margin:20px 0;}}
.approved{{background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin:16px 0;}}
.footer{{color:#666;font-size:12px;margin-top:30px;}}</style></head>
<body><div class="c">
<h1>שלום {user_name}!</h1>
<div class="approved">
<h2>✅ ההצעה שלך אושרה!</h2>
<p>ההצעה <strong>{offer_title}</strong> אושרה על ידי הנהלת Groupio ופתוחה עכשיו להצטרפות דיירים.</p>
</div>
<a href="{offer_url}" class="btn">צפייה בהצעה</a>
<div class="footer"><p>© Groupio - קניות קבוצתיות לבניינים</p></div>
</div></body></html>"""
        return await self.send_email(to_email, subject, html_content)


# Singleton instance
_email_service: EmailService | None = None


def get_email_service() -> EmailService:
    """Get the email service singleton."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
