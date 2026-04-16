import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Manually load environment variables from .env file to avoid external dependencies
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key.strip()] = val.strip()

SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
MAIL_FROM = os.environ.get("MAIL_FROM")

# Frontend URL for links
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

def send_email(subject: str, recipient: str, body_html: str):
    if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD]):
        print("SMTP credentials not fully configured. Email not sent.")
        print(f"DEBUG: Subject: {subject}, Recipient: {recipient}")
        return

    msg = MIMEMultipart()
    msg['From'] = MAIL_FROM
    msg['To'] = recipient
    msg['Subject'] = subject

    msg.attach(MIMEText(body_html, 'html'))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"Successfully sent email to {recipient}")
    except Exception as e:
        print(f"Failed to send email to {recipient}: {e}")

def send_verification_email(email_address: str, token: str):
    subject = "Verify your Lyvo Account"
    verification_link = f"{FRONTEND_URL}/auth/verify?token={token}"
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6366f1;">Welcome to Lyvo!</h2>
            <p>Thank you for joining our community. We're excited to help you master Japanese through the power of music.</p>
            <p>Please click the button below to verify your email address and get started:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{verification_link}" style="background-color: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Account</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p>{verification_link}</p>
        </body>
    </html>
    """
    return send_email(subject, email_address, body)

def send_reset_password_email(email_address: str, token: str):
    subject = "Reset your Lyvo Password"
    reset_link = f"{FRONTEND_URL}/auth/reset-password?token={token}"
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6366f1;">Reset Your Password</h2>
            <p>We received a request to reset the password for your Lyvo account.</p>
            <p>Click the link below to choose a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" style="background-color: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p>If you didn't request this, you can safely ignore this email.</p>
        </body>
    </html>
    """
    return send_email(subject, email_address, body)

def send_email_change_verification(new_email: str, token: str):
    subject = "Confirm your Lyvo Email Change"
    confirm_link = f"{FRONTEND_URL}/auth/verify?token={token}"
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6366f1;">Confirm Email Change</h2>
            <p>We received a request to change your Lyvo account email to this address. Click the link below to confirm and apply the change:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{confirm_link}" style="background-color: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Confirm Email Change</a>
            </div>
            <p>If you didn't request this, please ignore this email.</p>
        </body>
    </html>
    """
    return send_email(subject, new_email, body)
