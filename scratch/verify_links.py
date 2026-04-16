import os
import sys

# Add the project root to sys.path
sys.path.append(os.getcwd())

# Mock environment variables
os.environ["FRONTEND_URL"] = "https://tunetutor-vercel.vercel.app"
os.environ["SMTP_HOST"] = "mock"
os.environ["SMTP_USERNAME"] = "mock"
os.environ["SMTP_PASSWORD"] = "mock"

from tunetutor.email_utils import send_verification_email

# Mock send_email to just print the body instead of sending
import tunetutor.email_utils as email_utils
original_send_email = email_utils.send_email
def mock_send_email(subject, recipient, body_html):
    print(f"Subject: {subject}")
    print(f"Recipient: {recipient}")
    print("Body contains expected link:", "https://tunetutor-vercel.vercel.app/auth/verify?token=test-token" in body_html)
    if "https://tunetutor-vercel.vercel.app/auth/verify?token=test-token" not in body_html:
        print("Mismatched Body HTML:", body_html)

email_utils.send_email = mock_send_email

print("Testing Verification Link Generation...")
send_verification_email("test@example.com", "test-token")
