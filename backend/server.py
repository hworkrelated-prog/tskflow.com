from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Request as HTTPRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import resend
import pytz
import random
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from phase_helpers import priority_followup_config, generate_ai_work_review, build_manager_eod_section
from activity_helpers import log_task_activity, tasks_to_csv_rows, rows_to_csv
from sheets_helpers import (
    SHEETS_SCOPES,
    extract_spreadsheet_id,
    fetch_sheet_values,
    parse_metrics_rows,
    upsert_daily_metrics,
    build_sheet_metrics_eod_section,
    find_person_metrics,
    format_metrics_line,
)

# App Base URL for emails (production-safe)
APP_BASE_URL = os.environ.get('FRONTEND_URL') or os.getenv('FRONTEND_URL') or 'https://tskflow.com'

# Email sender persona ("Jarvis" per product spec)
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Jarvis")
EMAIL_FROM_ADDR = os.getenv("EMAIL_FROM_ADDR", "notifications@notifications.unbiassly.com")
EMAIL_FROM = f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDR}>"

# Configure Resend
resend.api_key = os.getenv("RESEND_API_KEY")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440
security = HTTPBearer()

# PST Timezone
PST = pytz.timezone('America/Los_Angeles')

# Personal email domains that are blocked for Teams features
BLOCKED_EMAIL_DOMAINS = {
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
    'aol.com', 'icloud.com', 'me.com', 'mail.com', 'protonmail.com',
    'zoho.com', 'yandex.com', 'gmx.com', 'inbox.com'
}

def is_personal_email(email: str) -> bool:
    """Check if email is from a personal/blocked domain"""
    domain = email.lower().split('@')[-1]
    return domain in BLOCKED_EMAIL_DOMAINS

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Pydantic Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one number')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    subscription_tier: str
    email_verified: bool
    is_team_owner: Optional[bool] = False
    team_owner_email: Optional[str] = None
    google_calendar_connected: Optional[bool] = False
    google_sheets_connected: Optional[bool] = False
    preferences: Optional[dict] = None
    reports_to: Optional[str] = None
    company_domain: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class EmailVerifyRequest(BaseModel):
    email: EmailStr
    verification_code: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None  # Made optional
    assigned_to: str
    due_date: str
    priority: str
    category: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None  # Base64 or URLs
    attachments: Optional[List[dict]] = None  # [{id, path, filename, content_type, size, kind}]
    auto_reminder: Optional[bool] = False
    requires_screen_recording: Optional[bool] = False  # Section 5: require screen recording proof
    is_sales_task: Optional[bool] = False  # Section 11: prospect/customer-related
    success_criteria: Optional[str] = None  # What "done well" looks like (manager expectations)

class DraftTaskCreate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None
    attachments: Optional[List[dict]] = None
    auto_reminder: Optional[bool] = False
    success_criteria: Optional[str] = None

class BulkTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None  # Made optional
    assigned_to: List[str]  # List of user IDs or email addresses
    due_date: str
    priority: str
    category: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None
    attachments: Optional[List[dict]] = None
    auto_reminder: Optional[bool] = False
    requires_screen_recording: Optional[bool] = False
    is_sales_task: Optional[bool] = False
    success_criteria: Optional[str] = None

class TaskComment(BaseModel):
    content: str
    mentions: Optional[List[str]] = []  # List of user IDs mentioned with @

class AISummaryRequest(BaseModel):
    view_mode: Optional[str] = "active"
    date_filter: Optional[str] = "all"

class RecordingCreateRequest(BaseModel):
    recording_url: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    duration_seconds: Optional[float] = None
    size_bytes: Optional[int] = None
    mime_type: Optional[str] = None

class TaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None  # Made optional
    assigned_to: str
    assigned_to_name: str
    created_by: str
    created_by_name: str
    due_date: str
    status: str
    priority: str
    category: Optional[str] = None
    created_at: str
    accepted_at: Optional[str] = None
    completed_at: Optional[str] = None
    reason_for_decline: Optional[str] = None
    counter_proposal_message: Optional[str] = None
    proposed_due_date: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None
    completion_note: Optional[str] = None
    completion_note_images: Optional[List[str]] = None
    review_pending_at: Optional[str] = None
    review_feedback: Optional[str] = None
    invite_token: Optional[str] = None
    assigned_to_email: Optional[str] = None
    created_by_email: Optional[str] = None
    previous_completion_note: Optional[str] = None
    previous_completion_images: Optional[List[str]] = None
    calendar_event_id: Optional[str] = None
    completed_by: Optional[str] = None
    completed_by_name: Optional[str] = None
    attachments: Optional[List[dict]] = None
    auto_reminder: Optional[bool] = False
    shareable_token: Optional[str] = None
    comments: Optional[List[dict]] = []
    is_sales_task: Optional[bool] = False
    requires_screen_recording: Optional[bool] = False
    viewed_at: Optional[str] = None
    parent_id: Optional[str] = None
    is_parent: Optional[bool] = False
    child_count: Optional[int] = None
    success_criteria: Optional[str] = None
    blocked_reason: Optional[str] = None
    blocked_at: Optional[str] = None
    ai_review_summary: Optional[str] = None

class TaskAction(BaseModel):
    reason: Optional[str] = None
    message: Optional[str] = None
    proposed_due_date: Optional[str] = None

class TaskComplete(BaseModel):
    completion_note: Optional[str] = None
    completion_note_images: Optional[List[str]] = None

class BlockAction(BaseModel):
    reason: str

class ReviewAction(BaseModel):
    action: str  # "accept" or "send_back"
    feedback: Optional[str] = None

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    reset_code: str
    new_password: str

class TaskHubDashboard(BaseModel):
    assigned_to_me: List[TaskResponse]
    self_assigned: List[TaskResponse]
    assigned_by_me: List[TaskResponse]
    counts: dict
    subscription_tier: str
    task_limit_reached: bool

class AnalyticsQuery(BaseModel):
    start_date: str
    end_date: str

class AssigneeBreakdown(BaseModel):
    name: str
    email: str
    tasks_assigned: int
    tasks_completed: int
    tasks_pending: int
    completion_rate: float
    avg_completion_days: Optional[float] = None
    response_rate: float = 0.0
    avg_response_hours: Optional[float] = None

class AnalyticsResponse(BaseModel):
    assigned_to_others_count: int
    assigned_to_self_count: int
    received_from_others_count: int
    completed_count: int
    task_breakdown: dict
    assignee_breakdown: List[AssigneeBreakdown] = []

# Helper functions
def get_password_hash(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_pst_now():
    return datetime.now(PST)

def to_pst(dt_str: str):
    dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    return dt.astimezone(PST)

async def send_email_notification(to_email: str, subject: str, content: str):
    resend_key = os.getenv('RESEND_API_KEY')
    
    if not resend_key:
        logging.warning("Resend API key not configured, skipping email")
        return
    
    params = {
        "from": EMAIL_FROM,
        "to": [to_email],
        "subject": subject,
        "html": content
    }
    # Fast + resilient: 3 attempts with quick backoff (0.4s, 0.8s). Runs off the request
    # thread via to_thread so FastAPI stays non-blocking. Total worst-case ~1.2s of retry.
    last_err = None
    for attempt in range(3):
        try:
            email = await asyncio.to_thread(resend.Emails.send, params)
            logging.info(f"Email sent to {to_email}, id: {email.get('id') if isinstance(email, dict) else email}")
            return
        except Exception as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(0.4 * (attempt + 1))
    logging.error(f"Failed to send email to {to_email} after 3 attempts: {last_err}")


async def send_emails_concurrent(messages: list):
    """Fire multiple emails in parallel. messages = [(to, subject, html), ...]."""
    if not messages:
        return
    await asyncio.gather(*[send_email_notification(m[0], m[1], m[2]) for m in messages], return_exceptions=True)


async def check_and_send_reminders():
    """Background task to send auto-reminders for urgent/high priority tasks"""
    try:
        now = get_pst_now()
        # Find tasks with auto_reminder enabled, high/urgent priority, not completed, due within 24 hours
        tomorrow = now + timedelta(hours=24)
        
        tasks = await db.tasks.find({
            "auto_reminder": True,
            "priority": {"$in": ["High", "Urgent"]},
            "status": {"$nin": ["Completed", "Declined", "Draft"]},
            "deleted": {"$ne": True},
            "due_date": {"$lte": tomorrow.isoformat()},
            "last_reminder_sent": {"$not": {"$gte": (now - timedelta(hours=12)).isoformat()}}  # Don't spam
        }, {"_id": 0}).to_list(100)
        
        app_url = APP_BASE_URL
        for task in tasks:
            assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
            if assignee:
                email_content = f"""
                <html>
                    <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                        <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">⚠️ Task Reminder</h1>
                        </div>
                        <div style="padding: 40px 30px; background: white;">
                            <p style="font-size: 16px; color: #374151;">Hi {assignee['name']},</p>
                            <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                                This is a reminder about your <strong>{task['priority']}</strong> priority task:
                            </p>
                            <div style="background: #FEF2F2; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #EF4444;">
                                <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{task['title']}</h2>
                                <p style="color: #6B7280; margin: 0 0 15px 0;">Due: <strong>{task['due_date'].replace('T', ' at ').split('.')[0]}</strong></p>
                            </div>
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="{app_url}/task/{task['id']}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                    View Task
                                </a>
                            </div>
                        </div>
                    </body>
                </html>
                """
                await send_email_notification(assignee["email"], f"Reminder: {task['title']}", email_content)
                
                # Update last reminder time
                await db.tasks.update_one(
                    {"id": task["id"]},
                    {"$set": {"last_reminder_sent": now.isoformat()}}
                )
    except Exception as e:
        logging.error(f"Error in check_and_send_reminders: {e}")


def resolve_assignee_name(task: dict, user_map: dict) -> str:
    """Resolve an assignee's display name, gracefully handling not-yet-registered
    (placeholder) email assignments so we never show a bare 'Unknown'."""
    name = user_map.get(task.get("assigned_to"))
    if name:
        return name
    at = task.get("assigned_to") or ""
    if at.startswith("email_"):
        return task.get("assigned_to_email") or at[6:]
    return task.get("assigned_to_email") or "Unknown"


# Auth Routes
@api_router.post("/auth/register", response_model=dict)
async def register(user: UserCreate, background_tasks: BackgroundTasks):
    # Check if email already exists
    existing = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Extract company domain
    company_domain = user.email.split('@')[1]
    
    # Check if there's a team owner with this domain
    team_owner = await db.users.find_one({
        "company_domain": company_domain,
        "subscription_tier": "teams",
        "is_team_owner": True
    }, {"_id": 0})

    # Check admin access grants (silent free Pro/Teams for specific emails or whole domains)
    grant = await db.access_grants.find_one({"type": "email", "value": user.email.lower()}, {"_id": 0})
    if not grant:
        grant = await db.access_grants.find_one({"type": "domain", "value": "@" + company_domain}, {"_id": 0})

    # Determine subscription tier
    is_team_owner = False
    team_owner_email = None
    granted_access = False
    if team_owner:
        # Auto-enroll in team if team owner exists
        subscription_tier = "teams"
        team_owner_email = team_owner["email"]
    elif grant:
        # Silent free access granted by admin (by email or company domain)
        subscription_tier = grant["plan"]
        granted_access = True
    else:
        # New user, starts on free
        subscription_tier = "free"
    
    # Generate verification code
    verification_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "password_hash": get_password_hash(user.password),
        "subscription_tier": subscription_tier,
        "company_domain": company_domain,
        "email_verified": False,
        "verification_code": verification_code,
        "is_team_owner": is_team_owner,
        "team_owner_email": team_owner_email,
        "granted_access": granted_access,
        "last_active": get_pst_now().isoformat(),
        "created_at": get_pst_now().isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Link any tasks that were assigned to this email before they registered
    # Use case-insensitive matching for email placeholder
    placeholder_id = f"email_{user.email}"
    placeholder_id_lower = f"email_{user.email.lower()}"
    await db.tasks.update_many(
        {"$or": [
            {"assigned_to": placeholder_id},
            {"assigned_to": placeholder_id_lower},
            {"assigned_to": {"$regex": f"^email_{user.email}$", "$options": "i"}}
        ]},
        {"$set": {"assigned_to": user_id, "assigned_to_name": user.name}}
    )
    
    # Always send verification email via Resend
    app_url = APP_BASE_URL
    email_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Tskflow</h1>
                <p style="color: rgba(255,255,255,0.9); margin-top: 10px;">Your task management journey begins here</p>
            </div>
            <div style="padding: 40px 30px; background: white;">
                <p style="font-size: 16px; color: #374151;">Hi {user.name},</p>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Thank you for registering with Tskflow. To complete your account setup, please use the verification code below:
                </p>
                <div style="background: #F3F4F6; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                    <p style="font-size: 14px; color: #6B7280; margin: 0 0 10px 0;">Your Verification Code</p>
                    <p style="font-size: 36px; font-weight: 700; color: #4F46E5; margin: 0; letter-spacing: 4px;">{verification_code}</p>
                </div>
                <p style="font-size: 14px; color: #6B7280; line-height: 1.6;">
                    This code will expire in 24 hours. If you didn't create an account with Tskflow, please disregard this email.
                </p>
                <div style="margin-top: 30px; text-align: center;">
                    <a href="{app_url}/verify-email" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                        Verify Your Account
                    </a>
                </div>
            </div>
            <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
                    © 2025 Tskflow. All rights reserved.
                </p>
            </div>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, user.email, "Verify your Tskflow account", email_content)
    
    return {"message": "Registration successful. Verification code sent to your email.", "verification_code": None, "user_id": user_id}

@api_router.post("/auth/verify-email", response_model=TokenResponse)
async def verify_email(request: EmailVerifyRequest):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user["verification_code"] != request.verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Mark email as verified
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"email_verified": True}, "$unset": {"verification_code": ""}}
    )
    
    # Create token
    access_token = create_access_token(data={"sub": user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            subscription_tier=user["subscription_tier"],
            email_verified=True,
            is_team_owner=user.get("is_team_owner", False),
            team_owner_email=user.get("team_owner_email"),
            google_calendar_connected=user.get("google_calendar_connected", False),
            google_sheets_connected=user.get("google_sheets_connected", False),
            preferences=user.get("preferences") or {},
            reports_to=user.get("reports_to"),
            company_domain=user.get("company_domain"),
        )
    )

@api_router.post("/auth/resend-verification")
async def resend_verification(email: EmailStr, background_tasks: BackgroundTasks):
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    
    # Generate new code
    verification_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    await db.users.update_one({"email": email}, {"$set": {"verification_code": verification_code}})
    
    # Send email via Resend
    app_url = APP_BASE_URL
    email_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Tskflow</h1>
                <p style="color: rgba(255,255,255,0.9); margin-top: 10px;">Email Verification</p>
            </div>
            <div style="padding: 40px 30px; background: white;">
                <p style="font-size: 16px; color: #374151;">Hi {user.get('name', 'there')},</p>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Here is your new verification code:
                </p>
                <div style="background: #F3F4F6; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                    <p style="font-size: 36px; font-weight: 700; color: #4F46E5; margin: 0; letter-spacing: 4px;">{verification_code}</p>
                </div>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="{app_url}/verify-email" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                        Verify Your Account
                    </a>
                </div>
            </div>
            <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 Tskflow. All rights reserved.</p>
            </div>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, email, "Your Tskflow Verification Code", email_content)
    return {"message": "Verification code sent to your email"}

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email}, {"_id": 0})
    
    # Check if user exists first
    if not db_user:
        raise HTTPException(status_code=401, detail="No account found with this email. Please sign up first.")
    
    # Then check password
    if not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password")
    
    if not db_user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your email first.")
    
    access_token = create_access_token(data={"sub": db_user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=db_user["id"],
            name=db_user["name"],
            email=db_user["email"],
            subscription_tier=db_user["subscription_tier"],
            email_verified=db_user["email_verified"],
            is_team_owner=db_user.get("is_team_owner", False),
            team_owner_email=db_user.get("team_owner_email"),
            google_calendar_connected=db_user.get("google_calendar_connected", False),
            google_sheets_connected=db_user.get("google_sheets_connected", False),
            preferences=db_user.get("preferences") or {},
            reports_to=db_user.get("reports_to"),
            company_domain=db_user.get("company_domain"),
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        subscription_tier=current_user["subscription_tier"],
        email_verified=current_user["email_verified"],
        is_team_owner=current_user.get("is_team_owner", False),
        team_owner_email=current_user.get("team_owner_email"),
        google_calendar_connected=current_user.get("google_calendar_connected", False),
        google_sheets_connected=current_user.get("google_sheets_connected", False),
        preferences=current_user.get("preferences") or {},
        reports_to=current_user.get("reports_to"),
        company_domain=current_user.get("company_domain"),
    )

class UpdateProfileRequest(BaseModel):
    name: str

@api_router.put("/auth/profile")
async def update_profile(request: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    if not request.name or len(request.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"name": request.name.strip()}}
    )
    
    return {"message": "Profile updated", "name": request.name.strip()}

@api_router.delete("/auth/deactivate")
async def deactivate_account(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Cancel Stripe subscription if exists
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if stripe_key and current_user.get("subscription_tier") in ["pro", "teams"]:
        try:
            import stripe
            stripe.api_key = stripe_key
            customers = stripe.Customer.list(email=current_user["email"], limit=1)
            if customers.data:
                subs = stripe.Subscription.list(customer=customers.data[0].id, status="active")
                for sub in subs.data:
                    stripe.Subscription.cancel(sub.id)
        except:
            pass
    
    # Delete user's tasks
    await db.tasks.delete_many({"$or": [{"created_by": user_id}, {"assigned_to": user_id}]})
    
    # Delete user
    await db.users.delete_one({"id": user_id})
    
    return {"message": "Account deactivated"}

@api_router.post("/auth/forgot-password")
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user:
        return {"message": "If the email exists, a reset code has been sent", "reset_code": None}
    
    reset_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    expiration = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.password_resets.insert_one({
        "email": request.email,
        "reset_code": reset_code,
        "expires_at": expiration.isoformat(),
        "used": False
    })
    
    resend_key = os.getenv('RESEND_API_KEY')
    
    if resend_key:
        email_content = f"""
        <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>Your password reset code is: <strong>{reset_code}</strong></p>
                <p>This code will expire in 15 minutes.</p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, request.email, "Password Reset Code", email_content)
        return {"message": "Reset code sent to your email", "reset_code": None}
    else:
        return {"message": "Email not configured. Use this reset code", "reset_code": reset_code}

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    reset_doc = await db.password_resets.find_one({
        "email": request.email,
        "reset_code": request.reset_code,
        "used": False
    }, {"_id": 0})
    
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    
    expires_at = datetime.fromisoformat(reset_doc["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset code has expired")
    
    new_hash = get_password_hash(request.new_password)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"password_hash": new_hash}}
    )
    
    await db.password_resets.update_one(
        {"email": request.email, "reset_code": request.reset_code},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password reset successful"}

# Task Routes
@api_router.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    # Free tier: no hard limit, only soft nudges handled in frontend
    
    # Generate these early as they're needed in multiple places
    task_id = str(uuid.uuid4())
    invite_token = str(uuid.uuid4())[:8]
    app_url = APP_BASE_URL
    
    # Handle email-based assignment or user ID
    if task.assigned_to == "self":
        assigned_user = current_user
        assigned_to_id = current_user["id"]
        assigned_to_email = current_user["email"]
        is_self_assigned = True
    elif "@" in task.assigned_to:
        # Email-based assignment
        assigned_to_email = task.assigned_to
        existing_user = await db.users.find_one({"email": assigned_to_email}, {"_id": 0})
        
        if existing_user:
            assigned_user = existing_user
            assigned_to_id = existing_user["id"]
            is_self_assigned = (assigned_to_id == current_user["id"])
        else:
            # Non-registered user - create placeholder
            assigned_user = {"name": assigned_to_email.split('@')[0].title(), "email": assigned_to_email}
            assigned_to_id = f"email_{assigned_to_email}"
            is_self_assigned = False
    else:
        assigned_user = await db.users.find_one({"id": task.assigned_to}, {"_id": 0})
        if not assigned_user:
            raise HTTPException(status_code=404, detail="Assigned user not found")
        
        assigned_to_id = task.assigned_to
        assigned_to_email = assigned_user["email"]
        is_self_assigned = (assigned_to_id == current_user["id"])
        
        # For Teams tier, enforce domain restriction
        if current_user["subscription_tier"] == "teams":
            if assigned_user["company_domain"] != current_user["company_domain"]:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Teams plan: Can only assign tasks to users from your company domain ({current_user['company_domain']})"
                )
    
    # Save assigned email for future use
    if assigned_to_email and not is_self_assigned:
        await db.user_contacts.update_one(
            {"user_id": current_user["id"], "contact_email": assigned_to_email},
            {"$set": {
                "user_id": current_user["id"],
                "contact_email": assigned_to_email,
                "contact_name": assigned_user.get("name", assigned_to_email),
                "last_used": get_pst_now().isoformat()
            }},
            upsert=True
        )
    
    # Auto-accept self-assigned tasks
    initial_status = "Accepted" if is_self_assigned else "Pending"
    accepted_at = get_pst_now().isoformat() if is_self_assigned else None
    
    task_doc = {
        "id": task_id,
        "title": task.title,
        "description": task.description or "",
        "assigned_to": assigned_to_id,
        "assigned_to_email": assigned_to_email,
        "created_by": current_user["id"],
        "due_date": task.due_date,
        "status": initial_status,
        "priority": task.priority,
        "category": task.category,
        "note": task.note,
        "note_images": task.note_images,
        "created_at": get_pst_now().isoformat(),
        "accepted_at": accepted_at,
        "completed_at": None,
        "reason_for_decline": None,
        "counter_proposal_message": None,
        "proposed_due_date": None,
        "completion_note": None,
        "completion_note_images": None,
        "review_pending_at": None,
        "review_feedback": None,
        "invite_token": invite_token,
        "attachments": task.attachments or None,
        "auto_reminder": task.auto_reminder or False,
        "shareable_token": str(uuid.uuid4())[:12],
        "comments": [],
        "requires_screen_recording": task.requires_screen_recording or False,
        "is_sales_task": bool(task.is_sales_task) or _text_looks_like_sales(f"{task.title or ''} {task.description or ''}"),
        "success_criteria": (task.success_criteria or "").strip() or None,
        "viewed_at": None
    }
    if task_doc["is_sales_task"] and (not task_doc.get("category") or str(task_doc.get("category")).strip().lower() in ("", "general", "other", "none")):
        task_doc["category"] = "Sales"
    
    await db.tasks.insert_one(task_doc)
    
    # Send professional email notification if assigning to others
    if not is_self_assigned and assigned_to_id:
        recipient_email = assigned_user.get("email") or assigned_to_email
        recipient_name = assigned_user.get("name", "there")
        
        email_content = f"""
        <html>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">New Task Assignment</h1>
                </div>
                <div style="padding: 40px 30px; background: white;">
                    <p style="font-size: 16px; color: #374151;">Hi {recipient_name},</p>
                    <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                        You have been assigned a new task by <strong>{current_user['name']}</strong>. Please review the details below and take appropriate action.
                    </p>
                    <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #4F46E5;">
                        <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{task.title}</h2>
                        <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{(task.description or '')[:300]}{'...' if task.description and len(task.description) > 300 else ''}</p>
                        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                            <div style="background: {'#FEF3C7' if task.priority in ['High', 'Urgent'] else '#E0E7FF'}; color: {'#92400E' if task.priority in ['High', 'Urgent'] else '#4338CA'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                                {task.priority} Priority
                            </div>
                            <div style="color: #6B7280; font-size: 14px; padding: 6px 0;">
                                Due: {task.due_date.replace('T', ' at ').split('.')[0]}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{app_url}/invite?token={invite_token}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            View Task in Tskflow
                        </a>
                    </div>
                    <p style="font-size: 13px; color: #9CA3AF; margin-top: 25px; text-align: center;">
                        You can accept, decline, or propose a new deadline directly from Tskflow.
                    </p>
                </div>
                <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                    <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
                        © 2025 Tskflow. All rights reserved.
                    </p>
                </div>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, recipient_email, f"New Task: {task.title}", email_content)
        # Background browser push (if the assignee is a registered user with a subscription)
        if assigned_to_id and not str(assigned_to_id).startswith("email_"):
            background_tasks.add_task(send_web_push, assigned_to_id, f"New task from {current_user['name']}", task.title, f"/task/{task_id}")
    
    return TaskResponse(
        id=task_id,
        title=task.title,
        description=task.description,
        assigned_to=assigned_to_id,
        assigned_to_name=assigned_user.get("name", assigned_to_email),
        created_by=current_user["id"],
        created_by_name=current_user["name"],
        due_date=task.due_date,
        status=initial_status,
        priority=task.priority,
        category=task.category,
        created_at=task_doc["created_at"],
        accepted_at=accepted_at,
        note=task.note,
        note_images=task.note_images,
        invite_token=invite_token,
        is_sales_task=bool(task_doc.get("is_sales_task")),
        requires_screen_recording=task.requires_screen_recording or False,
        success_criteria=(task.success_criteria or "").strip() or None,
    )

@api_router.post("/tasks/bulk", response_model=List[TaskResponse])
async def create_bulk_tasks(task: BulkTaskCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create the same task for multiple assignees at once"""
    # Free tier: no hard limit, only soft nudges handled in frontend
    
    created_tasks = []
    # When assigning to 2+ people, group them under a collapsible parent task
    is_multi = len([a for a in task.assigned_to]) > 1
    parent_id = str(uuid.uuid4()) if is_multi else None
    child_ids = []
    
    for assignee in task.assigned_to:
        task_id = str(uuid.uuid4())
        assigned_to_id = assignee
        assigned_to_email = None
        assigned_user = None
        is_self_assigned = False
        initial_status = "Pending"
        accepted_at = None
        
        # Handle "self" assignment
        if assignee == "self" or assignee == current_user["id"]:
            assigned_to_id = current_user["id"]
            assigned_user = current_user
            is_self_assigned = True
            initial_status = "Accepted"
            accepted_at = get_pst_now().isoformat()
        # Handle email assignment
        elif '@' in assignee:
            assigned_to_email = assignee
            existing_user = await db.users.find_one({"email": assignee}, {"_id": 0})
            if existing_user:
                assigned_to_id = existing_user["id"]
                assigned_user = existing_user
            else:
                assigned_to_id = f"email_{assignee}"
                assigned_user = {"name": assignee.split('@')[0], "email": assignee}
        else:
            # Handle user ID assignment
            assigned_user = await db.users.find_one({"id": assignee}, {"_id": 0})
            if not assigned_user:
                continue  # Skip invalid user IDs
        
        invite_token = str(uuid.uuid4())[:8]
        task_doc = {
            "id": task_id,
            "title": task.title,
            "description": task.description,
            "assigned_to": assigned_to_id,
            "created_by": current_user["id"],
            "due_date": task.due_date,
            "status": initial_status,
            "priority": task.priority,
            "category": task.category,
            "created_at": get_pst_now().isoformat(),
            "accepted_at": accepted_at,
            "invite_token": invite_token,
            "parent_id": parent_id,
            "assigned_to_email": assigned_to_email,
            "attachments": task.attachments or None,
            "is_sales_task": bool(task.is_sales_task) or _text_looks_like_sales(f"{task.title or ''} {task.description or ''}"),
            "requires_screen_recording": task.requires_screen_recording or False,
            "success_criteria": (task.success_criteria or "").strip() or None,
        }
        if task_doc["is_sales_task"] and (not task_doc.get("category") or str(task_doc.get("category")).strip().lower() in ("", "general", "other", "none")):
            task_doc["category"] = "Sales"
        
        await db.tasks.insert_one(task_doc)
        child_ids.append(task_id)
        
        # Send professional email notification if assigning to others
        app_url = APP_BASE_URL
        if not is_self_assigned:
            email_to_send = assigned_user.get("email") if assigned_user else assigned_to_email
            recipient_name = assigned_user.get("name", "there") if assigned_user else assigned_to_email.split('@')[0]
            if email_to_send:
                email_content = f"""
                <html>
                    <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                        <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">New Task Assignment</h1>
                        </div>
                        <div style="padding: 40px 30px; background: white;">
                            <p style="font-size: 16px; color: #374151;">Hi {recipient_name},</p>
                            <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                                You have been assigned a new task by <strong>{current_user['name']}</strong>. Please review the details below.
                            </p>
                            <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #4F46E5;">
                                <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{task.title}</h2>
                                <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{(task.description or '')[:300]}{'...' if task.description and len(task.description) > 300 else ''}</p>
                                <div>
                                    <span style="background: {'#FEF3C7' if task.priority in ['High', 'Urgent'] else '#E0E7FF'}; color: {'#92400E' if task.priority in ['High', 'Urgent'] else '#4338CA'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-right: 10px;">
                                        {task.priority} Priority
                                    </span>
                                    <span style="color: #6B7280; font-size: 14px;">Due: {task.due_date.replace('T', ' at ').split('.')[0]}</span>
                                </div>
                            </div>
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="{app_url}/invite?token={invite_token}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                    View Task in Tskflow
                                </a>
                            </div>
                        </div>
                        <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 Tskflow. All rights reserved.</p>
                        </div>
                    </body>
                </html>
                """
                background_tasks.add_task(send_email_notification, email_to_send, f"New Task: {task.title}", email_content)
                if not str(assigned_to_id).startswith("email_"):
                    background_tasks.add_task(send_web_push, assigned_to_id, f"New task from {current_user['name']}", task.title, f"/task/{task_id}")
        
        created_tasks.append(TaskResponse(
            id=task_id,
            title=task.title,
            description=task.description,
            assigned_to=assigned_to_id,
            assigned_to_name=assigned_user.get("name", assigned_to_email or "Unknown"),
            created_by=current_user["id"],
            created_by_name=current_user["name"],
            due_date=task.due_date,
            status=initial_status,
            priority=task.priority,
            category=task.category,
            created_at=task_doc["created_at"],
            accepted_at=accepted_at,
            is_sales_task=bool(task_doc.get("is_sales_task")),
            requires_screen_recording=task.requires_screen_recording or False,
            success_criteria=(task.success_criteria or "").strip() or None,
        ))
    
    # Persist the parent container for multi-assignee tasks
    if parent_id and child_ids:
        await db.tasks.insert_one({
            "id": parent_id,
            "is_parent": True,
            "title": task.title,
            "description": task.description,
            "created_by": current_user["id"],
            "assigned_to": current_user["id"],
            "due_date": task.due_date,
            "status": "Parent",
            "priority": task.priority,
            "category": task_doc.get("category") or task.category,
            "is_sales_task": bool(task_doc.get("is_sales_task")),
            "success_criteria": (task.success_criteria or "").strip() or None,
            "child_count": len(child_ids),
            "created_at": get_pst_now().isoformat()
        })
    
    return created_tasks

# ---- Multi-assignee parent task groups ----

@api_router.get("/tasks/parents")
async def get_parent_task_groups(current_user: dict = Depends(get_current_user), status_filter: str = "active"):
    """Return multi-assignee task groups created by the current user, with
    per-assignee status and overall completion percentage.
    status_filter: 'active' or 'completed'
    """
    parents = await db.tasks.find(
        {"is_parent": True, "created_by": current_user["id"], "deleted": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    if not parents:
        return []

    parent_ids = [p["id"] for p in parents]
    children = await db.tasks.find(
        {"parent_id": {"$in": parent_ids}, "deleted": {"$ne": True}},
        {"_id": 0}
    ).to_list(5000)

    # Resolve assignee names
    user_ids = list({c["assigned_to"] for c in children if not str(c["assigned_to"]).startswith("email_")})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(user_ids)) if user_ids else []
    user_map = {u["id"]: u["name"] for u in users}

    result = []
    for p in parents:
        kids = [c for c in children if c.get("parent_id") == p["id"]]
        done = [c for c in kids if c["status"] == "Completed"]
        total = len(kids)
        if total == 0:
            continue  # skip empty groups (all children deleted)
        percent = round(len(done) / total * 100) if total else 0
        
        # Filter based on completion status
        is_completed = percent == 100
        if status_filter == "completed" and not is_completed:
            continue
        if status_filter == "active" and is_completed:
            continue
        
        assignees = []
        for c in kids:
            # Calculate if this assignee is consistently on-time
            # Check their completion history across all tasks
            assignee_id = c["assigned_to"]
            is_consistent_performer = False
            
            if c["status"] == "Completed":
                # Check if completed on time
                try:
                    due = datetime.fromisoformat(c["due_date"].replace('Z', '+00:00'))
                    completed = datetime.fromisoformat(c.get("completed_at", c["due_date"]).replace('Z', '+00:00'))
                    is_consistent_performer = completed <= due
                except:
                    pass
            
            assignees.append({
                "task_id": c["id"],
                "name": resolve_assignee_name(c, user_map),
                "email": c.get("assigned_to_email"),
                "status": c["status"],
                "completed": c["status"] == "Completed",
                "completed_by_name": c.get("completed_by_name"),
                "is_consistent": is_consistent_performer,
                "is_sales_task": bool(c.get("is_sales_task")) or str(c.get("category") or "").strip().lower() == "sales",
            })
        
        # Sort assignees: consistent performers at bottom, those needing attention at top
        # Priority: Not started > Late > In progress > Completed on time
        def sort_key(a):
            if a["status"] == "Pending":
                return 0  # Highest priority - not started
            elif a["status"] in ["Counter-Proposed", "Declined"]:
                return 1  # Needs attention
            elif a["status"] == "Accepted":
                return 2  # Working on it
            elif a["status"] == "Review Pending":
                return 3  # Waiting for review
            elif a["completed"] and not a["is_consistent"]:
                return 4  # Completed but late
            elif a["completed"] and a["is_consistent"]:
                return 5  # Completed on time - deprioritize
            return 2
        
        assignees.sort(key=sort_key)
        
        result.append({
            "id": p["id"],
            "title": p["title"],
            "description": p["description"],
            "priority": p.get("priority"),
            "due_date": p["due_date"],
            "created_at": p["created_at"],
            "total": total,
            "completed": len(done),
            "outstanding": total - len(done),
            "percent": percent,
            "assignees": assignees,
            "children": assignees,
            "is_sales_task": (
                bool(p.get("is_sales_task"))
                or str(p.get("category") or "").strip().lower() == "sales"
                or any(a.get("is_sales_task") for a in assignees)
            ),
        })
    return result

@api_router.get("/tasks/parents/{parent_id}/subtasks")
async def get_parent_subtasks(parent_id: str, current_user: dict = Depends(get_current_user)):
    """Return the list of sub-tasks (assignees) for a group task, with names."""
    parent = await db.tasks.find_one({"id": parent_id, "is_parent": True, "deleted": {"$ne": True}}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Group task not found")
    if parent.get("created_by") != current_user["id"] and current_user["id"] not in (parent.get("assigned_to_list") or []):
        # Allow access if the current user has a subtask in this group
        has_sub = await db.tasks.find_one({"parent_id": parent_id, "assigned_to": current_user["id"], "deleted": {"$ne": True}})
        if not has_sub:
            raise HTTPException(status_code=403, detail="Access denied")
    subs = await db.tasks.find({"parent_id": parent_id, "deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
    # Enrich with assignee names
    user_ids = list({s.get("assigned_to") for s in subs if s.get("assigned_to")})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(len(user_ids) or 1)
    umap = {u["id"]: u for u in users}
    for s in subs:
        u = umap.get(s.get("assigned_to"), {})
        s["assigned_to_name"] = u.get("name", s.get("assigned_to_email") or "Unknown")
    return subs


@api_router.post("/tasks/parents/{parent_id}/remind")
async def remind_outstanding_assignees(parent_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Send a reminder email to everyone in the group who hasn't completed yet."""
    parent = await db.tasks.find_one({"id": parent_id, "is_parent": True, "created_by": current_user["id"]}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Task group not found")

    children = await db.tasks.find(
        {"parent_id": parent_id, "deleted": {"$ne": True}, "status": {"$ne": "Completed"}},
        {"_id": 0}
    ).to_list(5000)

    app_url = APP_BASE_URL
    messages = []
    for c in children:
        assignee = await db.users.find_one({"id": c["assigned_to"]}, {"_id": 0}) if not str(c["assigned_to"]).startswith("email_") else None
        email_to = (assignee or {}).get("email") or c.get("assigned_to_email")
        name = (assignee or {}).get("name") or (email_to.split('@')[0] if email_to else "there")
        if not email_to:
            continue
        content = f"""
        <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">Reminder</h1>
            </div>
            <div style="padding: 30px;">
                <p>Hi {name},</p>
                <p><strong>{current_user['name']}</strong> is waiting on this task: <strong>{parent['title']}</strong>.</p>
                <p>It's still outstanding — please take a look when you can.</p>
                <div style="text-align: center; margin-top: 20px;">
                    <a href="{app_url}/task/{c['id']}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 20px; text-decoration: none;">View Task</a>
                </div>
            </div>
        </body></html>
        """
        messages.append((email_to, f"Reminder: {parent['title']}", content))

    # Dispatch all reminders concurrently in the background so the API returns immediately
    background_tasks.add_task(send_emails_concurrent, messages)
    reminded = len(messages)

    now_iso = get_pst_now().isoformat()
    for c in children:
        try:
            assignee = await db.users.find_one({"id": c["assigned_to"]}, {"_id": 0}) if c.get("assigned_to") and not str(c["assigned_to"]).startswith("email_") else None
            email_to = (assignee or {}).get("email") or c.get("assigned_to_email")
            if not email_to:
                continue
            await log_task_activity(
                db,
                task_id=c["id"],
                event_type="reminder",
                channel="email",
                actor_id=current_user["id"],
                actor_name=current_user.get("name"),
                recipient_id=c.get("assigned_to"),
                recipient_name=(assignee or {}).get("name"),
                recipient_email=email_to,
                company_domain=current_user.get("company_domain"),
                title="Group reminder",
                body=f"Reminder for outstanding group task: {parent.get('title')}",
                meta={"parent_id": parent_id, "source": "group_remind"},
                created_at=now_iso,
            )
        except Exception as e:
            logging.warning(f"Failed to log group reminder activity: {e}")

    return {"message": f"Reminder sent to {reminded} outstanding assignee(s)", "reminded": reminded}


class AssigneesAddRequest(BaseModel):
    assignees: List[str] = []


@api_router.post("/tasks/parents/{parent_id}/assignees")
async def add_assignees_to_parent(parent_id: str, body: AssigneesAddRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Add one or more assignees (by user_id OR email) to an existing group/parent task.

    Creates one subtask per new assignee (same title/desc/due/priority as parent).
    Skips duplicates (any assignee id/email that already has a subtask under this parent).
    """
    parent = await db.tasks.find_one({"id": parent_id, "is_parent": True, "created_by": current_user["id"], "deleted": {"$ne": True}}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Task group not found")

    existing = await db.tasks.find({"parent_id": parent_id, "deleted": {"$ne": True}}, {"_id": 0, "assigned_to": 1, "assigned_to_email": 1}).to_list(5000)
    existing_ids = {e.get("assigned_to") for e in existing}
    existing_emails = {(e.get("assigned_to_email") or "").lower() for e in existing if e.get("assigned_to_email")}

    added_ids = []
    for raw in (body.assignees or []):
        assignee = (raw or "").strip()
        if not assignee:
            continue
        assigned_to_id = None
        assigned_to_email = None
        assigned_user = None
        # Detect email vs user id
        if "@" in assignee:
            if assignee.lower() in existing_emails:
                continue
            assigned_user = await db.users.find_one({"email": assignee}, {"_id": 0})
            if assigned_user:
                if assigned_user["id"] in existing_ids:
                    continue
                assigned_to_id = assigned_user["id"]
                assigned_to_email = assigned_user["email"]
            else:
                assigned_to_id = f"email_{uuid.uuid4()}"
                assigned_to_email = assignee
        else:
            if assignee in existing_ids:
                continue
            assigned_user = await db.users.find_one({"id": assignee}, {"_id": 0})
            if not assigned_user:
                continue
            assigned_to_id = assigned_user["id"]
            assigned_to_email = assigned_user["email"]

        task_id = str(uuid.uuid4())
        invite_token = str(uuid.uuid4())
        shareable_token = str(uuid.uuid4())[:12]
        initial_status = "Pending"
        accepted_at = None
        is_self = assigned_to_id == current_user["id"]
        if is_self:
            initial_status = "Accepted"
            accepted_at = get_pst_now().isoformat()

        subtask = {
            "id": task_id,
            "parent_id": parent_id,
            "title": parent.get("title") or "",
            "description": parent.get("description") or "",
            "assigned_to": assigned_to_id,
            "assigned_to_email": assigned_to_email,
            "created_by": current_user["id"],
            "due_date": parent.get("due_date"),
            "status": initial_status,
            "priority": parent.get("priority", "Medium"),
            "category": parent.get("category"),
            "created_at": get_pst_now().isoformat(),
            "accepted_at": accepted_at,
            "invite_token": invite_token,
            "shareable_token": shareable_token,
        }
        await db.tasks.insert_one(subtask)
        added_ids.append(task_id)
        existing_ids.add(assigned_to_id)
        if assigned_to_email:
            existing_emails.add(assigned_to_email.lower())

        if not is_self and assigned_to_email:
            recipient_name = (assigned_user or {}).get("name") or assigned_to_email.split('@')[0]
            content = f"""
            <html><body style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
                <div style=\"background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; text-align: center;\"><h1 style=\"color:white;margin:0;\">You've been added to a task</h1></div>
                <div style=\"padding: 30px;\">
                    <p>Hi {recipient_name},</p>
                    <p><strong>{current_user['name']}</strong> added you to the task <strong>{parent.get('title','')}</strong>.</p>
                    <div style=\"text-align:center;margin-top:20px;\"><a href=\"{APP_BASE_URL}/invite?token={invite_token}\" style=\"background:#4F46E5;color:white;padding:12px 24px;border-radius:20px;text-decoration:none;\">Open task</a></div>
                </div>
            </body></html>
            """
            background_tasks.add_task(send_email_notification, assigned_to_email, f"Added to task: {parent.get('title','')}", content)

    # Bump child_count on the parent
    if added_ids:
        await db.tasks.update_one({"id": parent_id}, {"$inc": {"child_count": len(added_ids)}})

    return {"added": len(added_ids), "subtask_ids": added_ids}


@api_router.delete("/tasks/parents/{parent_id}/assignees/{subtask_id}")
async def remove_assignee_from_parent(parent_id: str, subtask_id: str, current_user: dict = Depends(get_current_user)):
    """Remove an assignee from a group task by soft-deleting their subtask."""
    parent = await db.tasks.find_one({"id": parent_id, "is_parent": True, "created_by": current_user["id"], "deleted": {"$ne": True}}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Task group not found")
    sub = await db.tasks.find_one({"id": subtask_id, "parent_id": parent_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subtask not found")
    await db.tasks.update_one({"id": subtask_id}, {"$set": {"deleted": True, "deleted_at": get_pst_now().isoformat()}})
    await db.tasks.update_one({"id": parent_id}, {"$inc": {"child_count": -1}})
    return {"ok": True, "removed": subtask_id}


@api_router.get("/dashboard", response_model=TaskHubDashboard)
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    status_filter: str = "active",  # "active", "completed", "all"
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    # Build query filter
    query_filter = {}
    
    # For Teams tier, only show tasks within company domain
    if current_user["subscription_tier"] == "teams":
        # Get all users from same domain
        domain_users = await db.users.find(
            {"company_domain": current_user["company_domain"]}, 
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        domain_user_ids = [u["id"] for u in domain_users]
        user_map = {u["id"]: u["name"] for u in domain_users}
        
        query_filter["$or"] = [
            {"assigned_to": {"$in": domain_user_ids}},
            {"created_by": {"$in": domain_user_ids}}
        ]
    else:
        query_filter["$or"] = [
            {"assigned_to": current_user["id"]},
            {"created_by": current_user["id"]}
        ]
    
    # Exclude deleted tasks from normal views
    query_filter["deleted"] = {"$ne": True}
    # Exclude parent containers (multi-assignee groups are shown separately)
    query_filter["is_parent"] = {"$ne": True}
    
    # Apply status filter
    if status_filter == "active":
        query_filter["status"] = {"$ne": "Completed"}
    elif status_filter == "completed":
        query_filter["status"] = "Completed"
    # "all" means no status filter
    
    # Apply date range filter on due_date
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        if date_filter:
            query_filter["due_date"] = date_filter
    
    # Fetch tasks
    all_tasks = await db.tasks.find(query_filter, {"_id": 0}).to_list(1000)
    
    # For non-teams tier, build user map
    if current_user["subscription_tier"] != "teams":
        user_ids = set()
        for task in all_tasks:
            user_ids.add(task["assigned_to"])
            user_ids.add(task["created_by"])
        
        users = await db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(len(user_ids)) if user_ids else []
        user_map = {u["id"]: u["name"] for u in users}
    
    assigned_to_me = []
    self_assigned = []
    assigned_by_me = []
    
    for task in all_tasks:
        task_resp = TaskResponse(
            id=task["id"],
            title=task["title"],
            description=task["description"],
            assigned_to=task["assigned_to"],
            assigned_to_name=resolve_assignee_name(task, user_map),
            created_by=task["created_by"],
            created_by_name=user_map.get(task["created_by"], "Unknown"),
            due_date=task["due_date"],
            status=task["status"],
            priority=task["priority"],
            category=task.get("category"),
            created_at=task["created_at"],
            accepted_at=task.get("accepted_at"),
            completed_at=task.get("completed_at"),
            reason_for_decline=task.get("reason_for_decline"),
            counter_proposal_message=task.get("counter_proposal_message"),
            proposed_due_date=task.get("proposed_due_date"),
            calendar_event_id=task.get("calendar_event_id"),
            assigned_to_email=task.get("assigned_to_email"),
            created_by_email=task.get("created_by_email"),
            is_sales_task=bool(task.get("is_sales_task")) or str(task.get("category") or "").strip().lower() == "sales",
            requires_screen_recording=bool(task.get("requires_screen_recording")),
            parent_id=task.get("parent_id"),
            success_criteria=task.get("success_criteria"),
        )
        
        # Categorize tasks
        if task["assigned_to"] == current_user["id"] and task["created_by"] == current_user["id"]:
            self_assigned.append(task_resp)
        elif task["assigned_to"] == current_user["id"]:
            assigned_to_me.append(task_resp)
        elif task["created_by"] == current_user["id"]:
            # Children of a multi-assignee parent are shown grouped (via /tasks/parents),
            # so keep them out of the flat "delegated" list to avoid duplicates
            if not task.get("parent_id"):
                assigned_by_me.append(task_resp)
    
    # Check task limit (always count active tasks regardless of filter)
    active_count_query = {
        "created_by": current_user["id"],
        "status": {"$ne": "Completed"}
    }
    active_tasks = await db.tasks.count_documents(active_count_query)
    task_limit_reached = False  # No hard limit for free tier
    
    counts = {
        "assigned_to_me": len(assigned_to_me),
        "self_assigned": len(self_assigned),
        "assigned_by_me": len(assigned_by_me),
        "active_tasks": active_tasks
    }
    
    return TaskHubDashboard(
        assigned_to_me=assigned_to_me,
        self_assigned=self_assigned,
        assigned_by_me=assigned_by_me,
        counts=counts,
        subscription_tier=current_user["subscription_tier"],
        task_limit_reached=task_limit_reached
    )

# Deleted tasks endpoints - MUST be before /tasks/{task_id} to avoid route conflict
@api_router.get("/tasks/deleted")
async def get_deleted_tasks(current_user: dict = Depends(get_current_user)):
    three_days_ago = (get_pst_now() - timedelta(days=3)).isoformat()
    
    # Auto-purge tasks deleted more than 3 days ago
    await db.tasks.delete_many({
        "deleted": True,
        "deleted_at": {"$lt": three_days_ago}
    })
    
    # Fetch remaining deleted tasks
    deleted_tasks = await db.tasks.find({
        "deleted": True,
        "$or": [
            {"created_by": current_user["id"]},
            {"assigned_to": current_user["id"]}
        ]
    }, {"_id": 0}).to_list(100)
    
    # Get user names
    user_ids = set()
    for task in deleted_tasks:
        user_ids.add(task["assigned_to"])
        user_ids.add(task["created_by"])
    
    users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(user_ids)) if user_ids else []
    user_map = {u["id"]: u["name"] for u in users}
    
    return [{
        **task,
        "assigned_to_name": user_map.get(task["assigned_to"], "Unknown"),
        "created_by_name": user_map.get(task["created_by"], "Unknown")
    } for task in deleted_tasks]

# ===== DRAFT TASK ENDPOINTS =====
@api_router.post("/tasks/drafts", response_model=TaskResponse)
async def create_draft_task(task: DraftTaskCreate, current_user: dict = Depends(get_current_user)):
    """Auto-save a task draft"""
    task_id = str(uuid.uuid4())
    
    task_doc = {
        "id": task_id,
        "title": task.title or "",
        "description": task.description or "",
        "assigned_to": task.assigned_to or "",
        "assigned_to_email": None,
        "created_by": current_user["id"],
        "due_date": task.due_date or "",
        "status": "Draft",
        "priority": task.priority or "Medium",
        "category": task.category,
        "note": task.note,
        "note_images": task.note_images,
        "created_at": get_pst_now().isoformat(),
        "accepted_at": None,
        "completed_at": None,
        "invite_token": str(uuid.uuid4())[:8],
        "attachments": task.attachments or None,
        "auto_reminder": task.auto_reminder or False,
        "success_criteria": (task.success_criteria or "").strip() or None,
        "shareable_token": str(uuid.uuid4())[:12],
        "comments": []
    }
    
    await db.tasks.insert_one(task_doc)
    
    return TaskResponse(
        id=task_id,
        title=task_doc["title"],
        description=task_doc["description"],
        assigned_to=task_doc["assigned_to"],
        assigned_to_name="",
        created_by=current_user["id"],
        created_by_name=current_user["name"],
        due_date=task_doc["due_date"],
        status="Draft",
        priority=task_doc["priority"],
        category=task_doc["category"],
        created_at=task_doc["created_at"],
        shareable_token=task_doc["shareable_token"],
        success_criteria=task_doc.get("success_criteria"),
    )

@api_router.get("/tasks/drafts")
async def get_draft_tasks(current_user: dict = Depends(get_current_user)):
    """Get all draft tasks for current user"""
    drafts = await db.tasks.find({
        "created_by": current_user["id"],
        "status": "Draft",
        "deleted": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    return {"drafts": drafts}

@api_router.put("/tasks/drafts/{task_id}")
async def update_draft_task(task_id: str, task: DraftTaskCreate, current_user: dict = Depends(get_current_user)):
    """Update a draft task"""
    draft = await db.tasks.find_one({"id": task_id, "status": "Draft"}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    if draft["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {}
    if task.title is not None:
        update_data["title"] = task.title
    if task.description is not None:
        update_data["description"] = task.description
    if task.assigned_to is not None:
        update_data["assigned_to"] = task.assigned_to
    if task.due_date is not None:
        update_data["due_date"] = task.due_date
    if task.priority is not None:
        update_data["priority"] = task.priority
    if task.category is not None:
        update_data["category"] = task.category
    if task.note is not None:
        update_data["note"] = task.note
    if task.note_images is not None:
        update_data["note_images"] = task.note_images
    if task.attachments is not None:
        update_data["attachments"] = task.attachments
    if task.auto_reminder is not None:
        update_data["auto_reminder"] = task.auto_reminder
    if task.success_criteria is not None:
        update_data["success_criteria"] = (task.success_criteria or "").strip() or None
    
    update_data["updated_at"] = get_pst_now().isoformat()
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    return {"message": "Draft updated"}

@api_router.post("/tasks/drafts/{task_id}/complete", response_model=TaskResponse)
async def complete_draft_task(task_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Complete a draft task and convert it to a regular task"""
    draft = await db.tasks.find_one({"id": task_id, "status": "Draft"}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    if draft["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate required fields
    if not draft.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    if not draft.get("assigned_to"):
        raise HTTPException(status_code=400, detail="Assignee is required")
    if not draft.get("due_date"):
        raise HTTPException(status_code=400, detail="Due date is required")
    
    # Handle assignee resolution
    assigned_to = draft["assigned_to"]
    app_url = APP_BASE_URL
    
    if assigned_to == "self":
        assigned_user = current_user
        assigned_to_id = current_user["id"]
        assigned_to_email = current_user["email"]
        is_self_assigned = True
    elif "@" in assigned_to:
        assigned_to_email = assigned_to
        existing_user = await db.users.find_one({"email": assigned_to_email}, {"_id": 0})
        
        if existing_user:
            assigned_user = existing_user
            assigned_to_id = existing_user["id"]
            is_self_assigned = (assigned_to_id == current_user["id"])
        else:
            assigned_user = {"name": assigned_to_email.split('@')[0].title(), "email": assigned_to_email}
            assigned_to_id = f"email_{assigned_to_email}"
            is_self_assigned = False
    else:
        assigned_user = await db.users.find_one({"id": assigned_to}, {"_id": 0})
        if not assigned_user:
            raise HTTPException(status_code=404, detail="Assigned user not found")
        
        assigned_to_id = assigned_to
        assigned_to_email = assigned_user["email"]
        is_self_assigned = (assigned_to_id == current_user["id"])
    
    # Update draft to regular task
    initial_status = "Accepted" if is_self_assigned else "Pending"
    accepted_at = get_pst_now().isoformat() if is_self_assigned else None
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": initial_status,
            "accepted_at": accepted_at,
            "assigned_to": assigned_to_id,
            "assigned_to_email": assigned_to_email,
            "completed_draft_at": get_pst_now().isoformat()
        }}
    )
    
    # Send email if not self-assigned
    if not is_self_assigned:
        recipient_email = assigned_user.get("email") or assigned_to_email
        recipient_name = assigned_user.get("name", "there")
        
        email_content = f"""
        <html>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">New Task Assignment</h1>
                </div>
                <div style="padding: 40px 30px; background: white;">
                    <p style="font-size: 16px; color: #374151;">Hi {recipient_name},</p>
                    <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                        You have been assigned a new task by <strong>{current_user['name']}</strong>.
                    </p>
                    <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #4F46E5;">
                        <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{draft['title']}</h2>
                        <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{draft.get('description', '')[:300]}</p>
                        <div style="color: #6B7280; font-size: 14px;">
                            Due: {draft['due_date'].replace('T', ' at ').split('.')[0]}
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{app_url}/invite?token={draft['invite_token']}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            View Task in Tskflow
                        </a>
                    </div>
                </div>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, recipient_email, f"New Task: {draft['title']}", email_content)
    
    # Return updated task
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return TaskResponse(
        id=updated_task["id"],
        title=updated_task["title"],
        description=updated_task["description"],
        assigned_to=updated_task["assigned_to"],
        assigned_to_name=assigned_user.get("name", ""),
        created_by=current_user["id"],
        created_by_name=current_user["name"],
        due_date=updated_task["due_date"],
        status=updated_task["status"],
        priority=updated_task["priority"],
        category=updated_task.get("category"),
        created_at=updated_task["created_at"],
        accepted_at=updated_task.get("accepted_at")
    )

# ===== TASK COMMENTS ENDPOINTS =====
@api_router.post("/tasks/{task_id}/comments")
async def add_task_comment(task_id: str, comment: TaskComment, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Add a comment to a task"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator and assignee can comment
    if task["created_by"] != current_user["id"] and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    comment_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "content": comment.content,
        "mentions": comment.mentions or [],
        "created_at": get_pst_now().isoformat()
    }
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$push": {"comments": comment_doc}}
    )

    try:
        await log_task_activity(
            db,
            task_id=task_id,
            event_type="chatter",
            channel="in_app",
            actor_id=current_user["id"],
            actor_name=current_user.get("name"),
            company_domain=current_user.get("company_domain") or task.get("company_domain"),
            title="Chatter message",
            body=comment.content,
            meta={"mentions": comment.mentions or [], "comment_id": comment_doc["id"]},
            created_at=comment_doc["created_at"],
        )
    except Exception as e:
        logging.warning(f"Failed to log chatter activity: {e}")
    
    # WebSocket: broadcast new comment to task creator + assignee (real-time chatter)
    try:
        recipients = {task.get("created_by"), task.get("assigned_to")} - {current_user["id"]}
        for uid in filter(None, recipients):
            await ws_manager.send(uid, {"event": "new_comment", "task_id": task_id, "comment": {k: v for k, v in comment_doc.items() if k != "_id"}})
    except Exception:
        pass

    # Send email + in-app notifications to mentioned users
    if comment.mentions:
        app_url = APP_BASE_URL
        for user_id in comment.mentions:
            mentioned_user = await db.users.find_one({"id": user_id}, {"_id": 0})
            if mentioned_user and mentioned_user["id"] != current_user["id"]:
                # In-app notification (bell) + browser push polling + WS live
                await create_notification(
                    user_id=mentioned_user["id"],
                    n_type="mention",
                    title=f"{current_user['name']} mentioned you",
                    body=f"In: {task['title']} — {comment.content[:120]}",
                    task_id=task_id,
                    actor_name=current_user["name"],
                )
                inner_html = f"""
                <h2 style="margin:0 0 8px;font-size:20px;">You were mentioned</h2>
                <p><strong>{current_user['name']}</strong> mentioned you in <strong>{task['title']}</strong>:</p>
                <blockquote style="border-left:4px solid #4F46E5;padding:12px 16px;background:#f5f6fb;border-radius:8px;color:#374151;margin:14px 0;">{comment.content}</blockquote>
                """
                email_html = _jarvis_email_shell(inner_html, cta_url=f"{app_url}/task/{task_id}", cta_label="View task")
                background_tasks.add_task(send_email_notification, mentioned_user["email"], f"Mentioned in: {task['title']}", email_html)
    
    return {"message": "Comment added", "comment": comment_doc}

@api_router.get("/tasks/{task_id}/comments")
async def get_task_comments(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get all comments for a task"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator and assignee can view comments
    if task["created_by"] != current_user["id"] and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {"comments": task.get("comments", [])}


async def _can_view_task_activity(task: dict, current_user: dict) -> bool:
    if not task:
        return False
    if task.get("created_by") == current_user["id"] or task.get("assigned_to") == current_user["id"]:
        return True
    if task.get("parent_id"):
        parent = await db.tasks.find_one({"id": task["parent_id"]}, {"_id": 0, "created_by": 1})
        if parent and parent.get("created_by") == current_user["id"]:
            return True
    domain = current_user.get("company_domain")
    if not domain:
        return False
    if task.get("company_domain") == domain:
        return True
    people = [
        uid for uid in (task.get("created_by"), task.get("assigned_to"))
        if uid and not str(uid).startswith("email_")
    ]
    if people:
        peer = await db.users.find_one(
            {"id": {"$in": people}, "company_domain": domain},
            {"_id": 0, "id": 1},
        )
        if peer:
            return True
    return False


@api_router.get("/tasks/{task_id}/activity")
async def get_task_activity(
    task_id: str,
    kind: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Activity feed for a task. kind=reminders|chatter|all"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await _can_view_task_activity(task, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    filt: Dict[str, Any] = {"task_id": task_id}
    k = (kind or "all").lower()
    if k in ("reminders", "reminder"):
        filt["event_type"] = {"$in": ["reminder", "nudge"]}
    elif k in ("chatter", "comments"):
        filt["event_type"] = "chatter"

    rows = await db.task_activity.find(filt, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Fallback: if reminders tab empty, surface last_smart_reminder_sent as a synthetic row
    if k in ("reminders", "reminder") and not rows and task.get("last_smart_reminder_sent"):
        rows = [{
            "id": "legacy-last-reminder",
            "task_id": task_id,
            "event_type": "reminder",
            "channel": "unknown",
            "actor_name": "Smart Reminders",
            "recipient_id": task.get("assigned_to"),
            "title": "Reminder sent",
            "body": task.get("title"),
            "created_at": task.get("last_smart_reminder_sent"),
            "meta": {"legacy": True},
        }]

    return {"activity": rows, "count": len(rows)}


@api_router.get("/activity")
async def list_org_activity(
    kind: Optional[str] = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    """Org / personal activity stream (reminders + chatter)."""
    limit = max(1, min(1000, int(limit or 200)))
    domain = current_user.get("company_domain")
    if domain:
        filt: Dict[str, Any] = {"company_domain": domain}
    else:
        # Personal: activity on tasks I created or own
        my_tasks = await db.tasks.find(
            {"$or": [{"created_by": current_user["id"]}, {"assigned_to": current_user["id"]}], "deleted": {"$ne": True}},
            {"_id": 0, "id": 1},
        ).to_list(2000)
        ids = [t["id"] for t in my_tasks]
        filt = {"task_id": {"$in": ids}} if ids else {"actor_id": current_user["id"]}

    k = (kind or "all").lower()
    if k in ("reminders", "reminder"):
        filt["event_type"] = {"$in": ["reminder", "nudge"]}
    elif k in ("chatter", "comments"):
        filt["event_type"] = "chatter"

    rows = await db.task_activity.find(filt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"activity": rows, "count": len(rows)}


@api_router.get("/activity/export")
async def export_activity_csv(
    current_user: dict = Depends(get_current_user),
):
    """Full task data log as CSV (assigner, assignee, times, reminders, chatter)."""
    domain = current_user.get("company_domain")
    if domain:
        task_q: Dict[str, Any] = {"company_domain": domain, "deleted": {"$ne": True}}
        # Also include tasks without company_domain but involving this domain's users
        domain_users = await db.users.find({"company_domain": domain}, {"_id": 0, "id": 1}).to_list(5000)
        uids = [u["id"] for u in domain_users]
        task_q = {
            "deleted": {"$ne": True},
            "$or": [
                {"company_domain": domain},
                {"created_by": {"$in": uids}},
                {"assigned_to": {"$in": uids}},
            ],
        }
    else:
        task_q = {
            "deleted": {"$ne": True},
            "$or": [{"created_by": current_user["id"]}, {"assigned_to": current_user["id"]}],
        }

    tasks = await db.tasks.find(task_q, {"_id": 0}).to_list(5000)
    task_ids = [t["id"] for t in tasks]
    activity = await db.task_activity.find({"task_id": {"$in": task_ids}}, {"_id": 0}).to_list(20000) if task_ids else []
    by_task: Dict[str, list] = {}
    for a in activity:
        by_task.setdefault(a.get("task_id"), []).append(a)

    user_ids = set()
    for t in tasks:
        if t.get("created_by"):
            user_ids.add(t["created_by"])
        if t.get("assigned_to") and not str(t["assigned_to"]).startswith("email_"):
            user_ids.add(t["assigned_to"])
    users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(user_ids) or 1)
    name_map = {u["id"]: u.get("name") or "" for u in users}

    rows = tasks_to_csv_rows(tasks, by_task, name_map)
    csv_text = rows_to_csv(rows)
    filename = f"tskflow-activity-{get_pst_now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/activity/tasks")
async def list_activity_tasks(
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    """In-app data log: full tracked fields for tasks visible to the user."""
    limit = max(1, min(1000, int(limit or 200)))
    domain = current_user.get("company_domain")
    if domain:
        domain_users = await db.users.find({"company_domain": domain}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(5000)
        uids = [u["id"] for u in domain_users]
        name_map = {u["id"]: u.get("name") or "" for u in domain_users}
        email_map = {u["id"]: u.get("email") or "" for u in domain_users}
        task_q = {
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True},
            "$or": [
                {"company_domain": domain},
                {"created_by": {"$in": uids}},
                {"assigned_to": {"$in": uids}},
            ],
        }
    else:
        task_q = {
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True},
            "$or": [{"created_by": current_user["id"]}, {"assigned_to": current_user["id"]}],
        }
        name_map = {current_user["id"]: current_user.get("name") or ""}
        email_map = {current_user["id"]: current_user.get("email") or ""}

    tasks = await db.tasks.find(task_q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # Enrich names for non-domain personal case
    missing = set()
    for t in tasks:
        for key in ("created_by", "assigned_to"):
            uid = t.get(key)
            if uid and not str(uid).startswith("email_") and uid not in name_map:
                missing.add(uid)
    if missing:
        extra = await db.users.find({"id": {"$in": list(missing)}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(len(missing))
        for u in extra:
            name_map[u["id"]] = u.get("name") or ""
            email_map[u["id"]] = u.get("email") or ""

    task_ids = [t["id"] for t in tasks]
    activity = await db.task_activity.find({"task_id": {"$in": task_ids}}, {"_id": 0}).to_list(10000) if task_ids else []
    by_task: Dict[str, list] = {}
    for a in activity:
        by_task.setdefault(a.get("task_id"), []).append(a)

    rows = tasks_to_csv_rows(tasks, by_task, name_map)
    for row in rows:
        aid = row.get("assignee_id")
        if aid and not row.get("assignee_email"):
            row["assignee_email"] = email_map.get(aid, "")
    return {"tasks": rows, "count": len(rows)}


def _notify_text(s: Optional[str]) -> str:
    """Normalize notification text for OS / browsers that mangle unicode dashes."""
    if not s:
        return ""
    return (
        str(s)
        .replace("\u2014", "-")  # em dash
        .replace("\u2013", "-")  # en dash
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\xa0", " ")
    )


# ===== BROWSER NOTIFICATIONS (poll-based) =====
@api_router.get("/notifications/pending")
async def get_pending_notifications(current_user: dict = Depends(get_current_user)):
    """Return ONLY very recent live notifications for OS toasts.

    Reminders and backlog are intentionally excluded — those go through
    /notifications/catch-up so login does not spam Chrome popups.
    """
    cutoff = (get_pst_now() - timedelta(seconds=90)).isoformat()
    docs = await db.notifications.find(
        {
            "user_id": current_user["id"],
            "delivered": {"$ne": True},
            "type": {"$nin": ["reminder"]},
            "created_at": {"$gte": cutoff},
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(10)
    # Still mark older undelivered non-toast items delivered so they don't pile up forever
    await db.notifications.update_many(
        {
            "user_id": current_user["id"],
            "delivered": {"$ne": True},
            "$or": [
                {"type": "reminder"},
                {"created_at": {"$lt": cutoff}},
            ],
        },
        {"$set": {"delivered": True, "delivered_at": get_pst_now().isoformat()}},
    )
    if docs:
        ids = [d["id"] for d in docs]
        await db.notifications.update_many(
            {"id": {"$in": ids}},
            {"$set": {"delivered": True, "delivered_at": get_pst_now().isoformat()}},
        )
        for d in docs:
            d["title"] = _notify_text(d.get("title"))
            d["body"] = _notify_text(d.get("body"))
    return {"notifications": docs}


@api_router.get("/notifications/catch-up")
async def notifications_catch_up(current_user: dict = Depends(get_current_user)):
    """Smart catch-up for login / dashboard: grouped pending work, not a toast storm.

    Marks undelivered notifications as delivered (so OS poll won't spam them) but
    leaves unread state intact for the in-app review UI.
    """
    now = get_pst_now()
    uid = current_user["id"]

    # Drain undelivered so legacy poll never dumps a backlog
    await db.notifications.update_many(
        {"user_id": uid, "delivered": {"$ne": True}},
        {"$set": {"delivered": True, "delivered_at": now.isoformat()}},
    )

    unread = await db.notifications.find(
        {"user_id": uid, "read": {"$ne": True}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)

    def _dedupe_by_task(rows):
        seen = set()
        out = []
        for n in rows:
            key = n.get("task_id") or n.get("id")
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "id": n.get("id"),
                "type": n.get("type"),
                "title": _notify_text(n.get("title")),
                "body": _notify_text(n.get("body")),
                "task_id": n.get("task_id"),
                "created_at": n.get("created_at"),
            })
        return out

    reminders = _dedupe_by_task([n for n in unread if n.get("type") == "reminder"])
    mentions = _dedupe_by_task([n for n in unread if n.get("type") == "mention"])
    nudges = _dedupe_by_task([n for n in unread if n.get("type") == "nudge"])
    other = _dedupe_by_task([
        n for n in unread
        if n.get("type") not in ("reminder", "mention", "nudge")
    ])

    # Live task snapshot for assignee — what's overdue / due soon
    open_tasks = await db.tasks.find(
        {
            "assigned_to": uid,
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True},
            "status": {"$nin": ["Completed", "Declined", "Draft", "Cancelled", "Rejected"]},
        },
        {"_id": 0, "id": 1, "title": 1, "due_date": 1, "priority": 1, "status": 1},
    ).to_list(300)

    overdue = []
    due_soon = []
    for t in open_tasks:
        raw = t.get("due_date")
        if not raw:
            continue
        try:
            due = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=PST)
        except Exception:
            continue
        hours = (due - now).total_seconds() / 3600.0
        item = {
            "id": t["id"],
            "title": _notify_text(t.get("title") or "Untitled"),
            "due_date": t.get("due_date"),
            "priority": t.get("priority") or "Medium",
            "status": t.get("status"),
            "hours_to_due": round(hours, 1),
        }
        if hours < 0:
            overdue.append(item)
        elif hours <= 24:
            due_soon.append(item)

    overdue.sort(key=lambda x: x.get("hours_to_due", 0))
    due_soon.sort(key=lambda x: x.get("hours_to_due", 99))

    summary = {
        "overdue_tasks": len(overdue),
        "due_soon_tasks": len(due_soon),
        "unread_reminders": len(reminders),
        "unread_mentions": len(mentions),
        "unread_nudges": len(nudges),
        "other_unread": len(other),
    }
    has_items = any(summary.values())

    return {
        "has_items": has_items,
        "summary": summary,
        "overdue": overdue[:12],
        "due_soon": due_soon[:12],
        "reminders": reminders[:12],
        "mentions": mentions[:12],
        "nudges": nudges[:12],
        "other": other[:12],
    }

@api_router.get("/users/mentionable")
async def get_mentionable_users(current_user: dict = Depends(get_current_user)):
    """Return users the current user can mention (same domain if teams, else all known users).

    Lightweight - returns id, name, email, avatar-friendly initials only.
    """
    email = current_user.get("email", "")
    domain = email.split("@")[-1] if "@" in email else ""
    query = {}
    if domain:
        # Same-domain users first (typical team-context)
        query = {"email": {"$regex": f"@{re.escape(domain)}$", "$options": "i"}}
    users = await db.users.find(query, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    return users

# ===== SHAREABLE TASK LINK ENDPOINT =====
@api_router.get("/tasks/shared/{token}")
async def get_task_by_shareable_link(token: str, current_user: dict = Depends(get_current_user)):
    """Access a task via its shareable link"""
    task = await db.tasks.find_one({"shareable_token": token}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator and assignee can access via shareable link
    if task["created_by"] != current_user["id"] and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied - you are not assigned to this task")
    
    # Get user details
    assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    created_user = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    
    return TaskResponse(
        id=task["id"],
        title=task["title"],
        description=task.get("description", ""),
        assigned_to=task["assigned_to"],
        assigned_to_name=assigned_user["name"] if assigned_user else "Unknown",
        created_by=task["created_by"],
        created_by_name=created_user["name"] if created_user else "Unknown",
        due_date=task["due_date"],
        status=task["status"],
        priority=task["priority"],
        category=task.get("category"),
        created_at=task["created_at"],
        accepted_at=task.get("accepted_at"),
        shareable_token=task.get("shareable_token"),
        comments=task.get("comments", [])
    )

# ===== SEND EMAIL TO ASSIGNEE ENDPOINT =====
@api_router.post("/tasks/{task_id}/send-email")
async def send_email_to_assignee(task_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Send an email update to the task assignee"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator can send email
    if task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can send emails")
    
    # Don't send to self
    if task["assigned_to"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot send email to yourself")
    
    assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")
    
    app_url = APP_BASE_URL
    email_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Task Update</h1>
            </div>
            <div style="padding: 40px 30px; background: white;">
                <p style="font-size: 16px; color: #374151;">Hi {assignee['name']},</p>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    <strong>{current_user['name']}</strong> sent you an update about the following task:
                </p>
                <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #4F46E5;">
                    <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{task['title']}</h2>
                    <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{task.get('description', '')[:300]}</p>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 15px;">
                        <div style="background: {'#FEF3C7' if task['priority'] in ['High', 'Urgent'] else '#E0E7FF'}; color: {'#92400E' if task['priority'] in ['High', 'Urgent'] else '#4338CA'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                            {task['priority']} Priority
                        </div>
                        <div style="color: #6B7280; font-size: 14px; padding: 6px 0;">
                            Status: {task['status']}
                        </div>
                        <div style="color: #6B7280; font-size: 14px; padding: 6px 0;">
                            Due: {task['due_date'].replace('T', ' at ').split('.')[0]}
                        </div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="{app_url}/task/{task_id}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                        View Task
                    </a>
                </div>
            </div>
        </body>
    </html>
    """
    
    background_tasks.add_task(send_email_notification, assignee["email"], f"Task Update: {task['title']}", email_content)
    
    return {"message": "Email sent successfully"}

# ===== STANDALONE SCREEN RECORDING =====
@api_router.post("/recordings/standalone")
async def create_standalone_recording(
    body: RecordingCreateRequest = None,
    recording_url: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Create a standalone screen recording with shareable link.

    Accepts either JSON body {recording_url} or ?recording_url query param.
    """
    rec_url = None
    title = None
    description = None
    duration_seconds = None
    size_bytes = None
    mime_type = None
    if body is not None:
        rec_url = body.recording_url
        title = body.title
        description = body.description
        duration_seconds = body.duration_seconds
        size_bytes = body.size_bytes
        mime_type = body.mime_type
    if not rec_url and recording_url:
        rec_url = recording_url

    recording_id = str(uuid.uuid4())
    recording_doc = {
        "id": recording_id,
        "created_by": current_user["id"],
        "recording_url": rec_url,
        "title": title or f"Recording {get_pst_now().strftime('%b %d, %Y %I:%M %p')}",
        "description": description,
        "duration_seconds": duration_seconds,
        "size_bytes": size_bytes,
        "mime_type": mime_type,
        "created_at": get_pst_now().isoformat(),
        "shareable_token": str(uuid.uuid4())[:12],
        "auto_delete_at": None  # Set when associated task is completed
    }
    await db.recordings.insert_one(recording_doc)
    
    app_url = APP_BASE_URL
    shareable_link = f"{app_url}/recording/{recording_doc['shareable_token']}"
    
    return {
        "recording_id": recording_id,
        "shareable_link": shareable_link,
        "shareable_token": recording_doc['shareable_token'],
        "title": recording_doc["title"],
    }


@api_router.get("/recordings/mine")
async def list_my_recordings(current_user: dict = Depends(get_current_user)):
    """List all recordings owned by the current user (both standalone and task-attached).

    Returns newest first. Excludes expired/auto-deleted recordings.
    """
    now = get_pst_now()
    cursor = db.recordings.find({"created_by": current_user["id"]}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(500)
    out = []
    for r in items:
        expired = False
        auto_delete_at = r.get("auto_delete_at")
        if auto_delete_at:
            try:
                delete_time = datetime.fromisoformat(auto_delete_at.replace('Z', '+00:00'))
                if now > delete_time:
                    expired = True
            except Exception:
                pass
        if expired:
            continue
        out.append({
            "id": r["id"],
            "title": r.get("title") or "Untitled recording",
            "description": r.get("description"),
            "recording_url": r.get("recording_url"),
            "shareable_token": r.get("shareable_token"),
            "shareable_link": f"{APP_BASE_URL}/recording/{r.get('shareable_token')}" if r.get("shareable_token") else None,
            "created_at": r.get("created_at"),
            "duration_seconds": r.get("duration_seconds"),
            "size_bytes": r.get("size_bytes"),
            "mime_type": r.get("mime_type"),
        })
    return {"recordings": out, "count": len(out)}


@api_router.delete("/recordings/{recording_id}")
async def delete_my_recording(recording_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a recording that belongs to the current user."""
    rec = await db.recordings.find_one({"id": recording_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    if rec.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own recordings")
    await db.recordings.delete_one({"id": recording_id})
    return {"ok": True}

@api_router.get("/recordings/{token}")
async def get_recording_by_token(token: str):
    """Get recording by shareable token (public metadata for the share page)."""
    recording = await db.recordings.find_one({"shareable_token": token}, {"_id": 0})
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    # Check if recording is expired (auto-deleted)
    if recording.get("auto_delete_at"):
        try:
            delete_time = datetime.fromisoformat(recording["auto_delete_at"].replace('Z', '+00:00'))
            if get_pst_now() > delete_time:
                return {
                    "expired": True,
                    "message": "This recording has been automatically deleted 24h after task completion"
                }
        except Exception:
            pass
    
    # Public share metadata (no owner id). Keep recording_url for API compat;
    # playback should use /recordings/{token}/media.
    return {
        "id": recording.get("id"),
        "title": recording.get("title") or "Untitled recording",
        "description": recording.get("description"),
        "recording_url": recording.get("recording_url"),
        "duration_seconds": recording.get("duration_seconds"),
        "size_bytes": recording.get("size_bytes"),
        "mime_type": recording.get("mime_type"),
        "created_at": recording.get("created_at"),
        "shareable_token": recording.get("shareable_token"),
        "has_media": bool(recording.get("recording_url")),
    }


@api_router.get("/recordings/{token}/media")
async def stream_recording_by_token(token: str, request: HTTPRequest):
    """Public media stream for a shareable recording — Loom-style watch-without-login."""
    recording = await db.recordings.find_one({"shareable_token": token}, {"_id": 0})
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.get("auto_delete_at"):
        try:
            delete_time = datetime.fromisoformat(recording["auto_delete_at"].replace('Z', '+00:00'))
            if get_pst_now() > delete_time:
                raise HTTPException(status_code=410, detail="This recording has expired")
        except HTTPException:
            raise
        except Exception:
            pass

    path = recording.get("recording_url")
    if not path:
        raise HTTPException(status_code=404, detail="Recording media not found")

    # Prefer attachment metadata when available; fall back to storage path directly
    record = await db.attachments.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    try:
        data, content_type = await storage_get(path)
    except Exception as e:
        logging.error(f"Recording media fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch recording")

    content_type = (record or {}).get("content_type") or recording.get("mime_type") or content_type or "video/webm"
    total = len(data)
    filename = (record or {}).get("original_filename") or f"{recording.get('title') or 'recording'}.webm"
    common_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "public, max-age=3600",
    }
    range_header = request.headers.get("range")
    if range_header and range_header.startswith("bytes="):
        try:
            rng = range_header.replace("bytes=", "").split("-")
            start = int(rng[0]) if rng[0] else 0
            end = int(rng[1]) if len(rng) > 1 and rng[1] else total - 1
            end = min(end, total - 1)
            start = max(0, min(start, end))
            chunk = data[start:end + 1]
            headers = {
                **common_headers,
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Content-Length": str(len(chunk)),
            }
            return Response(content=chunk, status_code=206, media_type=content_type, headers=headers)
        except Exception:
            pass
    return Response(
        content=data,
        media_type=content_type,
        headers={**common_headers, "Content-Length": str(total)},
    )

# Section 5: Auto-delete recordings 24h after task completion
async def schedule_recording_deletion(task_id: str):
    """Schedule deletion of task recordings 24h after completion"""
    # Assumption: attachments with kind='video' are recordings that should be deleted
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if task and task.get("attachments"):
        delete_at = (get_pst_now() + timedelta(hours=24)).isoformat()
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"recordings_delete_at": delete_at}}
        )

# ===== GROUP TASK ANALYTICS & LEADERBOARD =====
@api_router.get("/tasks/{task_id}/analytics")
async def get_task_analytics(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get analytics for a group task (parent task)"""
    parent = await db.tasks.find_one({"id": task_id, "is_parent": True}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Group task not found")
    
    # Only creator and assignees can view analytics
    children = await db.tasks.find({"parent_id": task_id}, {"_id": 0}).to_list(500)
    assignee_ids = [c["assigned_to"] for c in children]
    
    if parent["created_by"] != current_user["id"] and current_user["id"] not in assignee_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    
    total = len(children)
    completed = len([c for c in children if c["status"] == "Completed"])
    pending = len([c for c in children if c["status"] == "Pending"])
    accepted = len([c for c in children if c["status"] == "Accepted"])
    review_pending = len([c for c in children if c["status"] == "Review Pending"])
    declined = len([c for c in children if c["status"] == "Declined"])
    
    # Calculate average completion time
    completed_tasks = [c for c in children if c["status"] == "Completed" and c.get("completed_at")]
    avg_completion_hours = 0
    if completed_tasks:
        total_hours = 0
        for task in completed_tasks:
            try:
                created = datetime.fromisoformat(task["created_at"].replace('Z', '+00:00'))
                completed = datetime.fromisoformat(task["completed_at"].replace('Z', '+00:00'))
                hours = (completed - created).total_seconds() / 3600
                total_hours += hours
            except:
                pass
        avg_completion_hours = round(total_hours / len(completed_tasks), 1) if completed_tasks else 0
    
    return {
        "total_assignees": total,
        "completed": completed,
        "pending": pending,
        "accepted": accepted,
        "review_pending": review_pending,
        "declined": declined,
        "completion_rate": round(completed / total * 100) if total else 0,
        "avg_completion_hours": avg_completion_hours
    }

@api_router.get("/tasks/{task_id}/leaderboard")
async def get_task_leaderboard(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get leaderboard for a group task showing assignees ranked by speed and engagement"""
    parent = await db.tasks.find_one({"id": task_id, "is_parent": True}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Group task not found")
    
    children = await db.tasks.find({"parent_id": task_id}, {"_id": 0}).to_list(500)
    assignee_ids = [c["assigned_to"] for c in children]
    
    if parent["created_by"] != current_user["id"] and current_user["id"] not in assignee_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get user details
    user_ids = list(set([c["assigned_to"] for c in children if not str(c["assigned_to"]).startswith("email_")]))
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(user_ids)) if user_ids else []
    user_map = {u["id"]: u["name"] for u in users}
    
    # Calculate leaderboard metrics
    leaderboard = []
    for child in children:
        assignee_id = child["assigned_to"]
        name = resolve_assignee_name(child, user_map)
        
        # Calculate completion time in hours
        completion_hours = None
        if child["status"] == "Completed" and child.get("completed_at"):
            try:
                created = datetime.fromisoformat(child["created_at"].replace('Z', '+00:00'))
                completed = datetime.fromisoformat(child["completed_at"].replace('Z', '+00:00'))
                completion_hours = round((completed - created).total_seconds() / 3600, 1)
            except:
                pass
        
        # Engagement score (lower is better: 1=completed fast, 5=not started)
        if child["status"] == "Completed":
            engagement_score = 1
        elif child["status"] == "Review Pending":
            engagement_score = 2
        elif child["status"] == "Accepted":
            engagement_score = 3
        elif child["status"] == "Pending":
            engagement_score = 5
        else:
            engagement_score = 4
        
        leaderboard.append({
            "assignee_id": assignee_id,
            "name": name,
            "status": child["status"],
            "completion_hours": completion_hours,
            "engagement_score": engagement_score,
            "task_id": child["id"]
        })
    
    # Sort by engagement (lower=better), then by completion time (faster=better)
    leaderboard.sort(key=lambda x: (x["engagement_score"], x["completion_hours"] if x["completion_hours"] else 9999))
    
    # Add rank
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1
    
    return {
        "leaderboard": leaderboard,
        "visibility_message": "⚡ Your speed and engagement are visible to everyone on this task"
    }

# ===== AI SUMMARIES =====
def _plain_task_blurb(task: dict, note: str = "") -> str:
    """Heuristic summary using Subject + Description (no AI)."""
    subject = (task.get("title") or "Untitled").strip()
    desc = re.sub(r"<[^>]+>", " ", task.get("description") or "")
    desc = re.sub(r"\s+", " ", desc).strip()
    if len(desc) > 160:
        desc = desc[:157].rstrip() + "..."
    priority = task.get("priority") or "Medium"
    status = task.get("status") or "Pending"
    parts = [f"Subject: {subject}."]
    if desc:
        parts.append(f"Details: {desc}")
    parts.append(f"{priority} priority. Status: {status}.")
    if note:
        parts.append(note)
    return " ".join(parts)


@api_router.post("/tasks/{task_id}/ai-summary")
async def get_task_ai_summary(task_id: str, current_user: dict = Depends(get_current_user)):
    """Generate AI summary for a specific task using Subject + Description."""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Creator, assignee, or any subtask assignee on a parent group
    allowed = task["created_by"] == current_user["id"] or task.get("assigned_to") == current_user["id"]
    if not allowed and task.get("is_parent"):
        child = await db.tasks.find_one(
            {"parent_id": task_id, "assigned_to": current_user["id"], "deleted": {"$ne": True}},
            {"_id": 0, "id": 1},
        )
        allowed = bool(child)
    if not allowed:
        raise HTTPException(status_code=403, detail="Access denied")

    emergent_key = os.getenv("EMERGENT_LLM_KEY")
    if not emergent_key:
        return {"summary": _plain_task_blurb(task)}

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        subject = (task.get("title") or "").strip()
        description = (task.get("description") or "").strip()
        criteria = (task.get("success_criteria") or "").strip()
        prompt = f"""Write a crisp 1-2 sentence manager brief for this task.
Use the Subject as the what, and Description as the how/instructions. Do not invent details.
Prefer plain ASCII punctuation (hyphens), never garbled characters.
If Description is empty, say so briefly and rely on Subject only.

Subject: {subject}
Description: {description[:700] if description else '(none)'}
Success criteria: {criteria[:300] if criteria else '(none)'}
Priority: {task.get('priority', 'Medium')}
Due: {task.get('due_date')}
Status: {task.get('status')}"""

        chat = LlmChat(api_key=emergent_key).with_model("openai", "gpt-4o-mini")
        response = await asyncio.wait_for(
            chat.aask([UserMessage(content=prompt)]),
            timeout=10.0,
        )
        summary = (getattr(response, "content", None) or str(response) or "").strip()
        # Repair accidental mojibake if a model/path reintroduces it
        summary = (
            summary
            .replace("\u00c3\u00a2\u00c2\u0080\u00c2\u0094", "\u2014")
            .replace("\u00e2\u0080\u0094", "\u2014")
            .replace("\u00e2\u20ac\u201d", "\u2014")
            .replace("\u00e2\u20ac\u201c", "\u2013")
        )
        return {"summary": summary or _plain_task_blurb(task)}
    except asyncio.TimeoutError:
        return {"summary": _plain_task_blurb(task, note="(Summary timed out.)")}
    except Exception as e:
        logging.error(f"AI summary error: {e}")
        return {"summary": _plain_task_blurb(task)}

@api_router.post("/dashboard/ai-summary")
async def get_dashboard_ai_summary(
    body: AISummaryRequest = None,
    view_mode: str = None,
    date_filter: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate AI summary for the current dashboard view/filter.

    Accepts either JSON body {view_mode, date_filter} or query params.
    """
    if body is not None:
        view_mode = view_mode or body.view_mode
        date_filter = date_filter or body.date_filter
    view_mode = view_mode or "active"
    date_filter = date_filter or "all"

    # Fetch tasks based on filters (simplified version)
    query = {
        "$or": [
            {"assigned_to": current_user["id"]},
            {"created_by": current_user["id"]}
        ],
        "deleted": {"$ne": True}
    }
    
    if view_mode == "completed":
        query["status"] = "Completed"
    else:
        query["status"] = {"$ne": "Completed"}
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    if not tasks:
        return {"summary": "No tasks found for the selected filter."}
    
    emergent_key = os.getenv("EMERGENT_LLM_KEY")
    if not emergent_key:
        # Provide a quick heuristic summary if AI is unavailable
        total = len(tasks)
        overdue = 0
        now = get_pst_now()
        priorities = {"High": 0, "Medium": 0, "Low": 0}
        for t in tasks:
            priorities[t.get("priority", "Medium")] = priorities.get(t.get("priority", "Medium"), 0) + 1
            try:
                due = datetime.fromisoformat(t["due_date"].replace('Z', '+00:00'))
                if due < now and t.get("status") != "Completed":
                    overdue += 1
            except Exception:
                pass
        return {"summary": f"You have {total} {view_mode} tasks. {overdue} are overdue. Priorities — High: {priorities.get('High',0)}, Medium: {priorities.get('Medium',0)}, Low: {priorities.get('Low',0)}."}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Build compact task list summary (fewer tasks, shorter fields for speed)
        task_list = []
        for t in tasks[:12]:  # Limit to 12 for speed
            title = (t.get('title') or '')[:60]
            task_list.append(f"- {title} [{t.get('priority', 'M')}/{t.get('status', '')}]")
        
        prompt = (
            f"Summarize {view_mode} tasks in 2 short sentences. "
            f"Highlight top priorities and urgent items.\n\n"
            + "\n".join(task_list)
        )

        chat = LlmChat(api_key=emergent_key).with_model("openai", "gpt-4o-mini")
        # Add a timeout so slow LLM does not block the UI
        response = await asyncio.wait_for(
            chat.aask([UserMessage(content=prompt)]),
            timeout=12.0
        )
        
        return {"summary": response.content.strip()}
    except asyncio.TimeoutError:
        return {"summary": f"You have {len(tasks)} {view_mode} tasks. (AI summary timed out — showing quick stats.)"}
    except Exception as e:
        logging.error(f"Dashboard AI summary error: {e}")
        # Fall back to heuristic instead of failing
        return {"summary": f"You have {len(tasks)} {view_mode} tasks. Focus on High priority items first."}

# ===== BULK APPROVE =====
@api_router.post("/tasks/bulk-approve")
async def bulk_approve_tasks(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Approve all tasks pending the current user's approval"""
    # Find all tasks in "Review Pending" status created by current user
    tasks = await db.tasks.find({
        "created_by": current_user["id"],
        "status": "Review Pending",
        "deleted": {"$ne": True}
    }, {"_id": 0}).to_list(500)
    
    if not tasks:
        return {"message": "No tasks pending approval", "approved_count": 0}
    
    approved_ids = []
    app_url = APP_BASE_URL
    
    for task in tasks:
        # Approve the task
        await db.tasks.update_one(
            {"id": task["id"]},
            {"$set": {
                "status": "Completed",
                "completed_at": get_pst_now().isoformat()
            }}
        )
        approved_ids.append(task["id"])
        
        # Send email notification to assignee
        assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        if assignee:
            email_content = f"""
            <html>
                <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                    <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Task Approved!</h1>
                    </div>
                    <div style="padding: 40px 30px; background: white;">
                        <p style="font-size: 16px; color: #374151;">Hi {assignee['name']},</p>
                        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                            <strong>{current_user['name']}</strong> has approved your completion of: <strong>{task['title']}</strong>
                        </p>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="{app_url}/task/{task['id']}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                View Task
                            </a>
                        </div>
                    </div>
                </body>
            </html>
            """
            background_tasks.add_task(send_email_notification, assignee["email"], f"Task Approved: {task['title']}", email_content)
    
    return {
        "message": f"Approved {len(approved_ids)} task(s)",
        "approved_count": len(approved_ids),
        "approved_ids": approved_ids
    }

@api_router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    created_user = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    
    return TaskResponse(
        id=task["id"],
        title=task["title"],
        description=task["description"],
        assigned_to=task["assigned_to"],
        assigned_to_name=assigned_user["name"] if assigned_user else (task.get("assigned_to_email") or (task["assigned_to"][6:] if str(task["assigned_to"]).startswith("email_") else "Unknown")),
        created_by=task["created_by"],
        created_by_name=created_user["name"] if created_user else "Unknown",
        due_date=task["due_date"],
        status=task["status"],
        priority=task["priority"],
        category=task.get("category"),
        created_at=task["created_at"],
        accepted_at=task.get("accepted_at"),
        completed_at=task.get("completed_at"),
        reason_for_decline=task.get("reason_for_decline"),
        counter_proposal_message=task.get("counter_proposal_message"),
        proposed_due_date=task.get("proposed_due_date"),
        note=task.get("note"),
        note_images=task.get("note_images"),
        completion_note=task.get("completion_note"),
        completion_note_images=task.get("completion_note_images"),
        review_pending_at=task.get("review_pending_at"),
        review_feedback=task.get("review_feedback"),
        assigned_to_email=assigned_user["email"] if assigned_user else task.get("assigned_to_email"),
        created_by_email=created_user["email"] if created_user else None,
        previous_completion_note=task.get("previous_completion_note"),
        previous_completion_images=task.get("previous_completion_images"),
        calendar_event_id=task.get("calendar_event_id"),
        completed_by=task.get("completed_by"),
        completed_by_name=task.get("completed_by_name"),
        attachments=task.get("attachments"),
        is_sales_task=task.get("is_sales_task", False),
        requires_screen_recording=task.get("requires_screen_recording", False),
        parent_id=task.get("parent_id"),
        is_parent=bool(task.get("is_parent")),
        child_count=task.get("child_count"),
        viewed_at=task.get("viewed_at"),
        success_criteria=task.get("success_criteria"),
        blocked_reason=task.get("blocked_reason"),
        blocked_at=task.get("blocked_at"),
        ai_review_summary=task.get("ai_review_summary"),
    )

@api_router.put("/tasks/{task_id}/accept")
async def accept_task(task_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "Accepted", "accepted_at": get_pst_now().isoformat()}}
    )
    
    calendar_scheduled = False
    # Create calendar event for high/urgent priority tasks (case-insensitive)
    priority = (task.get("priority") or "").lower()
    if priority in ["high", "urgent"]:
        task["id"] = task_id
        event_id = await create_calendar_event(current_user["id"], task)
        if event_id:
            calendar_scheduled = True
            logging.info(f"Calendar event created for task {task_id}: {event_id}")
    
    return {"message": "Task accepted", "calendar_scheduled": calendar_scheduled}

@api_router.put("/tasks/{task_id}/decline")
async def decline_task(task_id: str, action: TaskAction, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not action.reason:
        raise HTTPException(status_code=400, detail="Reason required")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "Declined", "reason_for_decline": action.reason}}
    )
    
    return {"message": "Task declined"}

@api_router.put("/tasks/{task_id}/counter-propose")
async def counter_propose(task_id: str, action: TaskAction, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not action.proposed_due_date:
        raise HTTPException(status_code=400, detail="Proposed due date required")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": "Counter-Proposed",
            "proposed_due_date": action.proposed_due_date,
            "counter_proposal_message": action.message or ""
        }}
    )
    
    # Notify creator
    creator = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    if creator:
        email_content = f"""
        <html>
            <body>
                <h2>Task Counter-Proposal</h2>
                <p><strong>Task:</strong> {task['title']}</p>
                <p><strong>From:</strong> {current_user['name']}</p>
                <p><strong>Proposed Date:</strong> {action.proposed_due_date}</p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, creator["email"], "Task Counter-Proposal", email_content)
    
    return {"message": "Counter-proposal submitted"}

@api_router.put("/tasks/{task_id}/accept-counter-proposal")
async def accept_counter_proposal(task_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Accept a counter-proposal and update the task with the new due date"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only task creator can accept counter-proposals
    if task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can accept counter-proposals")
    
    if task["status"] != "Counter-Proposed":
        raise HTTPException(status_code=400, detail="Task has no pending counter-proposal")
    
    if not task.get("proposed_due_date"):
        raise HTTPException(status_code=400, detail="No proposed due date found")
    
    # Accept the counter-proposal: update due date and set status to Accepted
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": "Accepted",
            "due_date": task["proposed_due_date"],
            "accepted_at": get_pst_now().isoformat(),
            "counter_proposal_accepted": True
        }}
    )
    
    # If this is a parent task (group task), update all children
    if task.get("is_parent"):
        await db.tasks.update_many(
            {"parent_id": task_id},
            {"$set": {
                "due_date": task["proposed_due_date"]
            }}
        )
    
    # Notify assignee
    assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    if assignee:
        app_url = APP_BASE_URL
        email_content = f"""
        <html>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Counter-Proposal Accepted!</h1>
                </div>
                <div style="padding: 40px 30px; background: white;">
                    <p style="font-size: 16px; color: #374151;">Hi {assignee['name']},</p>
                    <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                        Great news! <strong>{current_user['name']}</strong> has accepted your counter-proposal for the task: <strong>{task['title']}</strong>
                    </p>
                    <div style="background: #F0FDF4; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #10B981;">
                        <p style="color: #065F46; margin: 0 0 10px 0;">New Due Date: <strong>{task['proposed_due_date'].replace('T', ' at ').split('.')[0]}</strong></p>
                        <p style="color: #065F46; margin: 0;">Status: <strong>Accepted</strong></p>
                    </div>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{app_url}/task/{task_id}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            View Task
                        </a>
                    </div>
                </div>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, assignee["email"], "Counter-Proposal Accepted!", email_content)
    
    return {"message": "Counter-proposal accepted", "new_due_date": task["proposed_due_date"]}

@api_router.put("/tasks/{task_id}/complete")
async def complete_task(task_id: str, completion: Optional[TaskComplete] = None, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # If self-assigned, mark as completed directly
    is_self_assigned = task["assigned_to"] == task["created_by"]
    
    update_data = {
        "completion_note": completion.completion_note if completion else None,
        "completion_note_images": completion.completion_note_images if completion else None,
        "completed_by": current_user["id"],
        "completed_by_name": current_user["name"],
    }
    
    if is_self_assigned:
        update_data["status"] = "Completed"
        update_data["completed_at"] = get_pst_now().isoformat()
        # Section 5: Schedule recording deletion 24h after completion
        await schedule_recording_deletion(task_id)
    else:
        # Set to Review Pending for non-self-assigned tasks
        update_data["status"] = "Review Pending"
        update_data["review_pending_at"] = get_pst_now().isoformat()
        note = completion.completion_note if completion else None
        imgs = completion.completion_note_images if completion else None
        if task.get("success_criteria") or note:
            try:
                summary = await generate_ai_work_review(task, note, bool(imgs))
                if summary:
                    update_data["ai_review_summary"] = summary
            except Exception as e:
                logging.error(f"ai_work_review failed: {e}")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    return {"message": "Task submitted for review" if not is_self_assigned else "Task completed"}


@api_router.put("/tasks/{task_id}/block")
async def block_task(task_id: str, body: BlockAction, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if task.get("status") not in ("Accepted", "Blocked"):
        raise HTTPException(status_code=400, detail="Only accepted tasks can be blocked")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Please say what is blocking you")
    now_iso = get_pst_now().isoformat()
    await db.tasks.update_one({"id": task_id}, {"$set": {
        "status": "Blocked",
        "blocked_reason": reason,
        "blocked_at": now_iso,
    }})
    creator = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    if creator and creator.get("email"):
        html = (
            f"<html><body style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;'>"
            f"<div style='padding:24px;'><h2>Blocked: {task.get('title','Task')}</h2>"
            f"<p>{current_user.get('name','Assignee')} flagged a blocker:</p>"
            f"<blockquote style='border-left:3px solid #f59e0b;padding:8px 12px;background:#fffbeb;'>{reason}</blockquote>"
            f"<p><a href='{APP_BASE_URL}/task/{task_id}'>Open task</a></p></div></body></html>"
        )
        background_tasks.add_task(send_email_notification, creator["email"], f"Blocked: {task.get('title')}", html)
        if not str(task["created_by"]).startswith("email_"):
            background_tasks.add_task(send_web_push, task["created_by"], "Task blocked", f"{current_user.get('name')}: {reason[:80]}", f"/task/{task_id}")
    return {"message": "Marked as blocked", "status": "Blocked"}


@api_router.put("/tasks/{task_id}/unblock")
async def unblock_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["assigned_to"] != current_user["id"] and task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if task.get("status") != "Blocked":
        raise HTTPException(status_code=400, detail="Task is not blocked")
    await db.tasks.update_one({"id": task_id}, {"$set": {
        "status": "Accepted",
        "blocked_reason": None,
        "blocked_at": None,
    }})
    return {"message": "Blocker cleared", "status": "Accepted"}


@api_router.put("/tasks/{task_id}/review")
async def review_task(task_id: str, review: ReviewAction, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can review")
    
    if task["status"] != "Review Pending":
        raise HTTPException(status_code=400, detail="Task is not pending review")
    
    app_url = APP_BASE_URL
    assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    
    if review.action == "accept":
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"status": "Completed", "completed_at": get_pst_now().isoformat()}}
        )
        # Section 5: Schedule recording deletion 24h after approval
        await schedule_recording_deletion(task_id)
        if assignee:
            email_content = f"""
            <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Task Approved!</h1>
                </div>
                <div style="padding: 30px;">
                    <p>Great work! Your task "<strong>{task['title']}</strong>" has been approved by {current_user['name']}.</p>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="{app_url}/task/{task_id}" style="background: #10B981; color: white; padding: 12px 24px; border-radius: 20px; text-decoration: none;">View Task</a>
                    </div>
                </div>
            </body></html>
            """
            background_tasks.add_task(send_email_notification, assignee["email"], f"Task Approved: {task['title']}", email_content)
        return {"message": "Task approved and completed"}
    
    elif review.action == "send_back":
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {
                "status": "Accepted",
                "review_feedback": review.feedback,
                "review_pending_at": None,
                "previous_completion_note": task.get("completion_note"),
                "previous_completion_images": task.get("completion_note_images"),
                "completion_note": None,
                "completion_note_images": None
            }}
        )
        if assignee:
            email_content = f"""
            <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Task Needs Revision</h1>
                </div>
                <div style="padding: 30px;">
                    <p>Your task "<strong>{task['title']}</strong>" needs additional work.</p>
                    {f'<div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 15px 0;"><strong>Feedback:</strong> {review.feedback}</div>' if review.feedback else ''}
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="{app_url}/task/{task_id}" style="background: #F59E0B; color: white; padding: 12px 24px; border-radius: 20px; text-decoration: none;">View Task</a>
                    </div>
                </div>
            </body></html>
            """
            background_tasks.add_task(send_email_notification, assignee["email"], f"Task Needs Revision: {task['title']}", email_content)
        return {"message": "Task sent back for revision"}
    
    raise HTTPException(status_code=400, detail="Invalid action")

# Invite link endpoint - public, no auth required
@api_router.get("/invite/{invite_token}")
async def get_invite_task(invite_token: str):
    task = await db.tasks.find_one({"invite_token": invite_token, "deleted": {"$ne": True}}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    return {"task_id": task["id"], "assigned_to_email": task.get("assigned_to_email")}

@api_router.put("/tasks/{task_id}/restore")
async def restore_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "deleted": True}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["created_by"] != current_user["id"] and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$unset": {"deleted": "", "deleted_at": "", "deleted_by": ""}}
    )
    return {"message": "Task restored"}

# Auto-complete review pending tasks after 24 hours
@api_router.post("/tasks/auto-complete-reviews")
async def auto_complete_reviews():
    twenty_four_hours_ago = (get_pst_now() - timedelta(hours=24)).isoformat()
    
    result = await db.tasks.update_many(
        {
            "status": "Review Pending",
            "review_pending_at": {"$lt": twenty_four_hours_ago}
        },
        {"$set": {"status": "Completed", "completed_at": get_pst_now().isoformat()}}
    )
    return {"auto_completed": result.modified_count}

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    success_criteria: Optional[str] = None

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator or assignee can delete
    if task["created_by"] != current_user["id"] and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Soft delete - mark as deleted but keep for analytics
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"deleted": True, "deleted_at": get_pst_now().isoformat(), "deleted_by": current_user["id"]}}
    )

    # Remove the Google Calendar event from the assignee's calendar (if one was created)
    if task.get("calendar_event_id") and task.get("assigned_to"):
        try:
            ok = await delete_calendar_event(task["assigned_to"], task["calendar_event_id"])
            if ok:
                await db.tasks.update_one({"id": task_id}, {"$unset": {"calendar_event_id": ""}})
        except Exception as _e:
            logging.error(f"delete_task: calendar cleanup failed: {_e}")

    # If this is a parent group, delete its children too
    if task.get("is_parent"):
        children = await db.tasks.find({"parent_id": task_id}, {"_id": 0}).to_list(500)
        await db.tasks.update_many(
            {"parent_id": task_id},
            {"$set": {"deleted": True, "deleted_at": get_pst_now().isoformat(), "deleted_by": current_user["id"]}}
        )
        # Best-effort per-child calendar cleanup
        for c in children:
            if c.get("calendar_event_id") and c.get("assigned_to"):
                try:
                    await delete_calendar_event(c["assigned_to"], c["calendar_event_id"])
                    await db.tasks.update_one({"id": c["id"]}, {"$unset": {"calendar_event_id": ""}})
                except Exception:
                    pass
    # If this was the last active child of a parent, remove the empty parent
    elif task.get("parent_id"):
        remaining = await db.tasks.count_documents({"parent_id": task["parent_id"], "deleted": {"$ne": True}})
        if remaining == 0:
            await db.tasks.update_one(
                {"id": task["parent_id"]},
                {"$set": {"deleted": True, "deleted_at": get_pst_now().isoformat(), "deleted_by": current_user["id"]}}
            )

    return {"message": "Task deleted"}

@api_router.post("/tasks/bulk-delete")
async def bulk_delete_tasks(task_ids: List[str], current_user: dict = Depends(get_current_user)):
    """Soft-delete tasks. If a parent/group task is selected, all its subtasks are deleted too."""
    deleted_count = 0
    now = get_pst_now().isoformat()
    for task_id in task_ids:
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            continue
        if task["created_by"] != current_user["id"] and task.get("assigned_to") != current_user["id"]:
            continue
        # Delete this task
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"deleted": True, "deleted_at": now, "deleted_by": current_user["id"]}}
        )
        deleted_count += 1
        # Remove Google Calendar event for this task (if any)
        if task.get("calendar_event_id") and task.get("assigned_to"):
            try:
                ok = await delete_calendar_event(task["assigned_to"], task["calendar_event_id"])
                if ok:
                    await db.tasks.update_one({"id": task_id}, {"$unset": {"calendar_event_id": ""}})
            except Exception:
                pass
        # If it's a parent/group task, cascade to its subtasks
        if task.get("is_parent"):
            children = await db.tasks.find({"parent_id": task_id, "deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
            cascade = await db.tasks.update_many(
                {"parent_id": task_id, "deleted": {"$ne": True}},
                {"$set": {"deleted": True, "deleted_at": now, "deleted_by": current_user["id"]}}
            )
            deleted_count += cascade.modified_count
            # Cleanup calendar events on each child
            for c in children:
                if c.get("calendar_event_id") and c.get("assigned_to"):
                    try:
                        await delete_calendar_event(c["assigned_to"], c["calendar_event_id"])
                        await db.tasks.update_one({"id": c["id"]}, {"$unset": {"calendar_event_id": ""}})
                    except Exception:
                        pass

    return {"message": f"{deleted_count} tasks deleted", "deleted_count": deleted_count}

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only the creator can edit the task (unless it's a draft)
    if task.get("status") != "Draft" and task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can edit this task")
    
    # Build update dict with only provided fields
    update_data = {}
    changes = []  # Track before→after changes
    
    if task_update.title is not None:
        update_data["title"] = task_update.title
        if task_update.title != task.get("title"):
            changes.append(f"<strong>Title:</strong> {task.get('title', 'None')} → {task_update.title}")
    
    if task_update.description is not None:
        update_data["description"] = task_update.description
        if task_update.description != task.get("description"):
            old_desc = task.get("description", "None")[:50] + ("..." if len(task.get("description", "")) > 50 else "")
            new_desc = task_update.description[:50] + ("..." if len(task_update.description) > 50 else "")
            changes.append(f"<strong>Description:</strong> {old_desc} → {new_desc}")
    
    if task_update.due_date is not None:
        update_data["due_date"] = task_update.due_date
        if task_update.due_date != task.get("due_date"):
            changes.append(f"<strong>Due date:</strong> {task.get('due_date', 'None').replace('T', ' at ').split('.')[0]} → {task_update.due_date.replace('T', ' at ').split('.')[0]}")
    
    if task_update.priority is not None:
        update_data["priority"] = task_update.priority
        if task_update.priority != task.get("priority"):
            changes.append(f"<strong>Priority:</strong> {task.get('priority', 'None')} → {task_update.priority}")
    
    if task_update.category is not None:
        update_data["category"] = task_update.category
        if task_update.category != task.get("category"):
            changes.append(f"<strong>Category:</strong> {task.get('category', 'None')} → {task_update.category}")

    if task_update.success_criteria is not None:
        cleaned = (task_update.success_criteria or "").strip() or None
        update_data["success_criteria"] = cleaned
        if cleaned != task.get("success_criteria"):
            changes.append("<strong>Success criteria</strong> updated")
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_data["updated_at"] = get_pst_now().isoformat()
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # Send notification to assignee if task is assigned to someone else and not a draft
    app_url = APP_BASE_URL
    if task.get("status") != "Draft" and task["assigned_to"] != current_user["id"] and changes:
        assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        if assignee:
            changes_html = "".join([f"<li style='margin: 5px 0;'>{c}</li>" for c in changes]) if changes else "<li>Task details updated</li>"
            
            email_content = f"""
            <html>
                <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
                    <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Task Updated</h1>
                    </div>
                    <div style="padding: 40px 30px; background: white;">
                        <p style="font-size: 16px; color: #374151;">Hi {assignee['name']},</p>
                        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                            <strong>{current_user['name']}</strong> has made changes to a task assigned to you.
                        </p>
                        <div style="background: #FFFBEB; border-radius: 12px; padding: 24px; margin: 25px 0; border-left: 4px solid #F59E0B;">
                            <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2937;">{task_update.title or task['title']}</h2>
                            <p style="font-size: 14px; color: #6B7280; margin: 0 0 10px 0;">Changes made:</p>
                            <ul style="color: #374151; margin: 0; padding-left: 20px;">{changes_html}</ul>
                        </div>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="{app_url}/task/{task_id}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                View Updated Task
                            </a>
                        </div>
                    </div>
                    <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                        <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 Tskflow. All rights reserved.</p>
                    </div>
                </body>
            </html>
            """
            background_tasks.add_task(send_email_notification, assignee["email"], f"Task Updated: {task_update.title or task['title']}", email_content)
    
    # Fetch and return updated task
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    assigned_user = await db.users.find_one({"id": updated_task["assigned_to"]}, {"_id": 0})
    
    return TaskResponse(
        id=updated_task["id"],
        title=updated_task["title"],
        description=updated_task["description"],
        assigned_to=updated_task["assigned_to"],
        assigned_to_name=assigned_user["name"] if assigned_user else "Unknown",
        created_by=updated_task["created_by"],
        created_by_name=current_user["name"],
        due_date=updated_task["due_date"],
        status=updated_task["status"],
        priority=updated_task["priority"],
        category=updated_task.get("category"),
        created_at=updated_task["created_at"],
        accepted_at=updated_task.get("accepted_at"),
        completed_at=updated_task.get("completed_at"),
        reason_for_decline=updated_task.get("reason_for_decline"),
        counter_proposal_message=updated_task.get("counter_proposal_message"),
        proposed_due_date=updated_task.get("proposed_due_date")
    )

@api_router.post("/analytics", response_model=AnalyticsResponse)
async def get_analytics(query: AnalyticsQuery, current_user: dict = Depends(get_current_user)):
    start = datetime.fromisoformat(query.start_date)
    end = datetime.fromisoformat(query.end_date)
    
    # Only fetch tasks where user is involved (created or assigned)
    # Exclude tasks deleted before completion (for analytics accuracy)
    tasks = await db.tasks.find({
        "$and": [
            {"$or": [
                {"assigned_to": current_user["id"]},
                {"created_by": current_user["id"]}
            ]},
            {"$or": [
                {"deleted": {"$ne": True}},  # Not deleted
                {"$and": [{"deleted": True}, {"completed_at": {"$ne": None}}]}  # Deleted but was completed first
            ]}
        ],
        "created_at": {
            "$gte": start.isoformat(),
            "$lte": end.isoformat()
        }
    }, {"_id": 0}).to_list(1000)
    
    # Calculate metrics
    assigned_to_others = [t for t in tasks if t["created_by"] == current_user["id"] and t["assigned_to"] != current_user["id"]]
    assigned_to_self = [t for t in tasks if t["created_by"] == current_user["id"] and t["assigned_to"] == current_user["id"]]
    received_from_others = [t for t in tasks if t["assigned_to"] == current_user["id"] and t["created_by"] != current_user["id"]]
    completed = [t for t in tasks if t["status"] == "Completed"]
    
    # Breakdown by assignee - batch fetch users
    unique_assignee_ids = list(set([t["assigned_to"] for t in assigned_to_others if not t["assigned_to"].startswith("email_")]))
    
    assignee_breakdown = {}
    assignee_details = []
    
    if unique_assignee_ids:
        assignees = await db.users.find(
            {"id": {"$in": unique_assignee_ids}},
            {"_id": 0, "id": 1, "name": 1, "email": 1}
        ).to_list(len(unique_assignee_ids))
        
        assignee_map = {a["id"]: a for a in assignees}
        
        for assignee in assignees:
            assignee_breakdown[assignee["id"]] = {"name": assignee["name"], "count": 0}
        
        for task in assigned_to_others:
            assignee_id = task["assigned_to"]
            if assignee_id in assignee_breakdown:
                assignee_breakdown[assignee_id]["count"] += 1
        
        # Calculate detailed breakdown per assignee
        for assignee_id, assignee_data in assignee_map.items():
            assignee_tasks = [t for t in assigned_to_others if t["assigned_to"] == assignee_id]
            completed_tasks = [t for t in assignee_tasks if t["status"] == "Completed"]
            pending_tasks = [t for t in assignee_tasks if t["status"] not in ["Completed", "Declined"]]
            
            # Calculate average completion time
            avg_days = None
            if completed_tasks:
                completion_times = []
                for t in completed_tasks:
                    if t.get("completed_at") and t.get("created_at"):
                        try:
                            created = datetime.fromisoformat(t["created_at"].replace('Z', '+00:00'))
                            completed_at = datetime.fromisoformat(t["completed_at"].replace('Z', '+00:00'))
                            days = (completed_at - created).total_seconds() / 86400
                            completion_times.append(days)
                        except:
                            pass
                if completion_times:
                    avg_days = round(sum(completion_times) / len(completion_times), 1)
            
            completion_rate = round((len(completed_tasks) / len(assignee_tasks) * 100), 1) if assignee_tasks else 0
            
            # Response rate: fraction of assigned tasks that got any response (Accepted/Declined/Counter-Proposed/Completed)
            # rather than sitting Pending.
            responded_tasks = [t for t in assignee_tasks if t["status"] in ["Accepted", "Declined", "Counter-Proposed", "Completed", "Review Pending"]]
            response_rate = round((len(responded_tasks) / len(assignee_tasks) * 100), 1) if assignee_tasks else 0
            
            # Average hours to first response (created_at -> accepted_at or completed_at)
            avg_response_hours = None
            response_times = []
            for t in assignee_tasks:
                if t.get("created_at") and (t.get("accepted_at") or t.get("completed_at")):
                    try:
                        created = datetime.fromisoformat(t["created_at"].replace('Z', '+00:00'))
                        responded_iso = t.get("accepted_at") or t.get("completed_at")
                        responded_at = datetime.fromisoformat(responded_iso.replace('Z', '+00:00'))
                        hours = (responded_at - created).total_seconds() / 3600
                        if hours >= 0:
                            response_times.append(hours)
                    except Exception:
                        pass
            if response_times:
                avg_response_hours = round(sum(response_times) / len(response_times), 1)
            
            assignee_details.append(AssigneeBreakdown(
                name=assignee_data["name"],
                email=assignee_data["email"],
                tasks_assigned=len(assignee_tasks),
                tasks_completed=len(completed_tasks),
                tasks_pending=len(pending_tasks),
                completion_rate=completion_rate,
                avg_completion_days=avg_days,
                response_rate=response_rate,
                avg_response_hours=avg_response_hours
            ))
    
    # Sort by tasks assigned (descending)
    assignee_details.sort(key=lambda x: x.tasks_assigned, reverse=True)
    
    return AnalyticsResponse(
        assigned_to_others_count=len(assigned_to_others),
        assigned_to_self_count=len(assigned_to_self),
        received_from_others_count=len(received_from_others),
        completed_count=len(completed),
        task_breakdown=assignee_breakdown,
        assignee_breakdown=assignee_details
    )

# Teams Performance Analytics
@api_router.get("/team/performance")
async def get_team_performance(current_user: dict = Depends(get_current_user)):
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Get direct reports
    direct_reports = await db.users.find(
        {"reports_to": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(100)
    
    performance_data = []
    
    for report in direct_reports:
        # Get all tasks assigned to this report by current user
        tasks = await db.tasks.find({
            "assigned_to": report["id"],
            "created_by": current_user["id"],
            "deleted": {"$ne": True}
        }, {"_id": 0}).to_list(1000)
        
        completed_tasks = [t for t in tasks if t["status"] == "Completed"]
        
        # Calculate avg completion time (from Accepted to Completed)
        avg_completion_time = None
        if completed_tasks:
            completion_times = []
            for t in completed_tasks:
                if t.get("completed_at") and t.get("accepted_at"):
                    try:
                        accepted = datetime.fromisoformat(t["accepted_at"].replace('Z', '+00:00'))
                        completed_at = datetime.fromisoformat(t["completed_at"].replace('Z', '+00:00'))
                        days = (completed_at - accepted).total_seconds() / 86400
                        completion_times.append(days)
                    except:
                        pass
            if completion_times:
                avg_completion_time = round(sum(completion_times) / len(completion_times), 1)
        
        completion_rate = round((len(completed_tasks) / len(tasks) * 100), 1) if tasks else 0
        
        performance_data.append({
            "user_id": report["id"],
            "name": report["name"],
            "email": report["email"],
            "tasks_assigned": len(tasks),
            "tasks_completed": len(completed_tasks),
            "completion_rate": completion_rate,
            "avg_completion_time": avg_completion_time
        })
    
    # Sort by fastest avg completion time for leaderboard (None values go last)
    leaderboard = sorted(
        performance_data, 
        key=lambda x: (x["avg_completion_time"] is None, x["avg_completion_time"] if x["avg_completion_time"] is not None else float('inf'))
    )
    
    return {
        "direct_reports": performance_data,
        "leaderboard": leaderboard
    }

@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    # Get user's saved contacts first
    contacts = await db.user_contacts.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("last_used", -1).to_list(100)
    
    contact_list = []
    for contact in contacts:
        # Check if contact is registered
        user = await db.users.find_one({"email": contact["contact_email"]}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        if user:
            contact_list.append(user)
        else:
            # Unregistered contact
            contact_list.append({
                "id": f"email_{contact['contact_email']}",
                "name": contact["contact_name"],
                "email": contact["contact_email"],
                "is_invited": True
            })
    
    # For Teams tier, add team members
    if current_user["subscription_tier"] == "teams":
        team_users = await db.users.find(
            {"company_domain": current_user["company_domain"], "id": {"$ne": current_user["id"]}}, 
            {"_id": 0, "password_hash": 0, "verification_code": 0}
        ).to_list(1000)
        
        # Add team members not in contacts
        existing_emails = {c["email"] for c in contact_list}
        for team_user in team_users:
            if team_user["email"] not in existing_emails:
                contact_list.append(team_user)
    
    # Pro and Free users only see their contacts (privacy)
    return contact_list

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one number')
        return v

@api_router.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    # Verify current password
    if not verify_password(request.current_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    new_hash = get_password_hash(request.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password updated successfully"}

class UserPreferences(BaseModel):
    theme: Optional[str] = None  # 'light', 'dark', 'minimal'
    slack_webhook_url: Optional[str] = None  # per-user Slack Incoming Webhook
    # End-of-day report opt-in + timing (a lightweight schedule the user controls in Settings).
    eod_enabled: Optional[bool] = None       # true = user wants an EOD email/Slack summary
    eod_hour: Optional[int] = None           # 0-23, PST (defaults to 17 = 5pm)
    eod_channel: Optional[str] = None        # 'email' | 'slack' | 'both'
    # Which sections to include in the EOD report (all default on when omitted).
    # Keys: completed | open | missed | manager_snapshot | suggested_plan | sheet_metrics
    eod_sections: Optional[Dict[str, bool]] = None
    # Post-login team setup + how often org/reporting changes are expected.
    team_setup_complete: Optional[bool] = None
    hierarchy_review_frequency: Optional[str] = None  # weekly | monthly | quarterly | rarely


DEFAULT_EOD_SECTIONS = {
    "completed": True,
    "open": True,
    "missed": True,
    "manager_snapshot": True,
    "suggested_plan": True,
    "sheet_metrics": True,
}


def _eod_sections_for(user: dict) -> Dict[str, bool]:
    prefs = (user or {}).get("preferences") or {}
    raw = prefs.get("eod_sections") if isinstance(prefs.get("eod_sections"), dict) else {}
    out = dict(DEFAULT_EOD_SECTIONS)
    for k in DEFAULT_EOD_SECTIONS:
        if k in raw:
            out[k] = bool(raw[k])
    return out

@api_router.put("/auth/preferences")
async def update_preferences(prefs: UserPreferences, current_user: dict = Depends(get_current_user)):
    # Merge with existing preferences instead of overwriting
    current_prefs = current_user.get("preferences") or {}
    update = {k: v for k, v in prefs.dict(exclude_none=True).items()}
    # Slack webhook is Teams-admin only — ignore/reject attempts from others
    if "slack_webhook_url" in update:
        if not _can_manage_slack_webhook(current_user):
            raise HTTPException(
                status_code=403,
                detail="Only the Teams admin can connect or change the Slack webhook.",
            )
        url = (update.get("slack_webhook_url") or "").strip()
        if url and not url.startswith("https://hooks.slack.com/"):
            raise HTTPException(status_code=400, detail="Invalid Slack webhook URL.")
        update["slack_webhook_url"] = url
    merged = {**current_prefs, **update}
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"preferences": merged}}
    )
    return {"message": "Preferences updated", "preferences": merged}

@api_router.get("/auth/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    prefs = dict(current_user.get("preferences") or {"theme": "light"})
    if "theme" not in prefs:
        prefs["theme"] = "light"
    can_manage = _can_manage_slack_webhook(current_user)
    team_webhook = await _resolve_slack_webhook(current_user)
    prefs["can_manage_slack"] = can_manage
    prefs["slack_team_connected"] = bool(team_webhook)
    prefs["eod_sections"] = _eod_sections_for(current_user)
    # Never expose the webhook URL to non-admins
    if not can_manage:
        prefs.pop("slack_webhook_url", None)
    return prefs

# Stripe Payment Routes
class CheckoutRequest(BaseModel):
    package: str  # 'pro' or 'teams'
    origin_url: str

SUBSCRIPTION_PACKAGES = {
    "pro": {"price": 900, "name": "Pro Plan"},
    "teams": {"price": 1200, "name": "Teams Plan"}
}

@api_router.post("/payments/create-checkout")
async def create_checkout(checkout_req: CheckoutRequest, http_request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    # Validate package
    if checkout_req.package not in SUBSCRIPTION_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid subscription package")
    
    # Block personal emails for Teams package
    if checkout_req.package == "teams" and is_personal_email(current_user["email"]):
        raise HTTPException(status_code=400, detail="Please use your company email to purchase Teams. Personal email domains are not supported.")
    
    package = SUBSCRIPTION_PACKAGES[checkout_req.package]
    
    # Initialize Stripe directly with live key
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Payment system not configured")
    
    import stripe
    stripe.api_key = stripe_key
    
    # Create checkout session directly with Stripe SDK
    success_url = f"{checkout_req.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout_req.origin_url}/settings"
    
    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        line_items=[{
            'price_data': {
                'currency': 'usd',
                'product_data': {'name': package["name"]},
                'unit_amount': package["price"],
                'recurring': {'interval': 'month'}
            },
            'quantity': 1,
        }],
        mode='subscription',
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "package": checkout_req.package
        }
    )
    
    # Store transaction in database
    transaction_doc = {
        "session_id": session.id,
        "user_id": current_user["id"],
        "user_email": current_user["email"],
        "package": checkout_req.package,
        "amount": package["price"],
        "currency": "usd",
        "payment_status": "pending",
        "created_at": get_pst_now().isoformat()
    }
    await db.payment_transactions.insert_one(transaction_doc)
    
    return {"url": session.url, "session_id": session.id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, http_request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    # Check if already processed
    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already completed, return cached status
    if transaction["payment_status"] == "paid":
        return {"status": "complete", "payment_status": "paid"}
    
    # Check with Stripe
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    
    checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
    
    # Update transaction if payment succeeded and not already processed
    if checkout_status.payment_status == "paid" and transaction["payment_status"] != "paid":
        # Update user subscription
        package = transaction["package"]
        update_data = {"subscription_tier": package}
        
        # If upgrading to teams, mark as team owner
        if package == "teams":
            update_data["is_team_owner"] = True
        
        await db.users.update_one(
            {"id": transaction["user_id"]},
            {"$set": update_data}
        )
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "status": checkout_status.status,
                "completed_at": get_pst_now().isoformat()
            }}
        )
        
        logging.info(f"Subscription upgraded: {transaction['user_email']} -> {package}")
    
    return {
        "status": checkout_status.status,
        "payment_status": checkout_status.payment_status
    }

@api_router.post("/create-portal-session")
async def create_portal_session(current_user: dict = Depends(get_current_user)):
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Payment system not configured")
    
    import stripe
    stripe.api_key = stripe_key
    
    # Find customer by email
    customers = stripe.Customer.list(email=current_user["email"], limit=1)
    if not customers.data:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    customer_id = customers.data[0].id
    app_url = APP_BASE_URL
    
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{app_url}/settings"
    )
    
    return {"url": session.url}

@api_router.post("/webhook/stripe")
async def stripe_webhook(http_request: HTTPRequest):
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    
    body_bytes = await http_request.body()
    signature = http_request.headers.get("Stripe-Signature")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body_bytes, signature)
        
        # Process webhook events
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            metadata = webhook_response.metadata
            
            # Update user subscription
            if "user_id" in metadata and "package" in metadata:
                update_data = {"subscription_tier": metadata["package"]}
                if metadata["package"] == "teams":
                    update_data["is_team_owner"] = True
                    
                await db.users.update_one(
                    {"id": metadata["user_id"]},
                    {"$set": update_data}
                )
                
                logging.info(f"Webhook processed: {metadata['user_email']} -> {metadata['package']}")
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# Team Management Routes
class InviteUserRequest(BaseModel):
    email: EmailStr

class TeamMemberResponse(BaseModel):
    id: str
    name: str
    email: str
    last_active: str
    status: str  # active, inactive
    days_inactive: int

class SetManagerRequest(BaseModel):
    manager_id: Optional[str] = None  # None to remove manager

class AddDirectReportRequest(BaseModel):
    user_id: str

class DirectReportTaskMetrics(BaseModel):
    user_id: str
    name: str
    email: str
    tasks_from_you_pending: int
    tasks_from_you_completed: int
    avg_completion_days: Optional[float] = None
    reports_to_you: bool = True

@api_router.get("/team/members")
async def get_team_members(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_team_owner"):
        raise HTTPException(status_code=403, detail="Only team owners can view team members")
    
    # Get all team members from same domain
    members = await db.users.find({
        "company_domain": current_user["company_domain"],
        "subscription_tier": "teams"
    }, {"_id": 0, "password_hash": 0, "verification_code": 0}).to_list(1000)
    
    now = get_pst_now()
    team_members = []
    
    for member in members:
        last_active = datetime.fromisoformat(member.get("last_active", member["created_at"]))
        days_inactive = (now - last_active.replace(tzinfo=PST)).days
        status = "inactive" if days_inactive > 60 else "active"
        
        team_members.append(TeamMemberResponse(
            id=member["id"],
            name=member["name"],
            email=member["email"],
            last_active=member.get("last_active", member["created_at"]),
            status=status,
            days_inactive=days_inactive
        ))
    
    return team_members

@api_router.post("/team/invite")
async def invite_user(invite: InviteUserRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_team_owner"):
        raise HTTPException(status_code=403, detail="Only team owners can invite users")
    
    # Check if email domain matches
    invite_domain = invite.email.split('@')[1]
    if invite_domain != current_user["company_domain"]:
        raise HTTPException(status_code=400, detail=f"Can only invite users from your company domain ({current_user['company_domain']})")
    
    # Check if user already exists
    existing = await db.users.find_one({"email": invite.email}, {"_id": 0})
    if existing:
        if existing["subscription_tier"] == "teams":
            raise HTTPException(status_code=400, detail="User is already on your team")
        else:
            # Upgrade existing user to teams
            await db.users.update_one(
                {"email": invite.email},
                {"$set": {
                    "subscription_tier": "teams",
                    "team_owner_email": current_user["email"]
                }}
            )
            return {"message": f"User {invite.email} added to team"}
    
    # Send invitation email
    app_url = APP_BASE_URL
    email_content = f"""
    <html>
        <body>
            <h2>You've been invited to join {current_user['company_domain']} on Tskflow!</h2>
            <p>{current_user['name']} ({current_user['email']}) has invited you to join their team workspace.</p>
            <p><strong>What's included:</strong></p>
            <ul>
                <li>Teams subscription (Unlimited tasks)</li>
                <li>Collaborate with your company</li>
                <li>No payment required</li>
            </ul>
            <p>Click the link below to create your account and start working:</p>
            <p><a href="{app_url}/register">Join Team</a></p>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, invite.email, f"Join {current_user['company_domain']} on Tskflow", email_content)
    
    # Store pending invitation
    await db.team_invitations.insert_one({
        "email": invite.email,
        "invited_by": current_user["id"],
        "invited_by_email": current_user["email"],
        "company_domain": current_user["company_domain"],
        "status": "pending",
        "created_at": get_pst_now().isoformat()
    })
    
    return {"message": f"Invitation sent to {invite.email}"}

@api_router.delete("/team/members/{user_id}")
async def remove_team_member(user_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_team_owner"):
        raise HTTPException(status_code=403, detail="Only team owners can remove members")
    
    # Get member
    member = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if same domain
    if member["company_domain"] != current_user["company_domain"]:
        raise HTTPException(status_code=403, detail="Can only remove users from your domain")
    
    # Can't remove self
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    # Downgrade to free tier
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "subscription_tier": "free",
            "team_owner_email": None
        }}
    )
    
    return {"message": f"Removed {member['email']} from team"}

@api_router.get("/team/billing")
async def get_team_billing(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_team_owner"):
        raise HTTPException(status_code=403, detail="Only team owners can view billing")
    
    # Count active team members
    active_members = await db.users.count_documents({
        "company_domain": current_user["company_domain"],
        "subscription_tier": "teams"
    })
    
    cost_per_user = 12.00
    total_cost = active_members * cost_per_user
    
    return {
        "active_users": active_members,
        "cost_per_user": cost_per_user,
        "total_monthly_cost": total_cost,
        "currency": "USD"
    }

# Cleanup inactive users (run periodically)
@api_router.post("/admin/cleanup-inactive")
async def cleanup_inactive_users():
    # This should be called by a cron job or scheduled task
    now = get_pst_now()
    sixty_days_ago = now - timedelta(days=60)
    
    # Find inactive team members (not owners)
    inactive_users = await db.users.find({
        "subscription_tier": "teams",
        "is_team_owner": False,
        "last_active": {"$lt": sixty_days_ago.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    removed_count = 0
    for user in inactive_users:
        # Downgrade to free
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "subscription_tier": "free",
                "team_owner_email": None
            }}
        )
        removed_count += 1
        
        logging.info(f"Removed inactive user from team: {user['email']}")
    
    return {"message": f"Removed {removed_count} inactive users from teams"}

# Hierarchical Team Structure - Direct Reports Management

@api_router.get("/team/my-manager")
async def get_my_manager(current_user: dict = Depends(get_current_user)):
    """Get who the current user reports to"""
    reports_to = current_user.get("reports_to")
    if not reports_to:
        return {"manager": None}
    
    manager = await db.users.find_one({"id": reports_to}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    return {"manager": manager}

@api_router.post("/team/set-manager")
async def set_manager(request: SetManagerRequest, current_user: dict = Depends(get_current_user)):
    """Set who you report to (your manager)"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    if request.manager_id:
        # Validate manager exists and is in same domain
        manager = await db.users.find_one({"id": request.manager_id}, {"_id": 0})
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
        
        if manager["company_domain"] != current_user["company_domain"]:
            raise HTTPException(status_code=403, detail="Can only report to someone in your organization")
        
        if manager["id"] == current_user["id"]:
            raise HTTPException(status_code=400, detail="Cannot report to yourself")
        
        # Prevent circular reporting (A reports to B, B reports to A)
        if manager.get("reports_to") == current_user["id"]:
            raise HTTPException(status_code=400, detail="Circular reporting not allowed")
    
    # Update current user's reports_to field
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"reports_to": request.manager_id}}
    )
    
    if request.manager_id:
        manager = await db.users.find_one({"id": request.manager_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        return {"message": f"Now reporting to {manager['name']}", "manager": manager}
    else:
        return {"message": "Manager removed", "manager": None}

@api_router.post("/team/add-direct-report")
async def add_direct_report(request: AddDirectReportRequest, current_user: dict = Depends(get_current_user)):
    """Add someone as your direct report (they will report to you)"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Validate user exists and is in same domain
    direct_report = await db.users.find_one({"id": request.user_id}, {"_id": 0})
    if not direct_report:
        raise HTTPException(status_code=404, detail="User not found")
    
    if direct_report["company_domain"] != current_user["company_domain"]:
        raise HTTPException(status_code=403, detail="Can only add direct reports from your organization")
    
    if direct_report["id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself as direct report")
    
    # Prevent circular reporting
    if current_user.get("reports_to") == direct_report["id"]:
        raise HTTPException(status_code=400, detail="Circular reporting not allowed - you already report to this person")
    
    # Update the user's reports_to field to current user
    await db.users.update_one(
        {"id": request.user_id},
        {"$set": {"reports_to": current_user["id"]}}
    )
    
    return {"message": f"{direct_report['name']} now reports to you"}

@api_router.delete("/team/direct-report/{user_id}")
async def remove_direct_report(user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove someone from your direct reports (they will no longer report to you)"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Check if this user actually reports to current user
    direct_report = await db.users.find_one({"id": user_id, "reports_to": current_user["id"]}, {"_id": 0})
    if not direct_report:
        raise HTTPException(status_code=404, detail="This user does not report to you")
    
    # Remove the reports_to relationship
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"reports_to": ""}}
    )
    
    return {"message": f"{direct_report['name']} no longer reports to you"}

@api_router.get("/team/direct-reports")
async def get_direct_reports(current_user: dict = Depends(get_current_user)):
    """Get all direct reports with task metrics (privacy-respecting)"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Find all users who report to current user
    direct_reports = await db.users.find(
        {"reports_to": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(1000)
    
    if not direct_reports:
        return []
    
    report_ids = [dr["id"] for dr in direct_reports]
    
    # Get tasks assigned BY current user TO direct reports (privacy-respecting)
    tasks = await db.tasks.find({
        "created_by": current_user["id"],
        "assigned_to": {"$in": report_ids}
    }, {"_id": 0}).to_list(10000)
    
    # Calculate metrics per direct report
    result = []
    for dr in direct_reports:
        dr_tasks = [t for t in tasks if t["assigned_to"] == dr["id"]]
        pending = [t for t in dr_tasks if t["status"] not in ["Completed", "Declined"]]
        completed = [t for t in dr_tasks if t["status"] == "Completed"]
        
        # Calculate average completion time for completed tasks
        avg_days = None
        if completed:
            completion_times = []
            for t in completed:
                if t.get("completed_at") and t.get("created_at"):
                    try:
                        created = datetime.fromisoformat(t["created_at"].replace('Z', '+00:00'))
                        completed_at = datetime.fromisoformat(t["completed_at"].replace('Z', '+00:00'))
                        days = (completed_at - created).total_seconds() / 86400
                        completion_times.append(days)
                    except:
                        pass
            if completion_times:
                avg_days = round(sum(completion_times) / len(completion_times), 1)
        
        result.append(DirectReportTaskMetrics(
            user_id=dr["id"],
            name=dr["name"],
            email=dr["email"],
            tasks_from_you_pending=len(pending),
            tasks_from_you_completed=len(completed),
            avg_completion_days=avg_days
        ))
    
    return result

@api_router.get("/team/potential-reports")
async def get_potential_reports(current_user: dict = Depends(get_current_user)):
    """Get every team member in the workspace (except yourself) for selection.
    Circular/self-reporting is prevented at the add-direct-report step."""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")

    # All team members from the same domain, except the current user.
    # Include users regardless of tier so Teams members on domain-Teams also appear.
    potential = await db.users.find({
        "company_domain": current_user["company_domain"],
        "id": {"$ne": current_user["id"]}
    }, {"_id": 0, "id": 1, "name": 1, "email": 1, "reports_to": 1}).to_list(1000)

    # Resolve current manager names for context
    result = []
    for p in potential:
        current_manager = None
        if p.get("reports_to"):
            mgr = await db.users.find_one({"id": p["reports_to"]}, {"_id": 0, "name": 1})
            current_manager = mgr["name"] if mgr else None
        result.append({
            "id": p["id"],
            "name": p["name"],
            "email": p["email"],
            "current_manager": current_manager,
            "reports_to_you": p.get("reports_to") == current_user["id"]
        })

    return result

@api_router.get("/team/org-structure")
async def get_org_structure(current_user: dict = Depends(get_current_user)):
    """Get organizational hierarchy for the team"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Get all team members
    members = await db.users.find({
        "company_domain": current_user["company_domain"],
        "subscription_tier": "teams"
    }, {"_id": 0, "id": 1, "name": 1, "email": 1, "reports_to": 1, "is_team_owner": 1}).to_list(1000)
    
    # Build hierarchy
    member_map = {m["id"]: m for m in members}
    
    # Find top-level members (no reports_to or team owner)
    top_level = []
    for m in members:
        m["direct_reports_count"] = len([x for x in members if x.get("reports_to") == m["id"]])
        if not m.get("reports_to") or m.get("is_team_owner"):
            top_level.append(m)
    
    return {
        "members": members,
        "top_level": top_level,
        "total_members": len(members)
    }

# Teams Trial Endpoints
@api_router.post("/start-teams-trial")
async def start_teams_trial(current_user: dict = Depends(get_current_user)):
    """Start a 30-day Teams trial for the user's domain"""
    # Block personal email domains
    if is_personal_email(current_user["email"]):
        raise HTTPException(status_code=400, detail="Please use your company email to activate Teams trial. Personal email domains are not supported.")
    
    if current_user["subscription_tier"] == "teams":
        raise HTTPException(status_code=400, detail="Already on Teams plan")
    
    trial_end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    
    # Update user to teams trial
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "subscription_tier": "teams",
            "trial_started": datetime.now(timezone.utc).isoformat(),
            "trial_ends": trial_end,
            "is_trial": True
        }}
    )
    
    # Update all users in the same domain to teams trial
    if current_user.get("company_domain"):
        await db.users.update_many(
            {"company_domain": current_user["company_domain"], "id": {"$ne": current_user["id"]}},
            {"$set": {
                "subscription_tier": "teams",
                "trial_started": datetime.now(timezone.utc).isoformat(),
                "trial_ends": trial_end,
                "is_trial": True,
                "trial_admin": current_user["id"]
            }}
        )
    
    return {"message": "Teams trial started", "trial_ends": trial_end}

@api_router.post("/request-trial-extension")
async def request_trial_extension(current_user: dict = Depends(get_current_user)):
    """Request a trial extension"""
    admin_email = os.getenv("ANALYTICS_EMAIL", "connect@hashimmahmood.com")
    
    email_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Trial Extension Request</h2>
            <p><strong>User:</strong> {current_user['name']} ({current_user['email']})</p>
            <p><strong>Domain:</strong> {current_user.get('company_domain', 'N/A')}</p>
            <p><strong>Current Trial Ends:</strong> {current_user.get('trial_ends', 'N/A')}</p>
            <p>User is requesting an additional 30-day trial extension.</p>
            <p><a href="{APP_BASE_URL}/admin/extend-trial/{current_user['id']}">Approve Extension</a></p>
        </body>
    </html>
    """
    
    try:
        resend.emails.send({
            "from": EMAIL_FROM,
            "to": [admin_email],
            "subject": f"Trial Extension Request - {current_user['email']}",
            "html": email_content
        })
    except:
        pass
    
    return {"message": "Extension request submitted"}

# Daily Analytics Job
async def send_daily_analytics():
    """Send daily product analytics email"""
    admin_email = os.getenv("ANALYTICS_EMAIL", "connect@hashimmahmood.com")
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    
    # Get metrics
    total_users = await db.users.count_documents({})
    new_signups_today = await db.users.count_documents({
        "created_at": {"$gte": yesterday.isoformat(), "$lt": today.isoformat()}
    })
    
    # Active users (logged in within 24h)
    dau = await db.users.count_documents({
        "last_login": {"$gte": yesterday.isoformat()}
    })
    
    # Tasks created today
    tasks_today = await db.tasks.count_documents({
        "created_at": {"$gte": yesterday.isoformat()}
    })
    
    # Tasks completed today
    completed_today = await db.tasks.count_documents({
        "completed_at": {"$gte": yesterday.isoformat()}
    })
    
    # Domain breakdown
    domain_pipeline = [
        {"$group": {"_id": "$company_domain", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    domains = await db.users.aggregate(domain_pipeline).to_list(10)
    
    # Trial users expiring soon
    week_from_now = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    expiring_trials = await db.users.count_documents({
        "is_trial": True,
        "trial_ends": {"$lte": week_from_now}
    })
    
    # Conversion rate
    verified_users = await db.users.count_documents({"email_verified": True})
    conversion_rate = (verified_users / total_users * 100) if total_users > 0 else 0
    
    # First session abandonment (signed up but never created a task)
    users_no_tasks = await db.users.count_documents({
        "email_verified": True,
        "id": {"$nin": await db.tasks.distinct("created_by")}
    })
    abandonment_rate = (users_no_tasks / verified_users * 100) if verified_users > 0 else 0
    
    domain_html = "".join([f"<tr><td>{d['_id'] or 'No domain'}</td><td>{d['count']}</td></tr>" for d in domains])
    
    email_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #4F46E5;">Tskflow Daily Analytics</h1>
            <p style="color: #6B7280;">{today.strftime('%B %d, %Y')}</p>
            
            <h2 style="border-bottom: 2px solid #E5E7EB; padding-bottom: 10px;">Core Metrics</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Total Users</strong></td><td>{total_users}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>New Signups (24h)</strong></td><td>{new_signups_today}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Daily Active Users</strong></td><td>{dau}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Tasks Created (24h)</strong></td><td>{tasks_today}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Tasks Completed (24h)</strong></td><td>{completed_today}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Signup → Verified Rate</strong></td><td>{conversion_rate:.1f}%</td></tr>
            </table>
            
            <h2 style="border-bottom: 2px solid #E5E7EB; padding-bottom: 10px; margin-top: 30px;">Domain Intelligence</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: #F3F4F6;"><th style="padding: 8px; text-align: left;">Domain</th><th style="padding: 8px; text-align: left;">Users</th></tr>
                {domain_html}
            </table>
            
            <h2 style="border-bottom: 2px solid #E5E7EB; padding-bottom: 10px; margin-top: 30px;">Engagement & Activation</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>First-Session Abandonment</strong></td><td>{abandonment_rate:.1f}%</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Trials Expiring (7d)</strong></td><td>{expiring_trials}</td></tr>
            </table>
            
            <h2 style="border-bottom: 2px solid #E5E7EB; padding-bottom: 10px; margin-top: 30px;">Insights</h2>
            <div style="background: #F0FDF4; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <strong style="color: #166534;">What's Working:</strong>
                <p style="margin: 5px 0; color: #166534;">{"Task creation active" if tasks_today > 0 else "Need more task engagement"}</p>
            </div>
            <div style="background: #FEF2F2; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <strong style="color: #991B1B;">What's Not:</strong>
                <p style="margin: 5px 0; color: #991B1B;">{"High abandonment - users signing up but not creating tasks" if abandonment_rate > 50 else "Activation funnel needs monitoring"}</p>
            </div>
            <div style="background: #EFF6FF; padding: 15px; border-radius: 8px;">
                <strong style="color: #1E40AF;">Double Down On:</strong>
                <p style="margin: 5px 0; color: #1E40AF;">{"Domain-based team adoption" if len(domains) > 0 else "First user acquisition"}</p>
            </div>
            
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px; text-align: center;">
                Tskflow Analytics • {today.strftime('%Y')}
            </p>
        </body>
    </html>
    """
    
    try:
        resend.emails.send({
            "from": f"Jarvis Analytics <{EMAIL_FROM_ADDR}>",
            "to": [admin_email],
            "subject": f"Tskflow Daily Analytics - {today.strftime('%b %d')}",
            "html": email_content
        })
        logger.info(f"Daily analytics sent to {admin_email}")
    except Exception as e:
        logger.error(f"Failed to send analytics: {e}")

# Trial reminder job
async def send_trial_reminders():
    """Send trial expiration reminders from Day 27"""
    now = datetime.now(timezone.utc)
    
    # Find trials ending in 1-3 days
    for days_left in [3, 2, 1]:
        target_date = (now + timedelta(days=days_left)).date().isoformat()
        
        trial_users = await db.users.find({
            "is_trial": True,
            "trial_ends": {"$regex": f"^{target_date}"}
        }, {"_id": 0}).to_list(1000)
        
        for user in trial_users:
            # Count domain users
            domain_users = await db.users.count_documents({
                "company_domain": user.get("company_domain"),
                "subscription_tier": "teams"
            }) if user.get("company_domain") else 1
            
            monthly_cost = domain_users * 12  # $12/user/month
            
            email_content = f"""
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #4F46E5;">Your Teams Trial Ends in {days_left} Day{'s' if days_left > 1 else ''}</h1>
                    
                    <div style="background: #F9FAFB; padding: 20px; border-radius: 12px; margin: 20px 0;">
                        <p><strong>Trial End Date:</strong> {user.get('trial_ends', 'N/A')[:10]}</p>
                        <p><strong>Team Members:</strong> {domain_users}</p>
                        <p><strong>Monthly Cost:</strong> ${monthly_cost}/month</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{APP_BASE_URL}/settings" style="background: #4F46E5; color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block; margin: 5px;">
                            Continue & Pay
                        </a>
                        <a href="{APP_BASE_URL}/settings?action=cancel" style="background: #EF4444; color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block; margin: 5px;">
                            Cancel Trial
                        </a>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="{APP_BASE_URL}/request-extension" style="color: #6B7280;">Request Trial Extension</a>
                    </p>
                    
                    <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px; text-align: center;">
                        No charges until you confirm. Cancel anytime.
                    </p>
                </body>
            </html>
            """
            
            try:
                resend.emails.send({
                    "from": EMAIL_FROM,
                    "to": [user["email"]],
                    "subject": f"Your Teams trial ends in {days_left} day{'s' if days_left > 1 else ''}",
                    "html": email_content
                })
            except:
                pass

# Manual trigger for analytics (for testing)
@api_router.post("/admin/send-analytics")
async def trigger_analytics(background_tasks: BackgroundTasks):
    background_tasks.add_task(send_daily_analytics)
    return {"message": "Analytics email queued"}

# Admin endpoint to view user stats
@api_router.get("/admin/stats")
async def get_admin_stats():
    """Get user and subscription statistics"""
    users = await db.users.find({}, {"_id": 0, "email": 1, "name": 1, "subscription_tier": 1, "created_at": 1, "is_trial": 1}).to_list(None)
    tasks = await db.tasks.count_documents({})
    
    # Count by tier
    tier_counts = {"free": 0, "pro": 0, "teams": 0}
    personal_email_teams = []
    
    for u in users:
        tier = u.get("subscription_tier", "free")
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        
        # Track teams users with personal emails
        if tier == "teams" and is_personal_email(u.get("email", "")):
            personal_email_teams.append({
                "email": u.get("email"),
                "name": u.get("name"),
                "is_trial": u.get("is_trial", False)
            })
    
    return {
        "total_users": len(users),
        "total_tasks": tasks,
        "by_tier": tier_counts,
        "personal_email_teams_users": personal_email_teams,
        "users": [{"email": u.get("email"), "name": u.get("name"), "tier": u.get("subscription_tier", "free")} for u in users]
    }

# Admin Access Grants Management
class AdminLogin(BaseModel):
    password: str

class AccessGrant(BaseModel):
    type: str  # "email" or "domain"
    value: str  # email address or domain
    plan: str  # "pro" or "teams"

@api_router.post("/admin/login")
async def admin_login(login: AdminLogin):
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password or login.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin password")
    
    # Create admin token (24 hour expiry)
    token = jwt.encode(
        {"sub": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
        SECRET_KEY, algorithm=ALGORITHM
    )
    return {"access_token": token, "token_type": "bearer"}

async def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return True
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid admin token")

@api_router.get("/admin/access-grants")
async def get_access_grants(admin: bool = Depends(verify_admin)):
    """Get all email and domain access grants"""
    grants = await db.access_grants.find({}, {"_id": 0}).to_list(None)
    return {"grants": grants}

@api_router.post("/admin/access-grants")
async def add_access_grant(grant: AccessGrant, admin: bool = Depends(verify_admin)):
    """Add email or domain for free Pro/Teams access"""
    if grant.type not in ["email", "domain"]:
        raise HTTPException(status_code=400, detail="Type must be 'email' or 'domain'")
    if grant.plan not in ["pro", "teams"]:
        raise HTTPException(status_code=400, detail="Plan must be 'pro' or 'teams'")
    
    value = grant.value.lower().strip()
    if grant.type == "domain" and not value.startswith("@"):
        value = "@" + value
    
    # Check if already exists
    existing = await db.access_grants.find_one({"type": grant.type, "value": value})
    if existing:
        raise HTTPException(status_code=400, detail="Grant already exists")
    
    # Add grant
    await db.access_grants.insert_one({
        "type": grant.type,
        "value": value,
        "plan": grant.plan,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Upgrade existing users
    if grant.type == "email":
        await db.users.update_one(
            {"email": value},
            {"$set": {"subscription_tier": grant.plan, "granted_access": True}}
        )
    else:  # domain
        domain = value.replace("@", "")
        await db.users.update_many(
            {"company_domain": domain},
            {"$set": {"subscription_tier": grant.plan, "granted_access": True}}
        )
    
    return {"message": f"Access grant added for {value}"}

@api_router.delete("/admin/access-grants")
async def remove_access_grant(grant: AccessGrant, admin: bool = Depends(verify_admin)):
    """Remove email or domain access grant and downgrade users"""
    value = grant.value.lower().strip()
    if grant.type == "domain" and not value.startswith("@"):
        value = "@" + value
    
    # Find and remove grant
    result = await db.access_grants.delete_one({"type": grant.type, "value": value})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Grant not found")
    
    # Find affected users and downgrade them
    affected_users = []
    if grant.type == "email":
        user = await db.users.find_one({"email": value, "granted_access": True}, {"_id": 0, "email": 1, "name": 1})
        if user:
            affected_users.append(user)
            await db.users.update_one(
                {"email": value},
                {"$set": {"subscription_tier": "free"}, "$unset": {"granted_access": ""}}
            )
    else:  # domain
        domain = value.replace("@", "")
        users = await db.users.find({"company_domain": domain, "granted_access": True}, {"_id": 0, "email": 1, "name": 1}).to_list(None)
        affected_users = users
        await db.users.update_many(
            {"company_domain": domain, "granted_access": True},
            {"$set": {"subscription_tier": "free"}, "$unset": {"granted_access": ""}}
        )
    
    # Send notification emails
    for user in affected_users:
        try:
            email_content = f"""
            <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Access Update</h1>
                </div>
                <div style="padding: 30px;">
                    <p>Hi {user.get('name', 'there')},</p>
                    <p>Your complimentary access to Tskflow has ended. You've been moved to the Free plan.</p>
                    <p>You can continue using Tskflow with unlimited tasks, or upgrade to Pro/Teams for additional features.</p>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="{APP_BASE_URL}/settings" style="background: #6366F1; color: white; padding: 12px 24px; border-radius: 20px; text-decoration: none;">View Plans</a>
                    </div>
                </div>
            </body></html>
            """
            resend.emails.send({
                "from": EMAIL_FROM,
                "to": [user["email"]],
                "subject": "Your Tskflow Access Has Been Updated",
                "html": email_content
            })
        except Exception as e:
            logging.error(f"Failed to send access revoked email: {e}")
    
    return {"message": f"Access revoked for {value}", "affected_users": len(affected_users)}

# Google Calendar OAuth Configuration
GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events']

def get_google_flow(redirect_uri: str):
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri]
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=redirect_uri
    )

@api_router.get("/auth/google/connect")
async def google_calendar_connect(http_request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    """Initiate Google Calendar OAuth flow"""
    redirect_uri = f"{APP_BASE_URL}/api/auth/google/callback"
    flow = get_google_flow(redirect_uri)
    auth_url, state = flow.authorization_url(access_type='offline', prompt='consent')
    
    # Store state with user_id for callback
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"auth_url": auth_url}

@api_router.get("/auth/google/callback")
async def google_calendar_callback(code: str, state: str, http_request: HTTPRequest):
    """Handle Google OAuth callback"""
    # Verify state
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?error=invalid_state")
    
    user_id = state_doc["user_id"]
    await db.oauth_states.delete_one({"state": state})
    
    try:
        redirect_uri = f"{APP_BASE_URL}/api/auth/google/callback"
        flow = get_google_flow(redirect_uri)
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Store credentials
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "google_calendar_connected": True,
                "google_credentials": {
                    "token": credentials.token,
                    "refresh_token": credentials.refresh_token,
                    "token_uri": credentials.token_uri,
                    "client_id": credentials.client_id,
                    "client_secret": credentials.client_secret,
                    "expiry": credentials.expiry.isoformat() if credentials.expiry else None
                }
            }}
        )
        
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?calendar=connected")
    except Exception as e:
        logging.error(f"Google OAuth error: {e}")
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?error=oauth_failed")

@api_router.delete("/auth/google/disconnect")
async def google_calendar_disconnect(current_user: dict = Depends(get_current_user)):
    """Disconnect Google Calendar"""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"google_calendar_connected": False}, "$unset": {"google_credentials": ""}}
    )
    return {"message": "Google Calendar disconnected"}


def get_google_sheets_flow(redirect_uri: str):
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=SHEETS_SCOPES,
        redirect_uri=redirect_uri,
    )


@api_router.get("/auth/google/sheets/connect")
async def google_sheets_connect(http_request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    """Initiate Google Sheets OAuth (read-only) for daily metrics sync."""
    redirect_uri = f"{APP_BASE_URL}/api/auth/google/sheets/callback"
    flow = get_google_sheets_flow(redirect_uri)
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": current_user["id"],
        "purpose": "google_sheets",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"auth_url": auth_url}


@api_router.get("/auth/google/sheets/callback")
async def google_sheets_callback(code: str, state: str, http_request: HTTPRequest):
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?error=invalid_state")
    user_id = state_doc["user_id"]
    await db.oauth_states.delete_one({"state": state})
    try:
        redirect_uri = f"{APP_BASE_URL}/api/auth/google/sheets/callback"
        flow = get_google_sheets_flow(redirect_uri)
        flow.fetch_token(code=code)
        credentials = flow.credentials
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "google_sheets_connected": True,
                "google_sheets_credentials": {
                    "token": credentials.token,
                    "refresh_token": credentials.refresh_token,
                    "token_uri": credentials.token_uri,
                    "client_id": credentials.client_id,
                    "client_secret": credentials.client_secret,
                    "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
                },
            }},
        )
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?sheets=connected")
    except Exception as e:
        logging.error(f"Google Sheets OAuth error: {e}")
        return RedirectResponse(url=f"{APP_BASE_URL}/settings?error=sheets_oauth_failed")


@api_router.delete("/auth/google/sheets/disconnect")
async def google_sheets_disconnect(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"google_sheets_connected": False}, "$unset": {"google_sheets_credentials": ""}},
    )
    return {"message": "Google Sheets disconnected"}


class SheetMetricMapping(BaseModel):
    key: Optional[str] = None
    label: str
    column: str
    daily_target: Optional[float] = None


class SheetSyncConfigBody(BaseModel):
    spreadsheet_url: str
    sheet_name: str = "Sheet1"
    person_column: str = "A"
    date_column: str = "B"
    has_header: bool = True
    metrics: List[SheetMetricMapping] = []
    name: Optional[str] = "Daily activity"


@api_router.get("/sheets/config")
async def get_sheet_sync_configs(current_user: dict = Depends(get_current_user)):
    configs = await db.sheet_sync_configs.find(
        {"owner_user_id": current_user["id"]},
        {"_id": 0},
    ).to_list(50)
    return {
        "connected": bool(current_user.get("google_sheets_connected")),
        "configs": configs,
    }


@api_router.post("/sheets/config")
async def upsert_sheet_sync_config(body: SheetSyncConfigBody, current_user: dict = Depends(get_current_user)):
    if not current_user.get("google_sheets_connected") or not current_user.get("google_sheets_credentials"):
        raise HTTPException(status_code=400, detail="Connect Google Sheets first")
    try:
        spreadsheet_id = extract_spreadsheet_id(body.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not body.metrics:
        raise HTTPException(status_code=400, detail="Add at least one metric column mapping")
    now = get_pst_now().isoformat()
    metrics = []
    for m in body.metrics:
        key = (m.key or m.label or "").strip().lower().replace(" ", "_")
        metrics.append({
            "key": key,
            "label": m.label,
            "column": m.column,
            "daily_target": m.daily_target,
        })
    # One primary config per owner for simplicity — update latest or insert
    existing = await db.sheet_sync_configs.find_one({"owner_user_id": current_user["id"]}, {"_id": 0})
    doc = {
        "id": (existing or {}).get("id") or str(uuid.uuid4()),
        "owner_user_id": current_user["id"],
        "company_domain": current_user.get("company_domain"),
        "name": body.name or "Daily activity",
        "spreadsheet_id": spreadsheet_id,
        "spreadsheet_url": body.spreadsheet_url,
        "sheet_name": body.sheet_name or "Sheet1",
        "person_column": body.person_column,
        "date_column": body.date_column,
        "has_header": body.has_header,
        "metrics": metrics,
        "updated_at": now,
        "created_at": (existing or {}).get("created_at") or now,
        "last_synced_at": (existing or {}).get("last_synced_at"),
        "last_sync_count": (existing or {}).get("last_sync_count"),
        "last_sync_error": None,
    }
    await db.sheet_sync_configs.update_one(
        {"id": doc["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "config": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.post("/sheets/sync")
async def sync_google_sheets_now(current_user: dict = Depends(get_current_user)):
    """Pull mapped Google Sheet rows into daily_metrics."""
    result = await _sync_sheets_for_user(current_user)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@api_router.get("/sheets/metrics")
async def get_daily_sheet_metrics(
    date: Optional[str] = None,
    person: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    day = date or get_pst_now().strftime("%Y-%m-%d")
    domain = current_user.get("company_domain")
    if person:
        rows = await find_person_metrics(db, current_user, person, date=day)
        return {"date": day, "metrics": rows}
    filt: Dict[str, Any] = {"date": day}
    if domain:
        filt["$or"] = [
            {"company_domain": domain},
            {"owner_user_id": current_user["id"]},
        ]
    else:
        filt["owner_user_id"] = current_user["id"]
    rows = await db.daily_metrics.find(filt, {"_id": 0}).to_list(500)
    return {"date": day, "metrics": rows}


async def _sync_sheets_for_user(user: dict) -> dict:
    if not user.get("google_sheets_connected") or not user.get("google_sheets_credentials"):
        return {"error": "Google Sheets not connected", "synced": 0}
    configs = await db.sheet_sync_configs.find({"owner_user_id": user["id"]}, {"_id": 0}).to_list(20)
    if not configs:
        return {"error": "No sheet mapping configured", "synced": 0}
    total = 0
    errors = []
    for cfg in configs:
        try:
            values = fetch_sheet_values(
                user["google_sheets_credentials"],
                cfg["spreadsheet_id"],
                cfg.get("sheet_name") or "Sheet1",
            )
            # Persist refreshed token if google client refreshed it
            rows = parse_metrics_rows(
                values,
                person_column=cfg.get("person_column") or "A",
                date_column=cfg.get("date_column") or "B",
                metrics=cfg.get("metrics") or [],
                has_header=bool(cfg.get("has_header", True)),
            )
            n = await upsert_daily_metrics(
                db,
                owner_user_id=user["id"],
                company_domain=user.get("company_domain") or cfg.get("company_domain"),
                config_id=cfg["id"],
                rows=rows,
            )
            total += n
            await db.sheet_sync_configs.update_one(
                {"id": cfg["id"]},
                {"$set": {
                    "last_synced_at": get_pst_now().isoformat(),
                    "last_sync_count": n,
                    "last_sync_error": None,
                }},
            )
        except Exception as e:
            logging.error(f"[sheets_sync] {e}")
            errors.append(str(e))
            await db.sheet_sync_configs.update_one(
                {"id": cfg["id"]},
                {"$set": {"last_sync_error": str(e)[:500]}},
            )
    if errors and total == 0:
        return {"error": errors[0], "synced": 0}
    return {"ok": True, "synced": total, "errors": errors}


async def _sync_all_sheet_configs():
    """Background job: sync every user with a sheet config."""
    try:
        owners = await db.sheet_sync_configs.distinct("owner_user_id")
        for uid in owners:
            user = await db.users.find_one({"id": uid}, {"_id": 0})
            if not user:
                continue
            await _sync_sheets_for_user(user)
    except Exception as e:
        logging.error(f"[sheets_sync_all] {e}")


async def create_calendar_event(user_id: str, task: dict):
    """Create a Google Calendar event for a task"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("google_calendar_connected") or not user.get("google_credentials"):
        return None
    
    try:
        creds_data = user["google_credentials"]
        credentials = Credentials(
            token=creds_data["token"],
            refresh_token=creds_data.get("refresh_token"),
            token_uri=creds_data["token_uri"],
            client_id=creds_data["client_id"],
            client_secret=creds_data["client_secret"]
        )
        
        service = build('calendar', 'v3', credentials=credentials)
        
        # Calculate event time (30 min before due date or now + 1 hour)
        due_date = task.get("due_date")
        if due_date:
            if isinstance(due_date, str):
                start_time = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            else:
                start_time = due_date
        else:
            start_time = datetime.now(timezone.utc) + timedelta(hours=1)
        
        end_time = start_time + timedelta(minutes=30)
        
        event = {
            'summary': f"🔴 {task['title']}" if task.get('priority') in ['high', 'urgent'] else task['title'],
            'description': f"{task.get('description', '')}\n\n---\nView in Tskflow: {APP_BASE_URL}/tasks/{task['id']}",
            'start': {'dateTime': start_time.isoformat(), 'timeZone': 'UTC'},
            'end': {'dateTime': end_time.isoformat(), 'timeZone': 'UTC'},
            'reminders': {'useDefault': False, 'overrides': [{'method': 'popup', 'minutes': 10}]}
        }
        
        created_event = service.events().insert(calendarId='primary', body=event).execute()
        
        # Store event ID for updates/deletion
        await db.tasks.update_one(
            {"id": task["id"]},
            {"$set": {"calendar_event_id": created_event['id']}}
        )
        
        return created_event['id']
    except Exception as e:
        logging.error(f"Calendar event creation failed: {e}")
        return None


async def delete_calendar_event(user_id: str, event_id: str) -> bool:
    """Remove a previously-created Google Calendar event from the assignee's calendar.
    Uses the assignee's stored OAuth credentials — the same ones used to create it."""
    if not user_id or not event_id:
        return False
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("google_calendar_connected") or not user.get("google_credentials"):
        return False
    try:
        creds_data = user["google_credentials"]
        credentials = Credentials(
            token=creds_data["token"],
            refresh_token=creds_data.get("refresh_token"),
            token_uri=creds_data["token_uri"],
            client_id=creds_data["client_id"],
            client_secret=creds_data["client_secret"]
        )
        service = build('calendar', 'v3', credentials=credentials)
        # sendUpdates=all so any attendees also see the cancellation
        service.events().delete(calendarId='primary', eventId=event_id, sendUpdates='all').execute()
        return True
    except Exception as e:
        # 404/410 = event already gone — treat as success
        msg = str(e).lower()
        if '404' in msg or '410' in msg or 'not found' in msg or 'deleted' in msg:
            return True
        logging.error(f"Calendar event delete failed for user={user_id} event={event_id}: {e}")
        return False

# ==========================================================================
# USER GROUPS (Pro & Teams) - save a named group of emails for quick assign
# ==========================================================================

class GroupCreate(BaseModel):
    name: str
    emails: List[str] = []

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    emails: Optional[List[str]] = None

def _clean_emails(emails: List[str]) -> List[str]:
    seen = set()
    cleaned = []
    for e in emails or []:
        e = (e or "").strip().lower()
        if e and "@" in e and e not in seen:
            seen.add(e)
            cleaned.append(e)
    return cleaned

def _require_paid(current_user: dict):
    if current_user.get("subscription_tier") not in ("pro", "teams"):
        raise HTTPException(status_code=403, detail="Groups are available on Pro and Teams plans only")

@api_router.get("/groups")
async def list_groups(current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    # Org-wide by company domain, plus any groups the user owns (covers missing domain).
    company_domain = current_user.get("company_domain")
    query = {"owner_id": current_user["id"]}
    if company_domain:
        query = {"$or": [{"company_domain": company_domain}, {"owner_id": current_user["id"]}]}

    groups = await db.user_groups.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    # De-dupe by id while preserving order
    seen = set()
    out = []
    for g in groups:
        gid = g.get("id")
        if gid and gid in seen:
            continue
        if gid:
            seen.add(gid)
        out.append(g)
    return out

@api_router.post("/groups")
async def create_group(group: GroupCreate, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    name = (group.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    company_domain = current_user.get("company_domain")
    # Allow personal groups even without a company domain (owner-scoped).
    dup_query = {
        "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
    }
    if company_domain:
        dup_query["company_domain"] = company_domain
    else:
        dup_query["owner_id"] = current_user["id"]

    existing = await db.user_groups.find_one(dup_query, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A group with this name already exists")

    group_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": current_user["id"],
        "company_domain": company_domain,
        "name": name,
        "emails": _clean_emails(group.emails),
        "created_at": get_pst_now().isoformat(),
        "created_by_name": current_user["name"]
    }
    await db.user_groups.insert_one(group_doc)
    group_doc.pop("_id", None)
    return group_doc

@api_router.put("/groups/{group_id}")
async def update_group(group_id: str, update: GroupUpdate, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    company_domain = current_user.get("company_domain")
    
    # Org members (same domain) or the owner can edit
    or_clauses = [{"owner_id": current_user["id"]}]
    if company_domain:
        or_clauses.append({"company_domain": company_domain})
    group = await db.user_groups.find_one({"id": group_id, "$or": or_clauses}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    set_data = {}
    if update.name is not None:
        new_name = update.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Group name cannot be empty")
        dup_q = {
            "name": {"$regex": f"^{re.escape(new_name)}$", "$options": "i"},
            "id": {"$ne": group_id},
        }
        if company_domain:
            dup_q["company_domain"] = company_domain
        else:
            dup_q["owner_id"] = current_user["id"]
        dup = await db.user_groups.find_one(dup_q, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail="A group with this name already exists")
        set_data["name"] = new_name
    if update.emails is not None:
        set_data["emails"] = _clean_emails(update.emails)

    if set_data:
        set_data["updated_at"] = get_pst_now().isoformat()
        set_data["updated_by"] = current_user["id"]
        await db.user_groups.update_one({"id": group_id}, {"$set": set_data})

    updated = await db.user_groups.find_one({"id": group_id}, {"_id": 0})
    return updated

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    company_domain = current_user.get("company_domain")
    
    or_clauses = [{"owner_id": current_user["id"]}]
    if company_domain:
        or_clauses.append({"company_domain": company_domain})
    result = await db.user_groups.delete_one({"id": group_id, "$or": or_clauses})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group deleted"}


# ==========================================================================
# PROSPECTING CRM (Leads) - a live, searchable repository of sales targets
# ==========================================================================

LEAD_STATUSES = ["To Call", "Called", "Interested", "Won", "Lost"]

# Curated Ideal Customer Profile for Tskflow (B2B accountability tool)
ICP_GUIDE = {
    "personas": [
        {"title": "Operations Manager / Director of Operations", "why": "Owns execution and accountability across teams."},
        {"title": "Team Lead / People Manager", "why": "Delegates tasks daily and needs ownership + follow-through."},
        {"title": "Project / Program Manager", "why": "Coordinates deliverables and deadlines across contributors."},
        {"title": "Corporate Trainer / L&D Manager", "why": "Drives behavior change and accountability in teams."},
        {"title": "Agency Owner / Founder (5-200 employees)", "why": "Needs visibility into who committed to what and when."},
        {"title": "Customer Success / Support Lead", "why": "Manages task queues and SLAs with clear ownership."},
    ],
    "industries": [
        "Marketing & Creative Agencies", "Software / SaaS", "Professional Services & Consulting",
        "Construction & Field Services", "Healthcare Admin", "Real Estate Teams",
        "Logistics & Operations", "Financial Services"
    ],
    "regions": [
        "United States - Northeast (NYC, Boston)", "United States - West (SF, LA, Seattle)",
        "United States - South (Austin, Atlanta, Miami)", "United States - Midwest (Chicago)",
        "Canada - Toronto / Ontario", "Canada - Vancouver / BC", "Canada - Montreal / Quebec"
    ],
    "search_queries": [
        '"Operations Manager" agency Toronto',
        '"Director of Operations" SaaS United States',
        '"Team Lead" OR "People Manager" marketing agency',
        '"Corporate Trainer" OR "L&D Manager" professional services',
        '"Project Manager" construction firm Canada',
        'Founder agency 10-50 employees "accountability"',
    ],
    "where_to_find": [
        "LinkedIn Sales Navigator (filter by title + region + company size)",
        "LinkedIn search by job title and location",
        "Apollo.io / Hunter.io exports (then import the CSV here)",
        "Local chambers of commerce & industry association member lists",
        "Conference / webinar attendee lists in your niche",
    ]
}

class LeadCreate(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    persona: Optional[str] = None
    linkedin: Optional[str] = None
    status: Optional[str] = "To Call"
    notes: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    persona: Optional[str] = None
    linkedin: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LeadsImport(BaseModel):
    leads: List[LeadCreate]

ADMIN_LEADS_OWNER = "admin"

@api_router.get("/leads/icp")
async def get_icp_guide(admin: bool = Depends(verify_admin)):
    return ICP_GUIDE

@api_router.get("/leads")
async def list_leads(
    admin: bool = Depends(verify_admin),
    q: Optional[str] = None,
    status: Optional[str] = None,
    region: Optional[str] = None,
    persona: Optional[str] = None
):
    query = {"owner_id": ADMIN_LEADS_OWNER}
    if status and status != "all":
        query["status"] = status
    if region and region != "all":
        query["region"] = region
    if persona and persona != "all":
        query["persona"] = persona
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"name": regex}, {"company": regex}, {"title": regex},
            {"email": regex}, {"industry": regex}, {"notes": regex}
        ]
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    pipeline = [
        {"$match": {"owner_id": ADMIN_LEADS_OWNER}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    raw_counts = await db.leads.aggregate(pipeline).to_list(50)
    counts = {s: 0 for s in LEAD_STATUSES}
    total = 0
    for rc in raw_counts:
        total += rc["count"]
        if rc["_id"] in counts:
            counts[rc["_id"]] = rc["count"]
    return {"leads": leads, "counts": counts, "total": total, "statuses": LEAD_STATUSES}

@api_router.post("/leads")
async def create_lead(lead: LeadCreate, admin: bool = Depends(verify_admin)):
    if not (lead.name or "").strip():
        raise HTTPException(status_code=400, detail="Lead name is required")
    status = lead.status if lead.status in LEAD_STATUSES else "To Call"
    now = get_pst_now().isoformat()
    lead_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": ADMIN_LEADS_OWNER,
        "name": lead.name.strip(),
        "title": lead.title,
        "company": lead.company,
        "email": lead.email,
        "phone": lead.phone,
        "region": lead.region,
        "industry": lead.industry,
        "persona": lead.persona,
        "linkedin": lead.linkedin,
        "status": status,
        "notes": lead.notes,
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead_doc)
    lead_doc.pop("_id", None)
    return lead_doc

@api_router.post("/leads/import")
async def import_leads(payload: LeadsImport, admin: bool = Depends(verify_admin)):
    if len(payload.leads) > 5000:
        raise HTTPException(status_code=400, detail="Import is limited to 5000 leads at a time")
    now = get_pst_now().isoformat()
    docs = []
    for lead in payload.leads:
        if not (lead.name or "").strip():
            continue
        status = lead.status if lead.status in LEAD_STATUSES else "To Call"
        docs.append({
            "id": str(uuid.uuid4()),
            "owner_id": ADMIN_LEADS_OWNER,
            "name": lead.name.strip(),
            "title": lead.title,
            "company": lead.company,
            "email": lead.email,
            "phone": lead.phone,
            "region": lead.region,
            "industry": lead.industry,
            "persona": lead.persona,
            "linkedin": lead.linkedin,
            "status": status,
            "notes": lead.notes,
            "created_at": now,
            "updated_at": now
        })
    if docs:
        await db.leads.insert_many(docs)
    return {"imported": len(docs)}

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, update: LeadUpdate, admin: bool = Depends(verify_admin)):
    lead = await db.leads.find_one({"id": lead_id, "owner_id": ADMIN_LEADS_OWNER}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    set_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "status" in set_data and set_data["status"] not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    set_data["updated_at"] = get_pst_now().isoformat()
    await db.leads.update_one({"id": lead_id}, {"$set": set_data})
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return updated

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, admin: bool = Depends(verify_admin)):
    result = await db.leads.delete_one({"id": lead_id, "owner_id": ADMIN_LEADS_OWNER})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead deleted"}


# ==========================================================================
# APOLLO.IO integration (admin-only) - search real prospects + unlock contact info
# ==========================================================================

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"

class ApolloSearchRequest(BaseModel):
    person_titles: List[str] = []
    person_locations: List[str] = []
    organization_num_employees_ranges: List[str] = []
    page: int = 1
    per_page: int = 25

class ApolloSaveRequest(BaseModel):
    # Identifying fields from a search result used to enrich + save
    apollo_person_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    organization_name: Optional[str] = None
    domain: Optional[str] = None
    linkedin_url: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    reveal: bool = True  # unlock email + phone (consumes Apollo credits)

def _apollo_headers():
    api_key = os.getenv("APOLLO_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Apollo API key not configured")
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }

def _normalize_apollo_person(p: dict) -> dict:
    org = p.get("organization") or {}
    city = p.get("city")
    state = p.get("state")
    country = p.get("country")
    region = ", ".join([x for x in [city, state, country] if x])
    email = p.get("email")
    if email and "email_not_unlocked" in email:
        email = None  # masked
    return {
        "apollo_person_id": p.get("id"),
        "first_name": p.get("first_name"),
        "last_name": p.get("last_name"),
        "name": p.get("name") or " ".join([x for x in [p.get("first_name"), p.get("last_name")] if x]),
        "title": p.get("title"),
        "company": org.get("name"),
        "domain": org.get("primary_domain") or org.get("website_url"),
        "industry": org.get("industry") or p.get("industry"),
        "linkedin": p.get("linkedin_url"),
        "region": region,
        "email": email,
        "phone": None,
    }

@api_router.post("/leads/apollo-search")
async def apollo_search(req: ApolloSearchRequest, admin: bool = Depends(verify_admin)):
    payload = {
        "page": max(1, req.page),
        "per_page": min(100, max(1, req.per_page)),
    }
    if req.person_titles:
        payload["person_titles"] = req.person_titles
    if req.person_locations:
        payload["person_locations"] = req.person_locations
    if req.organization_num_employees_ranges:
        payload["organization_num_employees_ranges"] = req.organization_num_employees_ranges

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{APOLLO_BASE_URL}/mixed_people/api_search", headers=_apollo_headers(), json=payload)
    except httpx.RequestError as e:
        logging.error(f"Apollo search request error: {e}")
        raise HTTPException(status_code=502, detail="Could not reach Apollo")

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Apollo rejected the API key")
    if resp.status_code == 403:
        # Free Apollo plans cannot use the search/enrichment API
        try:
            err = resp.json()
        except Exception:
            err = {}
        if err.get("error_code") == "API_INACCESSIBLE":
            raise HTTPException(status_code=402, detail="Your Apollo plan does not include API access. Upgrade to a paid Apollo plan (Basic or higher) at app.apollo.io to enable live prospect search.")
        raise HTTPException(status_code=403, detail="Apollo access forbidden")
    if resp.status_code >= 400:
        logging.error(f"Apollo search failed {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(status_code=502, detail=f"Apollo search failed ({resp.status_code})")

    data = resp.json()
    people = data.get("people") or []
    pagination = data.get("pagination") or {}
    results = [_normalize_apollo_person(p) for p in people]
    return {
        "results": results,
        "page": pagination.get("page", req.page),
        "total_pages": pagination.get("total_pages"),
        "total_entries": pagination.get("total_entries"),
    }

@api_router.post("/leads/apollo-save")
async def apollo_save(req: ApolloSaveRequest, admin: bool = Depends(verify_admin)):
    """Enrich a person via Apollo People Match (unlock email + phone) then save as a lead.
    Phone reveal is asynchronous and is delivered to the webhook below."""
    enriched = {}
    if req.reveal:
        params = {
            "reveal_personal_emails": "true",
            "reveal_phone_number": "true",
        }
        if req.apollo_person_id:
            params["id"] = req.apollo_person_id
        if req.first_name:
            params["first_name"] = req.first_name
        if req.last_name:
            params["last_name"] = req.last_name
        if req.organization_name:
            params["organization_name"] = req.organization_name
        if req.domain:
            params["domain"] = req.domain
        if req.linkedin_url:
            params["linkedin_url"] = req.linkedin_url

        webhook_token = os.getenv("APOLLO_WEBHOOK_TOKEN")
        webhook_url = f"{APP_BASE_URL.replace('http://', 'https://')}/api/webhooks/apollo/phone?token={webhook_token}"
        params["webhook_url"] = webhook_url

        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.post(f"{APOLLO_BASE_URL}/people/match", headers=_apollo_headers(), params=params)
            if resp.status_code < 400:
                body = resp.json()
                person = body.get("person") or body
                if isinstance(person, dict):
                    enriched = _normalize_apollo_person(person)
            else:
                logging.error(f"Apollo match failed {resp.status_code}: {resp.text[:300]}")
        except httpx.RequestError as e:
            logging.error(f"Apollo match request error: {e}")

    now = get_pst_now().isoformat()
    name = enriched.get("name") or req.name or " ".join([x for x in [req.first_name, req.last_name] if x]) or "Unknown"
    lead_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": ADMIN_LEADS_OWNER,
        "apollo_person_id": req.apollo_person_id or enriched.get("apollo_person_id"),
        "name": name.strip(),
        "title": enriched.get("title") or req.title,
        "company": enriched.get("company") or req.organization_name,
        "email": enriched.get("email"),
        "phone": enriched.get("phone"),  # may arrive later via webhook
        "region": enriched.get("region") or req.region,
        "industry": enriched.get("industry") or req.industry,
        "persona": req.title,
        "linkedin": enriched.get("linkedin") or req.linkedin_url,
        "status": "To Call",
        "notes": "Imported from Apollo",
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead_doc)
    lead_doc.pop("_id", None)
    return {"lead": lead_doc, "phone_pending": req.reveal and not lead_doc.get("phone")}

@api_router.post("/webhooks/apollo/phone")
async def apollo_phone_webhook(request: HTTPRequest, token: Optional[str] = None):
    """Async phone-number delivery from Apollo. Matches lead by apollo_person_id."""
    expected = os.getenv("APOLLO_WEBHOOK_TOKEN")
    if expected and token != expected:
        raise HTTPException(status_code=403, detail="Invalid webhook token")
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ignored"}

    # Apollo may send a person object or a list of phone numbers
    person = payload.get("person") or payload
    person_id = person.get("id") or payload.get("id") or payload.get("person_id")
    phones = person.get("phone_numbers") or payload.get("phone_numbers") or []
    primary = None
    if isinstance(phones, list) and phones:
        first = phones[0]
        primary = first.get("sanitized_number") or first.get("raw_number") or first.get("number") if isinstance(first, dict) else first
    if not primary:
        primary = person.get("sanitized_phone") or payload.get("phone")

    if person_id and primary:
        await db.leads.update_one(
            {"apollo_person_id": person_id, "owner_id": ADMIN_LEADS_OWNER},
            {"$set": {"phone": primary, "updated_at": get_pst_now().isoformat()}}
        )
        return {"status": "ok"}
    return {"status": "ignored"}





# ==========================================================================
# WEB PUSH NOTIFICATIONS (background, VAPID) + VOICE COMMAND CENTER
# ==========================================================================
import json as _json

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:hashim@tskflow.com")

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]

@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    return {"public_key": VAPID_PUBLIC_KEY}

@api_router.post("/push/subscribe")
async def push_subscribe(sub: PushSubscription, current_user: dict = Depends(get_current_user)):
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint},
        {"$set": {
            "user_id": current_user["id"],
            "endpoint": sub.endpoint,
            "keys": sub.keys,
            "updated_at": get_pst_now().isoformat()
        }},
        upsert=True
    )
    return {"message": "Subscribed"}

@api_router.post("/push/unsubscribe")
async def push_unsubscribe(sub: PushSubscription, current_user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": sub.endpoint, "user_id": current_user["id"]})
    return {"message": "Unsubscribed"}

async def send_web_push(user_id: str, title: str, body: str, url: str = "/dashboard"):
    """Send a background web-push notification to all of a user's subscriptions."""
    if not (VAPID_PRIVATE_KEY and user_id):
        return
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return
    try:
        from pywebpush import webpush, WebPushException
    except Exception as e:
        logging.error(f"pywebpush not available: {e}")
        return
    payload = _json.dumps({"title": title, "body": body, "url": url})
    for s in subs:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT}
            )
        except WebPushException as e:
            # Clean up expired/invalid subscriptions
            if getattr(e, "response", None) is not None and e.response.status_code in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
            else:
                logging.error(f"Web push failed: {e}")
        except Exception as e:
            logging.error(f"Web push error: {e}")


# ---- Voice Command Center (Whisper handled client-side; GPT reasoning here) ----

class VoiceCommandRequest(BaseModel):
    transcript: Optional[str] = None
    text: Optional[str] = None  # alias for typed chat
    history: Optional[List[dict]] = None  # [{role, text}] prior turns while panel is open

VOICE_SYSTEM_PROMPT = """You are Tskflow's voice assistant. You help a user manage tasks by voice.
You will receive the user's spoken transcript plus JSON context (their outstanding tasks and known contacts).
Respond with a SINGLE JSON object ONLY (no markdown, no extra text) with this shape:
{
  "reply": "<short, conversational, human spoken reply (1-2 sentences)>",
  "action": {
    "type": "<one of: query_outstanding | create_task | assign_task | update_status | navigate | none>",
    "params": { ... }
  }
}
Rules:
- query_outstanding: summarize what's outstanding in the reply; params {}.
- create_task: params {"title": str, "assignee_email": str|null, "priority": "Low|Medium|High|Urgent"|null, "due_date": "YYYY-MM-DDTHH:MM"|null}. If assignee not given, assign to self (assignee_email null).
- assign_task: same as create_task but always with assignee_email.
- update_status: params {"task_title": str, "status": "Accepted|Completed"}.
- navigate: params {"target": "dashboard|analytics|team|settings|leads"}.
- none: when unclear; ask for clarification in reply.
Keep replies warm, brief and natural, like a helpful teammate."""

def _jarvis_local_intent(transcript: str):
    """Deterministic replies/actions that never need the LLM (keeps Cloudflare happy)."""
    low = (transcript or "").lower().strip()
    if not low:
        return None
    if re.search(r"\b(what can you (do|help with)|who are you|what do you do|help me get started)\b", low):
        return {
            "reply": (
                "I'm Jarvis — your AI manager in TskFlow. I can create and assign tasks from plain English, "
                "list what's still open, update status, open pages like analytics or settings, "
                "and walk you through how things work. What do you want to tackle?"
            ),
            "action": {"type": "assistant_answer", "params": {}},
        }
    if re.search(r"\b(guide me|show yourself|show me|come (out|here)|appear|walk me through|show up)\b", low) and len(low) < 80:
        return {
            "reply": "Sure. Tell me what you're stuck on — a task, an assignee, a due date — and I'll walk you through it.",
            "action": {"type": "assistant_answer", "params": {}},
        }
    nav = None
    if re.search(r"\b(open |go to |show )?(the )?(analytics|dashboard|settings|team|help|recordings|recurring|leads)\b", low):
        for key in ("analytics", "dashboard", "settings", "team", "help", "recordings", "recurring", "leads"):
            if re.search(rf"\b{key}\b", low):
                nav = key
                break
    if nav:
        return {
            "reply": f"Opening {nav}.",
            "action": {"type": "navigate", "params": {"target": nav}},
        }
    return None


@api_router.post("/voice/command")
async def voice_command(req: VoiceCommandRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    transcript = (req.transcript or req.text or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")

    # Fast local intents first — never depends on LLM / never hangs the origin
    local = _jarvis_local_intent(transcript)
    if local:
        return {**local, "executed": {"type": local["action"]["type"]}}

    outstanding = []
    context = {"my_name": current_user.get("name"), "outstanding_count": 0, "outstanding_tasks": [], "contacts": []}
    db_ok = True
    try:
        active = await db.tasks.find({
            "$or": [{"assigned_to": current_user["id"]}, {"created_by": current_user["id"]}],
            "status": {"$nin": ["Completed", "Declined", "Cancelled", "Rejected"]},
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True}
        }, {"_id": 0, "id": 1, "title": 1, "status": 1, "due_date": 1, "priority": 1, "assigned_to": 1}).to_list(100)
        outstanding = [{"title": t["title"], "status": t["status"], "due_date": t.get("due_date"), "priority": t.get("priority")} for t in active]
        contacts = await db.user_contacts.find({"user_id": current_user["id"]}, {"_id": 0, "contact_name": 1, "contact_email": 1}).to_list(50)
        today = get_pst_now().strftime("%Y-%m-%d")
        metrics_or = [{"owner_user_id": current_user["id"], "date": today}]
        if current_user.get("company_domain"):
            metrics_or.append({"company_domain": current_user["company_domain"], "date": today})
        metrics_today = await db.daily_metrics.find(
            {"$or": metrics_or},
            {"_id": 0, "person_name": 1, "metrics": 1, "targets": 1, "date": 1},
        ).to_list(100)
        context = {
            "my_name": current_user["name"],
            "outstanding_count": len(outstanding),
            "outstanding_tasks": outstanding[:25],
            "contacts": [{"name": c.get("contact_name"), "email": c.get("contact_email")} for c in contacts],
            "daily_sheet_metrics": [
                {
                    "person": m.get("person_name"),
                    "date": m.get("date"),
                    "summary": format_metrics_line(m),
                    "metrics": m.get("metrics"),
                    "targets": m.get("targets"),
                }
                for m in metrics_today[:40]
            ],
        }
    except Exception as e:
        db_ok = False
        logging.error(f"Voice context load error: {e}")

    low = transcript.lower()
    # Manager asks about a person's sheet metrics: "what is my AE Alex doing" / "how is Sarah doing today"
    person_m = re.search(
        r"(?:what(?:'s| is)|how(?:'s| is))\s+(?:my\s+)?(?:ae|rep|teammate)?\s*([A-Za-z][A-Za-z.'-]{1,40})\s+(?:doing|up to|working on)",
        low,
    )
    person_m2 = re.search(
        r"(?:metrics|numbers|stats|activity)\s+(?:for|on)\s+([A-Za-z][A-Za-z.'-]{1,40})",
        low,
    )
    want_team_metrics = bool(re.search(
        r"\b(daily metrics|sheet metrics|activity metrics|team metrics|calls today|emails today)\b",
        low,
    ))
    if person_m or person_m2 or want_team_metrics:
        pname = ((person_m or person_m2).group(1) if (person_m or person_m2) else "").strip()
        skip = {"my", "the", "our", "doing", "today", "their", "his", "her", "an", "a", "is", "are", "team"}
        if pname.lower() in skip:
            pname = ""
        try:
            day = get_pst_now().strftime("%Y-%m-%d")
            if pname:
                hits = await find_person_metrics(db, current_user, pname, date=day)
            else:
                metrics_or = [{"owner_user_id": current_user["id"], "date": day}]
                if current_user.get("company_domain"):
                    metrics_or.append({"company_domain": current_user["company_domain"], "date": day})
                hits = await db.daily_metrics.find({"$or": metrics_or}, {"_id": 0}).to_list(40)
            if hits:
                lines = [f"• {h.get('person_name')}: {format_metrics_line(h)}" for h in hits[:12]]
                reply = f"Here's today's sheet activity{f' for {pname}' if pname else ''}:\n" + "\n".join(lines)
            else:
                reply = (
                    f"I don't have synced sheet metrics{f' for {pname}' if pname else ' for today'} yet. "
                    "Connect Google Sheets and map columns in Settings, then Sync."
                )
            return {
                "reply": reply,
                "action": {"type": "query_sheet_metrics", "params": {"person": pname}},
                "executed": {"type": "query_sheet_metrics", "count": len(hits)},
            }
        except Exception as e:
            logging.warning(f"Voice sheet metrics lookup failed: {e}")

    if re.search(r"\b(what's outstanding|whats outstanding|what is outstanding|outstanding tasks|what's left|whats left|my open tasks|what do i have)\b", low):
        if not db_ok:
            reply = "I couldn't load your tasks just now. Check the dashboard, or try again in a moment."
        elif not outstanding:
            reply = "You're clear — nothing outstanding right now."
        else:
            lines = []
            for t in outstanding[:8]:
                due = (t.get("due_date") or "")[:10]
                lines.append(f"• {t['title']} ({t.get('status')}" + (f", due {due}" if due else "") + ")")
            more = f"\n…and {len(outstanding) - 8} more." if len(outstanding) > 8 else ""
            reply = f"You have {len(outstanding)} open task{'s' if len(outstanding) != 1 else ''}:\n" + "\n".join(lines) + more
        return {
            "reply": reply,
            "action": {"type": "query_outstanding", "params": {}},
            "executed": {"type": "query_outstanding", "count": len(outstanding)},
        }

    history_lines = []
    if req.history and isinstance(req.history, list):
        for turn in req.history[-12:]:
            if not isinstance(turn, dict):
                continue
            role = (turn.get("role") or "").strip().lower()
            htext = (turn.get("text") or "").strip()
            if role in ("user", "assistant") and htext:
                history_lines.append(f"{role.upper()}: {htext[:500]}")

    emergent_key = os.getenv("EMERGENT_LLM_KEY")
    raw = None
    if emergent_key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            # gpt-4o-mini matches other working AI routes; shorter timeout for Cloudflare
            chat = LlmChat(
                api_key=emergent_key,
                session_id=f"voice_{current_user['id']}",
                system_message=VOICE_ASSISTANT_SYSTEM
            ).with_model("openai", "gpt-4o-mini")
            hist_block = ("\nRecent conversation:\n" + "\n".join(history_lines) + "\n") if history_lines else ""
            user_msg = UserMessage(
                text=f"{hist_block}Latest message: {transcript}\n\nContext JSON: {_json.dumps(context)}"
            )
            raw = await asyncio.wait_for(chat.send_message(user_msg), timeout=14.0)
        except asyncio.TimeoutError:
            logging.error("Voice LLM timed out")
            raw = None
        except Exception as e:
            logging.error(f"Voice LLM error: {e}")
            raw = None

    if raw is None:
        # Never return 5xx/hang — Cloudflare was turning those into incomplete responses
        hint = ""
        if outstanding:
            hint = f" You currently have {len(outstanding)} open task{'s' if len(outstanding) != 1 else ''}."
        return {
            "reply": (
                "I couldn't reach my full brain just now, but I'm still here."
                f"{hint} Try “what's outstanding”, “open analytics”, “guide me”, "
                "or create a task with New Task on the left."
            ),
            "action": {"type": "assistant_answer", "params": {}},
            "executed": {"type": "assistant_answer", "degraded": True},
        }

    # Parse JSON out of the model response
    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        parsed = _json.loads(text[start:end])
    except Exception:
        parsed = {"reply": text[:300] or "Sorry, I didn't catch that.", "action": {"type": "none", "params": {}}}

    reply = parsed.get("reply") or "Okay."
    action = parsed.get("action") or {"type": "none", "params": {}}
    atype = action.get("type", "none")
    params = action.get("params") or {}

    executed = {"type": atype}
    # Execute server-side actions where safe
    if atype in ("create_task", "assign_task"):
        title = (params.get("title") or transcript)[:200]
        assignee_email = params.get("assignee_email")
        priority = params.get("priority") if params.get("priority") in ["Low", "Medium", "High", "Urgent"] else "Medium"
        due = params.get("due_date") or (get_pst_now() + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
        tid = str(uuid.uuid4())
        if assignee_email and "@" in assignee_email:
            existing = await db.users.find_one({"email": assignee_email}, {"_id": 0})
            assigned_to = existing["id"] if existing else f"email_{assignee_email}"
            status0 = "Pending"
            accepted0 = None
        else:
            assigned_to = current_user["id"]
            assignee_email = current_user["email"]
            status0 = "Accepted"
            accepted0 = get_pst_now().isoformat()
        sales = _text_looks_like_sales(f"{title} {transcript}")
        await db.tasks.insert_one({
            "id": tid, "title": title, "description": f"Created by voice: {transcript}",
            "assigned_to": assigned_to, "assigned_to_email": assignee_email,
            "created_by": current_user["id"], "due_date": due, "status": status0,
            "priority": priority, "created_at": get_pst_now().isoformat(),
            "accepted_at": accepted0, "invite_token": str(uuid.uuid4())[:8],
            "is_sales_task": sales,
            "category": "Sales" if sales else None,
        })
        if assigned_to != current_user["id"]:
            background_tasks.add_task(send_web_push, assigned_to, f"New task from {current_user['name']}", title, f"/task/{tid}")
        executed["task_id"] = tid
        executed["is_sales_task"] = sales
    elif atype == "update_status":
        tt = (params.get("task_title") or "").lower()
        new_status = params.get("status")
        if tt and new_status in ("Accepted", "Completed"):
            match = await db.tasks.find_one({
                "assigned_to": current_user["id"], "deleted": {"$ne": True},
                "title": {"$regex": tt[:60], "$options": "i"}
            }, {"_id": 0})
            if match:
                upd = {"status": new_status}
                if new_status == "Completed":
                    upd["completed_at"] = get_pst_now().isoformat()
                    upd["completed_by"] = current_user["id"]
                    upd["completed_by_name"] = current_user["name"]
                elif new_status == "Accepted":
                    upd["accepted_at"] = get_pst_now().isoformat()
                await db.tasks.update_one({"id": match["id"]}, {"$set": upd})
                executed["task_id"] = match["id"]

    return {"reply": reply, "action": {"type": atype, "params": params}, "executed": executed}



# Include router
# ==========================================================================
# CLOUD OBJECT STORAGE — task attachments & screen recordings
# ==========================================================================
from fastapi import Header, Query
from fastapi.responses import Response

OBJ_STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_STORAGE_PREFIX = "tskflow"
UPLOAD_TMP_DIR = "/tmp/tskflow_uploads"
os.makedirs(UPLOAD_TMP_DIR, exist_ok=True)
_storage_key = None
_storage_lock = asyncio.Lock()

async def _get_storage_key(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    async with _storage_lock:
        if _storage_key and not force:
            return _storage_key
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{OBJ_STORAGE_URL}/init", json={"emergent_key": os.getenv("EMERGENT_LLM_KEY")})
            r.raise_for_status()
            _storage_key = r.json()["storage_key"]
    return _storage_key

async def storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = await _get_storage_key()
    async with httpx.AsyncClient(timeout=300) as c:
        r = await c.put(f"{OBJ_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        if r.status_code == 403:
            key = await _get_storage_key(force=True)
            r = await c.put(f"{OBJ_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        r.raise_for_status()
        return r.json()

async def storage_get(path: str) -> tuple:
    key = await _get_storage_key()
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.get(f"{OBJ_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        if r.status_code == 403:
            key = await _get_storage_key(force=True)
            r = await c.get(f"{OBJ_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")

def _kind_for(content_type: str) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("video/"):
        return "video"
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("audio/"):
        return "audio"
    return "file"

class UploadFinish(BaseModel):
    filename: str
    content_type: Optional[str] = None

async def _persist_uploaded_bytes(current_user: dict, data: bytes, filename: str, content_type: str) -> dict:
    """Write bytes to object storage + attachments collection; shared by direct & chunked finish."""
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 200MB)")
    safe_name = (filename or "file").replace("/", "_").replace("\\", "_")[:200]
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else "bin"
    ct = content_type or "application/octet-stream"
    path = f"{APP_STORAGE_PREFIX}/attachments/{current_user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = await storage_put(path, data, ct)
    except Exception as e:
        logging.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=502, detail="Upload to storage failed")
    attachment = {
        "id": str(uuid.uuid4()),
        "storage_path": result.get("path", path),
        "original_filename": safe_name,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "kind": _kind_for(ct),
    }
    await db.attachments.insert_one({
        **attachment,
        "owner_id": current_user["id"],
        "is_deleted": False,
        "created_at": get_pst_now().isoformat()
    })
    return attachment


@api_router.post("/uploads/direct")
async def upload_direct(
    request: HTTPRequest,
    current_user: dict = Depends(get_current_user),
    x_filename: Optional[str] = Header(None),
):
    """Single-request upload — preferred for recordings/attachments.

    Avoids multi-step /tmp sessions that break across workers ("Upload session not found").
    """
    from urllib.parse import unquote
    data = await request.body()
    filename = unquote(x_filename or "file")
    # Prefer explicit X-Content-Type header; fall back to request Content-Type (skip generic)
    x_ct = request.headers.get("x-content-type") or ""
    req_ct = (request.headers.get("content-type") or "").split(";")[0].strip()
    content_type = x_ct or (req_ct if req_ct and req_ct != "application/octet-stream" else "") or "application/octet-stream"
    if filename.lower().endswith(".webm") and content_type == "application/octet-stream":
        content_type = "video/webm"
    return await _persist_uploaded_bytes(current_user, data, filename, content_type)


@api_router.post("/uploads/start")
async def upload_start(current_user: dict = Depends(get_current_user)):
    upload_id = str(uuid.uuid4())
    # Create empty temp file + durable session record (survives for debugging / ownership checks)
    open(os.path.join(UPLOAD_TMP_DIR, upload_id), "wb").close()
    await db.upload_sessions.insert_one({
        "id": upload_id,
        "user_id": current_user["id"],
        "created_at": get_pst_now().isoformat(),
        "bytes_received": 0,
    })
    return {"upload_id": upload_id}

@api_router.put("/uploads/{upload_id}/chunk")
async def upload_chunk(upload_id: str, request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    # Basic guard against path traversal
    if "/" in upload_id or ".." in upload_id:
        raise HTTPException(status_code=400, detail="Invalid upload id")
    session = await db.upload_sessions.find_one({"id": upload_id, "user_id": current_user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    tmp_path = os.path.join(UPLOAD_TMP_DIR, upload_id)
    # Recreate if this worker never saw /start (multi-instance) — cannot recover prior chunks,
    # so fail clearly and let the client retry with /uploads/direct.
    if not os.path.exists(tmp_path):
        raise HTTPException(
            status_code=409,
            detail="Upload session lost on this server — retry with a fresh upload",
        )
    chunk = await request.body()
    # Cap total size at 200MB
    if os.path.getsize(tmp_path) + len(chunk) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 200MB)")
    def _append():
        with open(tmp_path, "ab") as f:
            f.write(chunk)
    await asyncio.to_thread(_append)
    await db.upload_sessions.update_one(
        {"id": upload_id},
        {"$inc": {"bytes_received": len(chunk)}},
    )
    return {"received": len(chunk)}

@api_router.post("/uploads/{upload_id}/finish")
async def upload_finish(upload_id: str, meta: UploadFinish, current_user: dict = Depends(get_current_user)):
    if "/" in upload_id or ".." in upload_id:
        raise HTTPException(status_code=400, detail="Invalid upload id")
    session = await db.upload_sessions.find_one({"id": upload_id, "user_id": current_user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    tmp_path = os.path.join(UPLOAD_TMP_DIR, upload_id)
    if not os.path.exists(tmp_path):
        raise HTTPException(
            status_code=409,
            detail="Upload session lost on this server — retry with a fresh upload",
        )
    data = await asyncio.to_thread(lambda: open(tmp_path, "rb").read())
    try:
        attachment = await _persist_uploaded_bytes(
            current_user, data, meta.filename, meta.content_type or "application/octet-stream"
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        await db.upload_sessions.delete_one({"id": upload_id})
    return attachment

@api_router.get("/files/{path:path}")
async def stream_file(path: str, request: HTTPRequest, authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
    # Auth via header OR ?auth= (needed for <video>/<img> tags which can't set headers)
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    record = await db.attachments.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data, content_type = await storage_get(path)
    except Exception as e:
        logging.error(f"Storage fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch file")

    content_type = record.get("content_type") or content_type
    total = len(data)
    filename = record.get("original_filename", "file")

    # Support HTTP Range for smooth inline video seeking/streaming
    range_header = request.headers.get("range")
    common_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, max-age=3600",
    }
    if range_header and range_header.startswith("bytes="):
        try:
            rng = range_header.replace("bytes=", "").split("-")
            start = int(rng[0]) if rng[0] else 0
            end = int(rng[1]) if len(rng) > 1 and rng[1] else total - 1
            end = min(end, total - 1)
            start = max(0, min(start, end))
            chunk = data[start:end + 1]
            headers = {**common_headers, "Content-Range": f"bytes {start}-{end}/{total}", "Content-Length": str(len(chunk))}
            return Response(content=chunk, status_code=206, media_type=content_type, headers=headers)
        except Exception:
            pass
    return Response(content=data, media_type=content_type, headers={**common_headers, "Content-Length": str(total)})



# ==============================================================================
# JULY 2025 CONTINUATION BATCH — 13 FEATURE ROLLUP
# ==============================================================================

# --- WebSocket manager for real-time chatter/notifications ---
from fastapi import WebSocket, WebSocketDisconnect

class WSConnectionManager:
    def __init__(self):
        # user_id -> set of active WebSocket connections
        self.active: Dict[str, set] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.active:
            self.active[user_id].discard(ws)
            if not self.active[user_id]:
                self.active.pop(user_id, None)

    async def send(self, user_id: str, payload: dict):
        dead = []
        for ws in self.active.get(user_id, set()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_task(self, task_id: str, payload: dict, user_ids: List[str]):
        for uid in set(user_ids):
            await self.send(uid, payload)

ws_manager = WSConnectionManager()

def _decode_user_from_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = None):
    """Auth via ?token=<JWT>. Client should reconnect with token when it expires."""
    user_id = _decode_user_from_token(token or "")
    if not user_id:
        await ws.close(code=1008)
        return
    await ws_manager.connect(user_id, ws)
    try:
        while True:
            # Keep-alive; we accept pings/nothing.
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, ws)
    except Exception:
        ws_manager.disconnect(user_id, ws)


# --- Notification helper (in-app center + optional email) ---
IMPORTANT_EMAIL_EVENTS = {"task_assigned", "status_change", "task_completed", "important_response"}

def _can_manage_slack_webhook(user: dict) -> bool:
    """Slack Incoming Webhook may only be configured by Teams package admins (team owners)."""
    return (user or {}).get("subscription_tier") == "teams" and bool((user or {}).get("is_team_owner"))


async def _resolve_slack_webhook(user: dict) -> Optional[str]:
    """Return the Teams admin webhook for this user's org (members inherit the owner's URL)."""
    if not user or (user.get("subscription_tier") != "teams"):
        return None
    if user.get("is_team_owner"):
        url = ((user.get("preferences") or {}).get("slack_webhook_url") or "").strip()
        return url if url.startswith("https://hooks.slack.com/") else None
    owner_email = user.get("team_owner_email")
    if not owner_email:
        # Fallback: same company domain owner
        domain = user.get("company_domain") or ((user.get("email") or "").split("@")[-1] if user.get("email") else None)
        if domain:
            owner = await db.users.find_one(
                {"company_domain": domain, "subscription_tier": "teams", "is_team_owner": True},
                {"_id": 0, "preferences": 1},
            )
        else:
            owner = None
    else:
        owner = await db.users.find_one({"email": owner_email}, {"_id": 0, "preferences": 1})
    url = (((owner or {}).get("preferences") or {}).get("slack_webhook_url") or "").strip()
    return url if url.startswith("https://hooks.slack.com/") else None


async def _post_to_slack(webhook_url: str, text: str, blocks: Optional[List[dict]] = None) -> bool:
    """Best-effort Slack post. Returns True on success."""
    if not webhook_url or not webhook_url.startswith("https://hooks.slack.com/"):
        return False
    try:
        payload = {"text": text}
        if blocks:
            payload["blocks"] = blocks
        async with httpx.AsyncClient(timeout=6) as client_http:
            r = await client_http.post(webhook_url, json=payload)
            return r.status_code < 400
    except Exception:
        return False


async def create_notification(
    user_id: str,
    n_type: str,
    title: str,
    body: str,
    task_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    send_email: bool = False,
    email_to: Optional[str] = None,
    email_subject: Optional[str] = None,
    email_html: Optional[str] = None,
):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": n_type,
        "title": _notify_text(title),
        "body": _notify_text(body),
        "task_id": task_id,
        "actor_name": actor_name,
        "created_at": get_pst_now().isoformat(),
        "delivered": False,   # for live OS toast poll (recent non-reminders only)
        "read": False,        # for in-app bell
    }
    await db.notifications.insert_one(doc)
    # Push over WebSocket if user is online
    try:
        await ws_manager.send(user_id, {"event": "notification", "notification": {k: v for k, v in doc.items() if k != "_id"}})
    except Exception:
        pass
    # Slack bridge — Teams admin webhook (org-wide), mentions & key events only
    try:
        u = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "preferences": 1, "subscription_tier": 1, "is_team_owner": 1, "team_owner_email": 1, "company_domain": 1, "email": 1},
        )
        webhook = await _resolve_slack_webhook(u or {})
        if webhook and n_type in ("mention", "task_assigned", "status_change", "task_completed"):
            link = f"{APP_BASE_URL}/task/{task_id}" if task_id else APP_BASE_URL
            slack_text = f":bell: *{title}*\n{body}\n<{link}|Open in Tskflow>"
            await _post_to_slack(webhook, slack_text)
    except Exception:
        pass
    # Send email only on IMPORTANT events, and only if user has an email
    if send_email and n_type in IMPORTANT_EMAIL_EVENTS and email_to and email_subject and email_html:
        try:
            await send_email_notification(email_to, email_subject, email_html)
        except Exception:
            pass
    return doc


def _jarvis_email_shell(inner_html: str, cta_url: Optional[str] = None, cta_label: Optional[str] = None) -> str:
    """Wrap content in the Jarvis branded HTML shell."""
    cta = ""
    if cta_url and cta_label:
        cta = f"""<div style="text-align:center;margin:32px 0 8px;"><a href="{cta_url}" style="background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;display:inline-block;">{cta_label}</a></div>"""
    return f"""
<html>
<body style="margin:0;padding:0;background:#f5f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(24,24,50,0.06);">
        <tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;color:#fff;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:#ffffff33;border-radius:10px;display:inline-block;text-align:center;line-height:36px;font-weight:700;">J</div>
            <div style="display:inline-block;vertical-align:middle;margin-left:10px;">
              <div style="font-weight:700;font-size:16px;">Jarvis</div>
              <div style="opacity:0.85;font-size:12px;">Your Tskflow assistant</div>
            </div>
          </div>
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
          {inner_html}
          {cta}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;color:#6b7280;font-size:12px;border-top:1px solid #eef0f3;">
          <div>— <strong>Jarvis</strong>, Tskflow assistant</div>
          <div style="margin-top:6px;">You're receiving this because it was flagged as an important task update. <a href="{APP_BASE_URL}/settings" style="color:#4F46E5;text-decoration:none;">Manage notifications</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""

# --- Notification endpoints (in-app center) ---
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user), limit: int = 50):
    docs = await db.notifications.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": current_user["id"], "read": {"$ne": True}})
    return {"notifications": docs, "unread": unread}

@api_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": current_user["id"]},
        {"$set": {"read": True, "read_at": get_pst_now().isoformat()}}
    )
    return {"ok": True}

@api_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": {"$ne": True}},
        {"$set": {"read": True, "read_at": get_pst_now().isoformat()}}
    )
    return {"ok": True}


# --- Mark task as viewed (for the "Viewed" column in Group Task Detail modal) ---
@api_router.post("/tasks/{task_id}/mark-viewed")
async def mark_task_viewed(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.get("assigned_to") != current_user["id"]:
        return {"ok": True}
    if not task.get("viewed_at"):
        await db.tasks.update_one({"id": task_id}, {"$set": {"viewed_at": get_pst_now().isoformat()}})
    return {"ok": True}


# --- Personal Leaderboard: rank users on speed for tasks I've assigned out ---
def _compute_completion_hours(task: dict) -> Optional[float]:
    """Sum elapsed time across all revision rounds. If we don't have history,
    fall back to (completed_at - accepted_at) or (completed_at - created_at)."""
    try:
        history = task.get("status_history") or []
        # Ideally history records each round with started_at/completed_at.
        # For MVP, fall back to simple diff:
        completed_at = task.get("completed_at")
        if not completed_at:
            return None
        started_at = task.get("accepted_at") or task.get("created_at")
        if not started_at:
            return None
        end = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
        start = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        # Sum all "In Progress" segments if history is present
        if history:
            total = timedelta(0)
            open_seg = None
            for h in history:
                if h.get("status") in ("Accepted", "In Progress"):
                    open_seg = datetime.fromisoformat(h["at"].replace('Z', '+00:00'))
                elif h.get("status") in ("Completed", "Review Pending") and open_seg:
                    total += datetime.fromisoformat(h["at"].replace('Z', '+00:00')) - open_seg
                    open_seg = None
            if total.total_seconds() > 0:
                return round(total.total_seconds() / 3600, 2)
        return round((end - start).total_seconds() / 3600, 2)
    except Exception:
        return None


@api_router.get("/leaderboard/personal")
async def personal_leaderboard(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Rank users on tasks I've assigned out (completion + response speed)."""
    query: dict = {"created_by": current_user["id"], "status": "Completed", "deleted": {"$ne": True}}
    if start_date:
        query["created_at"] = query.get("created_at", {})
        query["created_at"]["$gte"] = start_date
    if end_date:
        query["created_at"] = query.get("created_at", {})
        query["created_at"]["$lte"] = end_date + "T23:59:59"

    tasks = await db.tasks.find(query, {"_id": 0}).to_list(2000)
    by_user: Dict[str, dict] = {}
    for t in tasks:
        uid = t.get("assigned_to")
        if not uid:
            continue
        hrs = _compute_completion_hours(t)
        # Response time = accepted_at - created_at
        response_hrs = None
        try:
            if t.get("accepted_at") and t.get("created_at"):
                a = datetime.fromisoformat(t["accepted_at"].replace('Z', '+00:00'))
                c = datetime.fromisoformat(t["created_at"].replace('Z', '+00:00'))
                response_hrs = max(0, (a - c).total_seconds() / 3600)
        except Exception:
            pass
        entry = by_user.setdefault(uid, {"user_id": uid, "completed": 0, "sum_completion_hrs": 0.0, "sum_response_hrs": 0.0, "n_response": 0, "n_hrs": 0})
        entry["completed"] += 1
        if hrs is not None:
            entry["sum_completion_hrs"] += hrs
            entry["n_hrs"] += 1
        if response_hrs is not None:
            entry["sum_response_hrs"] += response_hrs
            entry["n_response"] += 1

    # Enrich with user names
    user_ids = list(by_user.keys())
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(len(user_ids) or 1)
    user_map = {u["id"]: u for u in users}

    rows = []
    for uid, e in by_user.items():
        u = user_map.get(uid, {})
        avg_completion = round(e["sum_completion_hrs"] / e["n_hrs"], 2) if e["n_hrs"] else None
        avg_response = round(e["sum_response_hrs"] / e["n_response"], 2) if e["n_response"] else None
        rows.append({
            "user_id": uid,
            "name": u.get("name", "Unknown"),
            "email": u.get("email", ""),
            "completed": e["completed"],
            "avg_completion_hours": avg_completion,
            "avg_response_hours": avg_response,
        })

    # Sort: lower avg_completion is better; ties broken by more completed
    rows.sort(key=lambda r: (r["avg_completion_hours"] if r["avg_completion_hours"] is not None else 1e9, -r["completed"]))
    for idx, r in enumerate(rows, start=1):
        r["rank"] = idx
    return {"leaderboard": rows}


@api_router.get("/leaderboard/org")
async def org_leaderboard(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
):
    """Org-wide leaderboard. Currently scoped by same email domain (proxy for org)."""
    email = current_user.get("email", "")
    domain = email.split("@")[-1] if "@" in email else ""
    # Same-domain users
    users = await db.users.find({"email": {"$regex": f"@{re.escape(domain)}$", "$options": "i"}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(2000)
    domain_uids = {u["id"] for u in users}
    if user_id:
        domain_uids = domain_uids.intersection({user_id})

    query: dict = {"assigned_to": {"$in": list(domain_uids)}, "status": "Completed", "deleted": {"$ne": True}}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"

    tasks = await db.tasks.find(query, {"_id": 0}).to_list(4000)
    by_user: Dict[str, dict] = {}
    for t in tasks:
        uid = t.get("assigned_to")
        hrs = _compute_completion_hours(t)
        response_hrs = None
        try:
            if t.get("accepted_at") and t.get("created_at"):
                a = datetime.fromisoformat(t["accepted_at"].replace('Z', '+00:00'))
                c = datetime.fromisoformat(t["created_at"].replace('Z', '+00:00'))
                response_hrs = max(0, (a - c).total_seconds() / 3600)
        except Exception:
            pass
        entry = by_user.setdefault(uid, {"completed": 0, "sum_completion_hrs": 0.0, "sum_response_hrs": 0.0, "n_response": 0, "n_hrs": 0})
        entry["completed"] += 1
        if hrs is not None:
            entry["sum_completion_hrs"] += hrs
            entry["n_hrs"] += 1
        if response_hrs is not None:
            entry["sum_response_hrs"] += response_hrs
            entry["n_response"] += 1

    user_map = {u["id"]: u for u in users}
    rows = []
    for uid, e in by_user.items():
        u = user_map.get(uid, {})
        avg_c = round(e["sum_completion_hrs"] / e["n_hrs"], 2) if e["n_hrs"] else None
        avg_r = round(e["sum_response_hrs"] / e["n_response"], 2) if e["n_response"] else None
        # Simple composite performance score
        perf = 0
        if avg_c is not None:
            perf += max(0, 100 - min(100, avg_c))
        if avg_r is not None:
            perf += max(0, 50 - min(50, avg_r))
        perf += e["completed"] * 2
        rows.append({
            "user_id": uid,
            "name": u.get("name", "Unknown"),
            "email": u.get("email", ""),
            "completed": e["completed"],
            "avg_completion_hours": avg_c,
            "avg_response_hours": avg_r,
            "performance_score": round(perf, 1),
        })

    rows.sort(key=lambda r: -r["performance_score"])
    for idx, r in enumerate(rows, start=1):
        r["rank"] = idx
    return {"leaderboard": rows, "scope": {"domain": domain, "user_id": user_id, "team_id": team_id}}


# --- Personal analytics (only tasks I've assigned out) ---
@api_router.post("/analytics/personal")
async def personal_analytics(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    query: dict = {"created_by": current_user["id"], "deleted": {"$ne": True}}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(5000)

    total = len(tasks)
    completed = [t for t in tasks if t.get("status") == "Completed"]
    pending = [t for t in tasks if t.get("status") not in ("Completed", "Declined")]
    now = get_pst_now()
    overdue = 0
    for t in pending:
        try:
            due = datetime.fromisoformat(t["due_date"].replace('Z', '+00:00'))
            if due.tzinfo is None:
                due = PST.localize(due)
            if due < now:
                overdue += 1
        except Exception:
            pass

    # Per-assignee breakdown
    by_assignee: Dict[str, dict] = {}
    for t in tasks:
        aid = t.get("assigned_to")
        if not aid:
            continue
        e = by_assignee.setdefault(aid, {"total": 0, "completed": 0, "sum_hrs": 0.0, "n_hrs": 0})
        e["total"] += 1
        if t.get("status") == "Completed":
            e["completed"] += 1
            hrs = _compute_completion_hours(t)
            if hrs is not None:
                e["sum_hrs"] += hrs
                e["n_hrs"] += 1

    uids = list(by_assignee.keys())
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(uids) or 1)
    umap = {u["id"]: u.get("name", "Unknown") for u in users}
    breakdown = []
    for aid, e in by_assignee.items():
        breakdown.append({
            "user_id": aid,
            "name": umap.get(aid, "Unknown"),
            "total": e["total"],
            "completed": e["completed"],
            "avg_completion_hours": round(e["sum_hrs"] / e["n_hrs"], 2) if e["n_hrs"] else None,
        })
    breakdown.sort(key=lambda x: -x["completed"])
    return {
        "total": total,
        "completed": len(completed),
        "pending": len(pending),
        "overdue": overdue,
        "completion_rate": round(len(completed) / total * 100, 1) if total else 0,
        "assignee_breakdown": breakdown,
    }


# --- Enhanced AI Summary: urgent + due soon + recommendations ---
@api_router.post("/dashboard/ai-summary-v2")
async def dashboard_ai_summary_v2(
    body: AISummaryRequest = None,
    current_user: dict = Depends(get_current_user),
):
    view_mode = (body.view_mode if body else "active") or "active"
    query = {
        "$or": [{"assigned_to": current_user["id"]}, {"created_by": current_user["id"]}],
        "deleted": {"$ne": True},
        "status": {"$ne": "Completed"} if view_mode != "completed" else "Completed",
    }
    tasks = await db.tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(200)
    now = get_pst_now()
    due_next_hours = []
    due_today = []
    high_urgent = []
    overdue = []
    for t in tasks:
        try:
            due = datetime.fromisoformat(t["due_date"].replace('Z', '+00:00'))
            if due.tzinfo is None:
                due = PST.localize(due)
            delta_h = (due - now).total_seconds() / 3600
        except Exception:
            continue
        if delta_h < 0:
            overdue.append(t)
        elif delta_h <= 6:
            due_next_hours.append(t)
        elif due.date() == now.date():
            due_today.append(t)
        if t.get("priority") == "High" and delta_h <= 24:
            high_urgent.append(t)

    stats = {
        "urgent_high_count": len({t["id"] for t in high_urgent}),
        "due_in_hours_count": len(due_next_hours),
        "due_today_count": len(due_today),
        "overdue_count": len(overdue),
        "total": len(tasks),
    }

    key = os.getenv("EMERGENT_LLM_KEY")
    if not key or stats["total"] == 0:
        # Heuristic recommendation
        recs = []
        if stats["overdue_count"]:
            recs.append(f"⚠️ Clear {stats['overdue_count']} overdue task(s) first.")
        if stats["urgent_high_count"]:
            recs.append(f"🔴 Focus on {stats['urgent_high_count']} High-priority item(s) due in <24h.")
        if stats["due_in_hours_count"]:
            recs.append(f"⏰ {stats['due_in_hours_count']} due in the next 6 hours.")
        if stats["due_today_count"]:
            recs.append(f"📅 {stats['due_today_count']} due later today.")
        if not recs:
            recs.append("You're on top of things — no urgent items.")
        return {"stats": stats, "summary": " ".join(recs)}

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        top_items = (overdue + high_urgent + due_next_hours + due_today)[:8]
        lines = [f"- {(t.get('title') or '')[:60]} [{t.get('priority','M')}, due {t.get('due_date','?')}]" for t in top_items]
        prompt = (
            f"You are Jarvis. Given these urgent counts — overdue={stats['overdue_count']}, "
            f"high-urgent={stats['urgent_high_count']}, due<6h={stats['due_in_hours_count']}, due today={stats['due_today_count']} — "
            f"write 2 short crisp sentences with concrete recommendations to avoid missing deadlines. "
            f"Reference item titles when helpful.\n\nTop items:\n" + "\n".join(lines)
        )
        chat = LlmChat(api_key=key).with_model("openai", "gpt-4o-mini")
        resp = await asyncio.wait_for(chat.aask([UserMessage(content=prompt)]), timeout=8.0)
        return {"stats": stats, "summary": resp.content.strip()}
    except Exception:
        return {"stats": stats, "summary": f"{stats['overdue_count']} overdue, {stats['urgent_high_count']} high-priority urgent, {stats['due_in_hours_count']} due in <6h. Tackle overdue first."}


# --- Sales-task filter helper (in-place on task fetches) ---
@api_router.get("/tasks/sales-only-count")
async def sales_only_count(current_user: dict = Depends(get_current_user)):
    cnt = await db.tasks.count_documents({
        "$or": [{"assigned_to": current_user["id"]}, {"created_by": current_user["id"]}],
        "deleted": {"$ne": True},
        "is_sales_task": True,
    })
    return {"count": cnt}


# --- End-of-day report (cron-able) ---
async def _build_eod_summary_for_user(u: dict, now):
    """Build the HTML email + Slack text for one user. Returns (html, slack_text, counts) or None if nothing to send."""
    sections = _eod_sections_for(u)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    completed = await db.tasks.find({
        "assigned_to": u["id"],
        "status": "Completed",
        "completed_at": {"$gte": today_start},
        "deleted": {"$ne": True},
    }, {"_id": 0}).to_list(200) if sections.get("completed") else []
    open_tasks_docs = await db.tasks.find({
        "assigned_to": u["id"],
        "status": {"$nin": ["Completed", "Declined", "Cancelled", "Rejected"]},
        "deleted": {"$ne": True},
        "is_parent": {"$ne": True},
    }, {"_id": 0}).to_list(500) if (sections.get("open") or sections.get("missed")) else []
    missed = []
    if sections.get("missed"):
        for t in open_tasks_docs:
            try:
                due = datetime.fromisoformat(t["due_date"].replace('Z', '+00:00'))
                if due.tzinfo is None:
                    due = PST.localize(due)
                if due < now and not t.get("due_date_rescheduled_and_accepted"):
                    missed.append(t)
            except Exception:
                pass
    want_mgr = sections.get("manager_snapshot") or sections.get("suggested_plan")
    mgr_html, mgr_slack, mgr_counts = ("", "", {})
    if want_mgr:
        mgr_html, mgr_slack, mgr_counts = await build_manager_eod_section(
            db, u, now, PST, timedelta,
            include_snapshot=bool(sections.get("manager_snapshot")),
            include_plan=bool(sections.get("suggested_plan")),
        )
    # Nothing selected / nothing to report
    if not any([
        sections.get("completed") and completed,
        sections.get("open") and open_tasks_docs,
        sections.get("missed") and missed,
        mgr_html,
    ]) and not any(sections.values()):
        return None
    if not completed and not (sections.get("open") and open_tasks_docs) and not missed and not mgr_html:
        # Still send a short "quiet day" if they opted into at least one personal section
        if not any(sections.get(k) for k in ("completed", "open", "missed", "manager_snapshot", "suggested_plan")):
            return None

    first = (u.get('name') or 'friend').split(' ')[0]
    day = now.strftime('%A, %b %d, %Y')
    parts_html = [
        f"<h2 style=\"margin:0 0 8px;font-size:20px;\">Your day at Tskflow, {first}</h2>",
        f"<p style=\"color:#6b7280;margin:0 0 20px;\">{day}</p>",
    ]
    slack_bits = [f":sunset: *EOD summary - {now.strftime('%b %d')}*"]

    if sections.get("completed"):
        rows_done = "".join([f"<li><strong>{(t.get('title') or '')[:80]}</strong> - completed</li>" for t in completed[:20]]) or "<li>Nothing marked complete today.</li>"
        parts_html.append(f"<h3 style=\"font-size:15px;margin:16px 0 6px;\">Completed today ({len(completed)})</h3>")
        parts_html.append(f"<ul style=\"padding-left:20px;margin:0;\">{rows_done}</ul>")
        slack_bits.append(f"Completed today: {len(completed)}")

    if sections.get("open"):
        rows_open = "".join([f"<li>{(t.get('title') or '')[:80]} - due {t.get('due_date','?')[:10]}</li>" for t in open_tasks_docs[:20]]) or "<li>All caught up - no open tasks.</li>"
        parts_html.append(f"<h3 style=\"font-size:15px;margin:20px 0 6px;\">Still open ({len(open_tasks_docs)})</h3>")
        parts_html.append(f"<ul style=\"padding-left:20px;margin:0;\">{rows_open}</ul>")
        slack_bits.append(f"Still open: {len(open_tasks_docs)}")

    if sections.get("missed") and missed:
        parts_html.append(f"<p style='color:#b91c1c;'>{len(missed)} task(s) missed their due date.</p>")
        slack_bits.append(f"Warning: {len(missed)} missed due date(s)")

    if mgr_html:
        parts_html.append(mgr_html)
    if mgr_slack:
        slack_bits.append("")
        slack_bits.append(mgr_slack)

    sheet_html, sheet_slack, sheet_counts = ("", "", {})
    if sections.get("sheet_metrics"):
        try:
            sheet_html, sheet_slack, sheet_counts = await build_sheet_metrics_eod_section(
                db, u, now, include_self=True, include_team=True,
            )
        except Exception as e:
            logging.warning(f"EOD sheet metrics: {e}")
    if sheet_html:
        parts_html.append(sheet_html)
    if sheet_slack:
        slack_bits.append("")
        slack_bits.append(sheet_slack)

    if len(parts_html) <= 2 and not mgr_html and not sheet_html:
        parts_html.append("<p style=\"color:#6b7280;\">Quiet day — nothing matched the sections you selected.</p>")
        slack_bits.append("Quiet day — nothing to report for your selected sections.")

    html = _jarvis_email_shell("".join(parts_html), cta_url=f"{APP_BASE_URL}/dashboard", cta_label="Open Tskflow")
    slack_text = "\n".join(slack_bits) + f"\n<{APP_BASE_URL}/dashboard|Open Tskflow>"
    return html, slack_text, {"completed": len(completed), "open": len(open_tasks_docs), "missed": len(missed), **mgr_counts, **sheet_counts}


@api_router.post("/cron/eod-report")
async def cron_eod_report(secret: Optional[str] = None):
    """Runs every hour from the scheduler. For each user opted-in whose local hour matches
    their preferred delivery hour (eod_hour, default 17 == 5pm), send their EOD digest to
    the channel they chose (email / slack / both).
    """
    expected = os.getenv("CRON_SECRET", "")
    if expected and secret != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    now = get_pst_now()
    users = await db.users.find({}, {
        "_id": 0, "id": 1, "name": 1, "email": 1, "preferences": 1,
        "subscription_tier": 1, "is_team_owner": 1, "team_owner_email": 1, "company_domain": 1,
    }).to_list(10000)
    sent = 0
    for u in users:
        prefs = u.get("preferences") or {}
        # Opt-in gate: by default we DO NOT spam users — they must enable in Settings.
        if not prefs.get("eod_enabled"):
            continue
        target_hour = prefs.get("eod_hour")
        if target_hour is None:
            target_hour = 17
        try:
            target_hour = int(target_hour)
        except Exception:
            target_hour = 17
        # Only fire when the scheduler tick lines up with the user's chosen hour.
        if now.hour != target_hour:
            continue

        built = await _build_eod_summary_for_user(u, now)
        if not built:
            continue
        html, slack_text, _counts = built
        channel = (prefs.get("eod_channel") or "email").lower()

        if channel in ("email", "both"):
            try:
                await send_email_notification(u["email"], f"Your Tskflow EOD summary — {now.strftime('%b %d')}", html)
                sent += 1
            except Exception:
                pass
        if channel in ("slack", "both"):
            webhook = await _resolve_slack_webhook(u)
            if webhook:
                try:
                    await _post_to_slack(webhook, slack_text)
                except Exception:
                    pass

    return {"ok": True, "sent": sent}


@api_router.post("/eod/preview")
async def eod_preview_now(current_user: dict = Depends(get_current_user)):
    """Trigger an EOD digest immediately for the calling user, regardless of schedule.
    Used by the "Send me a preview" button in Settings."""
    u = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "preferences": 1,
         "subscription_tier": 1, "is_team_owner": 1, "team_owner_email": 1, "company_domain": 1},
    )
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    now = get_pst_now()
    built = await _build_eod_summary_for_user(u, now)
    if not built:
        return {"ok": True, "sent": False, "reason": "Nothing to summarize yet — no tasks today."}
    html, slack_text, counts = built
    prefs = u.get("preferences") or {}
    channel = (prefs.get("eod_channel") or "email").lower()
    delivered_to = []
    if channel in ("email", "both"):
        try:
            await send_email_notification(u["email"], f"Tskflow EOD preview — {now.strftime('%b %d')}", html)
            delivered_to.append("email")
        except Exception:
            pass
    if channel in ("slack", "both"):
        webhook = await _resolve_slack_webhook(u)
        if webhook:
            try:
                await _post_to_slack(webhook, slack_text)
                delivered_to.append("slack")
            except Exception:
                pass
    return {"ok": True, "sent": bool(delivered_to), "delivered_to": delivered_to, "counts": counts}


# --- Transcript → task drafts (Google Meet flow) ---
class TranscriptImportRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None  # public Google Doc

async def _fetch_google_doc_text(url: str) -> str:
    """Best-effort fetch of a public Google Doc as plain text."""
    if "docs.google.com/document" not in url:
        # Not a Google Doc URL — treat as any URL
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(url, follow_redirects=True)
            return r.text
    # Try Google Doc export as txt
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if not m:
        return ""
    doc_id = m.group(1)
    export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    async with httpx.AsyncClient(timeout=15) as client_http:
        r = await client_http.get(export_url, follow_redirects=True)
        return r.text if r.status_code == 200 else ""


@api_router.post("/task-drafts/from-transcript")
async def create_drafts_from_transcript(
    body: TranscriptImportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Parse a transcript into candidate task drafts. Nothing goes live automatically."""
    text = (body.text or "").strip()
    if not text and body.url:
        try:
            text = (await _fetch_google_doc_text(body.url)).strip()
        except Exception:
            text = ""
    if not text:
        raise HTTPException(status_code=400, detail="Empty transcript. Provide text or a public URL.")
    if len(text) > 60000:
        text = text[:60000]

    key = os.getenv("EMERGENT_LLM_KEY")
    drafts_data: List[dict] = []
    if key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            import json as _json
            prompt = (
                "You are Jarvis, a meeting-notes → action-items assistant. Extract concrete tasks from the transcript below. "
                "For each task, return JSON with fields: title (short), description (one paragraph), "
                "assignee_hint (name or role as mentioned, or null), due_date_hint (natural-language or null), "
                "priority (High/Medium/Low), ambiguities (array of clarification questions if anything is unclear — assignee, deadline, scope).\n"
                "Reply ONLY with a JSON object like {\"tasks\": [ ... ]}. No prose.\n\n"
                "TRANSCRIPT:\n" + text
            )
            chat = LlmChat(api_key=key).with_model("openai", "gpt-4o-mini")
            resp = await asyncio.wait_for(chat.aask([UserMessage(content=prompt)]), timeout=25.0)
            raw = resp.content.strip()
            # Strip markdown fences if any
            raw = re.sub(r"^```(json)?", "", raw).strip()
            raw = re.sub(r"```$", "", raw).strip()
            parsed = _json.loads(raw)
            drafts_data = parsed.get("tasks", []) if isinstance(parsed, dict) else []
        except Exception as e:
            logging.warning(f"Transcript parse failed: {e}")

    if not drafts_data:
        # Simple fallback: split on lines starting with "-" or numbered items
        lines = [ln.strip("-*• 	").strip() for ln in text.splitlines() if ln.strip().startswith(("-", "*", "•")) or re.match(r"^\d+[\.)]", ln.strip())]
        for ln in lines[:20]:
            drafts_data.append({
                "title": ln[:100],
                "description": ln,
                "assignee_hint": None,
                "due_date_hint": None,
                "priority": "Medium",
                "ambiguities": ["Who should this be assigned to?", "When is this due?"],
            })

    created = []
    for d in drafts_data:
        doc = {
            "id": str(uuid.uuid4()),
            "created_by": current_user["id"],
            "title": (d.get("title") or "Untitled").strip()[:200],
            "description": (d.get("description") or "").strip()[:2000],
            "assignee_hint": d.get("assignee_hint"),
            "due_date_hint": d.get("due_date_hint"),
            "priority": d.get("priority") or "Medium",
            "ambiguities": d.get("ambiguities") or [],
            "source": "transcript",
            "created_at": get_pst_now().isoformat(),
            "status": "Draft",
        }
        await db.transcript_drafts.insert_one(doc)
        created.append({k: v for k, v in doc.items() if k != "_id"})
    return {"drafts": created}


@api_router.get("/task-drafts")
async def list_task_drafts(current_user: dict = Depends(get_current_user)):
    docs = await db.transcript_drafts.find({"created_by": current_user["id"], "status": "Draft"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"drafts": docs}


@api_router.delete("/task-drafts/{draft_id}")
async def delete_task_draft(draft_id: str, current_user: dict = Depends(get_current_user)):
    await db.transcript_drafts.delete_one({"id": draft_id, "created_by": current_user["id"]})
    return {"ok": True}


class PublishDraftRequest(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: str
    due_date: str
    priority: str = "Medium"
    is_sales_task: Optional[bool] = False


@api_router.post("/task-drafts/{draft_id}/publish")
async def publish_task_draft(draft_id: str, body: PublishDraftRequest, current_user: dict = Depends(get_current_user)):
    draft = await db.transcript_drafts.find_one({"id": draft_id, "created_by": current_user["id"]})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    # Resolve assignee (id or email)
    assigned_to_id = body.assigned_to
    if "@" in body.assigned_to:
        u = await db.users.find_one({"email": body.assigned_to})
        if u:
            assigned_to_id = u["id"]

    task_id = str(uuid.uuid4())
    task_doc = {
        "id": task_id,
        "title": body.title,
        "description": body.description or "",
        "assigned_to": assigned_to_id,
        "assigned_to_email": body.assigned_to if "@" in body.assigned_to else None,
        "created_by": current_user["id"],
        "due_date": body.due_date,
        "status": "Pending",
        "priority": body.priority,
        "category": "meeting",
        "created_at": get_pst_now().isoformat(),
        "comments": [],
        "is_sales_task": body.is_sales_task or False,
        "shareable_token": str(uuid.uuid4())[:12],
        "source": "transcript",
    }
    await db.tasks.insert_one(task_doc)
    await db.transcript_drafts.update_one({"id": draft_id}, {"$set": {"status": "Published", "published_task_id": task_id}})
    return {"ok": True, "task_id": task_id}


# --- Product updates feed (surface what changed in this batch to users) ---
@api_router.post("/integrations/slack/test")
async def test_slack_webhook(body: dict, current_user: dict = Depends(get_current_user)):
    """Verify a Slack Incoming Webhook by posting a test message. Teams admin only."""
    if not _can_manage_slack_webhook(current_user):
        raise HTTPException(status_code=403, detail="Only the Teams admin can test the Slack webhook.")
    webhook = (body or {}).get("webhook_url") or ((current_user.get("preferences") or {}).get("slack_webhook_url") or "")
    if not webhook.startswith("https://hooks.slack.com/"):
        raise HTTPException(status_code=400, detail="Please provide a valid Slack Incoming Webhook URL (must start with https://hooks.slack.com/).")
    ok = await _post_to_slack(webhook, f":wave: Hello from Tskflow — this is a test from {current_user.get('name', 'a teammate')}. If you can read this, your Slack bridge is working!")
    if not ok:
        raise HTTPException(status_code=502, detail="Slack rejected the webhook. Double-check the URL.")
    return {"ok": True}


@api_router.get("/product-updates")
async def get_product_updates(current_user: dict = Depends(get_current_user)):
    """Static feed of what changed in the July 2025 batch."""
    updates = [
        {"id": "u14", "area": "Slack Bridge", "change": "Paste your Slack Incoming Webhook in Settings to cross-post mentions, assignments, and EOD summaries into a Slack channel.", "was": "No Slack integration \u2014 mentions could get missed if you lived in Slack."},
        {"id": "u15", "area": "Screen Recording (robust)", "change": "Screen picker now lets you pick tab / window / entire screen freely; webcam preview is requested first and reliably renders in the recording bubble.", "was": "Was forced to current tab and the webcam bubble often didn\u2019t appear."},
        {"id": "u16", "area": "Unified Task View", "change": "Group tasks now open the same detail page as single tasks, with a collapsible Participants section (unfinished on top, top 5 visible, Show more).", "was": "Group tasks opened a separate stripped-down page."},
        {"id": "u17", "area": "Cleaner Header", "change": "Leaderboards moved into Analytics, What\u2019s New moved into the notification bell, and Meet Transcript moved inside the Create Task modal.", "was": "8+ icons crammed on the top-right of the dashboard."},
        {"id": "u18", "area": "Sales Toggle", "change": "\u201COnly Sales Tasks\u201D lives right next to Active/Completed as a compact dollar icon that expands on hover.", "was": "A separate row of chips taking full width."},
        {"id": "u01", "area": "Screen Recording", "change": "Loom-style flow with floating pause/resume/restart controls, mic + webcam toggle, and post-record editor screen.", "was": "Basic start/stop only — recordings sometimes didn't save."},
        {"id": "u02", "area": "Group Task Expansion", "change": "Groups expand inline with live-sort: pending assignees pinned on top, completed sink to the bottom in real time.", "was": "Groups just navigated to a details page with no live sort."},
        {"id": "u03", "area": "Group Task Detail", "change": "Clicking a group opens the same task view as single tasks, plus a leaderboard and per-person status columns (Viewed / Accepted / Submitted / Completed).", "was": "Navigated to a bare detail page."},
        {"id": "u04", "area": "Search Bar", "change": "Search moved to the top header as a compact icon that expands to a short overlay bar \u2014 no longer stretches full-width or covers other UI.", "was": "Full-width input inside the tasks section, obstructive."},
        {"id": "u05", "area": "AI Summary", "change": "Now shows urgent count, tasks due in the next 6h vs today, plus a Jarvis-authored recommendation on what to prioritize.", "was": "Generic 3-sentence overview with no urgency signal."},
        {"id": "u06", "area": "Chatter Panel", "change": "Comments moved to a right-side panel on task detail \u2014 always visible next to task content.", "was": "Chatter lived below the task, requiring scroll."},
        {"id": "u07", "area": "Notification Center", "change": "New in-app bell with unread badge and full history. Works even when browser push is blocked.", "was": "Only ephemeral toasts + browser notifications that vanished."},
        {"id": "u08", "area": "Real-Time Chatter", "change": "WebSocket-driven live updates for comments and mentions \u2014 no more ~30s polling delay.", "was": "Poll every 30 seconds."},
        {"id": "u09", "area": "Leaderboards & Analytics", "change": "Personal leaderboard, personal analytics scoped to tasks you assigned out, and a separate Org leaderboard \u2014 now living inside the Analytics tab.", "was": "Single team analytics page with no personal/org split."},
        {"id": "u10", "area": "Email as Jarvis", "change": "All emails now come from Jarvis with a branded HTML template and are only sent on meaningful events.", "was": "System-flavored emails for every event."},
        {"id": "u11", "area": "Sales Task Toggle", "change": "Optional \u201CThis is a Sales Task\u201D checkbox on task create + a hover-expand \u201COnly Sales Tasks\u201D toggle next to view mode.", "was": "No way to segregate sales tasks."},
        {"id": "u12", "area": "End-of-Day Report", "change": "Daily Jarvis email + optional Slack post with today\u2019s completions and still-open tasks.", "was": "No EOD summary."},
        {"id": "u13", "area": "Meet Transcript \u2192 Tasks", "change": "Now lives inside the Create Task modal \u2014 paste, upload, or link a Google Doc; Jarvis drafts tasks that you review before publishing.", "was": "Manual entry from meeting notes."},
    ]
    return {"updates": updates}


# ==========================================================================
# RECURRING TASKS — series + rolling-window occurrence generation
# ==========================================================================

class RecurrenceRule(BaseModel):
    frequency: str  # "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom"
    interval: Optional[int] = 1  # For custom: every N days
    weekdays: Optional[List[int]] = None  # 0-6 (Mon-Sun), for weekly custom days
    day_of_month: Optional[int] = None  # For monthly (1-31), defaults to due_date day
    month_of_year: Optional[int] = None  # For yearly (1-12), defaults to due_date month
    end_type: Optional[str] = "never"  # "never" | "on_date" | "after_count"
    end_date: Optional[str] = None  # YYYY-MM-DD when end_type=="on_date"
    end_count: Optional[int] = None  # When end_type=="after_count"

class RecurringSeriesCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: str  # "self", user id, or email
    start_due_date: str  # First occurrence due date (ISO)
    priority: str = "Medium"
    category: Optional[str] = None
    is_sales_task: Optional[bool] = False
    requires_screen_recording: Optional[bool] = False
    auto_reminder: Optional[bool] = False
    attachments: Optional[List[dict]] = None
    recurrence: RecurrenceRule

class RecurringSeriesUpdate(BaseModel):
    scope: str = "all"  # "this" | "future" | "all"
    occurrence_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None  # For "this" scope
    recurrence: Optional[RecurrenceRule] = None
    is_sales_task: Optional[bool] = None
    requires_screen_recording: Optional[bool] = None
    category: Optional[str] = None


def _next_occurrence_date(prev_dt: datetime, rule: dict) -> Optional[datetime]:
    """Given previous occurrence datetime + rule dict, compute the next occurrence dt."""
    freq = rule.get("frequency", "daily")
    interval = int(rule.get("interval") or 1)
    if freq == "daily":
        return prev_dt + timedelta(days=1)
    if freq == "weekdays":
        nxt = prev_dt + timedelta(days=1)
        # Mon=0 ... Sun=6; skip Sat/Sun
        while nxt.weekday() >= 5:
            nxt += timedelta(days=1)
        return nxt
    if freq == "weekly":
        wds = rule.get("weekdays")
        if wds:
            # Find next weekday in list after prev_dt
            for i in range(1, 15):
                cand = prev_dt + timedelta(days=i)
                if cand.weekday() in wds:
                    return cand
            return None
        return prev_dt + timedelta(weeks=1)
    if freq == "biweekly":
        return prev_dt + timedelta(weeks=2)
    if freq == "monthly":
        # Add roughly one month, snap day
        year = prev_dt.year + (1 if prev_dt.month == 12 else 0)
        month = 1 if prev_dt.month == 12 else prev_dt.month + 1
        target_day = int(rule.get("day_of_month") or prev_dt.day)
        # clamp to end of month
        import calendar as _cal
        last_day = _cal.monthrange(year, month)[1]
        day = min(target_day, last_day)
        return prev_dt.replace(year=year, month=month, day=day)
    if freq == "yearly":
        try:
            return prev_dt.replace(year=prev_dt.year + 1)
        except ValueError:  # e.g. feb 29
            return prev_dt.replace(year=prev_dt.year + 1, day=28)
    if freq == "custom":
        return prev_dt + timedelta(days=max(1, interval))
    return None


async def _generate_occurrences(series: dict, window_days: int = 60, max_occurrences: int = 25) -> int:
    """Generate upcoming occurrences for a series based on rolling window. Returns count generated."""
    if series.get("stopped"):
        return 0
    rule = series.get("recurrence") or {}
    end_type = rule.get("end_type", "never")
    end_date = None
    if end_type == "on_date" and rule.get("end_date"):
        try:
            end_date = datetime.fromisoformat(rule["end_date"]).replace(tzinfo=PST)
        except Exception:
            try:
                end_date = datetime.strptime(rule["end_date"], "%Y-%m-%d").replace(tzinfo=PST)
            except Exception:
                end_date = None
    end_count = rule.get("end_count") if end_type == "after_count" else None

    now = get_pst_now()
    window_end = now + timedelta(days=window_days)

    # Find last generated occurrence
    existing = await db.tasks.find({
        "recurring_series_id": series["id"],
        "deleted": {"$ne": True}
    }, {"_id": 0, "due_date": 1, "id": 1}).sort("due_date", -1).to_list(1000)
    existing_count = len(existing)

    if end_count and existing_count >= end_count:
        return 0

    if not existing:
        # First occurrence uses start_due_date
        try:
            last_dt = datetime.fromisoformat(series["start_due_date"].replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=PST)
        except Exception:
            return 0
        # Insert the first occurrence
        first_id = await _insert_series_task(series, last_dt.isoformat())
        if first_id:
            existing_count += 1
    else:
        try:
            last_dt = datetime.fromisoformat(existing[0]["due_date"].replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=PST)
        except Exception:
            return 0

    generated = 0
    for _ in range(max_occurrences):
        nxt = _next_occurrence_date(last_dt, rule)
        if not nxt:
            break
        if end_date and nxt > end_date:
            break
        if end_count and existing_count >= end_count:
            break
        if nxt > window_end:
            break
        # Skip if this date is in the skipped_dates
        skip_key = nxt.strftime("%Y-%m-%d")
        skipped = series.get("skipped_dates") or []
        if skip_key in skipped:
            last_dt = nxt
            continue
        tid = await _insert_series_task(series, nxt.isoformat())
        if tid:
            generated += 1
            existing_count += 1
        last_dt = nxt

    return generated


async def _insert_series_task(series: dict, due_date_iso: str) -> Optional[str]:
    """Create a task from a recurring series template with the given due date."""
    tid = str(uuid.uuid4())
    creator_id = series["created_by"]
    creator = await db.users.find_one({"id": creator_id}, {"_id": 0})
    if not creator:
        return None

    assigned_to = series.get("assigned_to") or "self"
    if assigned_to == "self":
        assigned_to_id = creator_id
        assigned_to_email = creator["email"]
        is_self = True
    elif "@" in assigned_to:
        existing = await db.users.find_one({"email": assigned_to}, {"_id": 0})
        if existing:
            assigned_to_id = existing["id"]
            assigned_to_email = existing["email"]
            is_self = (assigned_to_id == creator_id)
        else:
            assigned_to_id = f"email_{assigned_to}"
            assigned_to_email = assigned_to
            is_self = False
    else:
        u = await db.users.find_one({"id": assigned_to}, {"_id": 0})
        if not u:
            return None
        assigned_to_id = u["id"]
        assigned_to_email = u["email"]
        is_self = (assigned_to_id == creator_id)

    task_doc = {
        "id": tid,
        "title": series["title"],
        "description": series.get("description") or "",
        "assigned_to": assigned_to_id,
        "assigned_to_email": assigned_to_email,
        "created_by": creator_id,
        "due_date": due_date_iso,
        "status": "Accepted" if is_self else "Pending",
        "priority": series.get("priority", "Medium"),
        "category": series.get("category"),
        "created_at": get_pst_now().isoformat(),
        "accepted_at": get_pst_now().isoformat() if is_self else None,
        "invite_token": str(uuid.uuid4())[:8],
        "shareable_token": str(uuid.uuid4())[:12],
        "attachments": series.get("attachments") or None,
        "is_sales_task": series.get("is_sales_task", False),
        "requires_screen_recording": series.get("requires_screen_recording", False),
        "auto_reminder": series.get("auto_reminder", False),
        "recurring_series_id": series["id"],
        "comments": []
    }
    await db.tasks.insert_one(task_doc)
    return tid


@api_router.post("/recurring")
async def create_recurring_series(series: RecurringSeriesCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    series_id = str(uuid.uuid4())
    doc = {
        "id": series_id,
        "created_by": current_user["id"],
        "created_by_name": current_user["name"],
        "title": series.title,
        "description": series.description or "",
        "assigned_to": series.assigned_to,
        "start_due_date": series.start_due_date,
        "priority": series.priority,
        "category": series.category,
        "is_sales_task": series.is_sales_task or False,
        "requires_screen_recording": series.requires_screen_recording or False,
        "auto_reminder": series.auto_reminder or False,
        "attachments": series.attachments or None,
        "recurrence": series.recurrence.dict(),
        "skipped_dates": [],
        "stopped": False,
        "created_at": get_pst_now().isoformat(),
    }
    await db.recurring_series.insert_one(doc)
    # Immediately generate the initial batch of occurrences
    generated = await _generate_occurrences(doc, window_days=60, max_occurrences=25)
    return {"series_id": series_id, "generated": generated}


@api_router.get("/recurring")
async def list_recurring_series(current_user: dict = Depends(get_current_user)):
    series_list = await db.recurring_series.find({
        "created_by": current_user["id"]
    }, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Enrich with occurrence counts
    for s in series_list:
        upcoming = await db.tasks.count_documents({
            "recurring_series_id": s["id"],
            "deleted": {"$ne": True},
            "status": {"$nin": ["Completed", "Declined"]}
        })
        completed = await db.tasks.count_documents({
            "recurring_series_id": s["id"],
            "deleted": {"$ne": True},
            "status": "Completed"
        })
        s["upcoming_count"] = upcoming
        s["completed_count"] = completed
    return {"series": series_list}


@api_router.get("/recurring/{series_id}/occurrences")
async def get_recurring_occurrences(series_id: str, current_user: dict = Depends(get_current_user)):
    series = await db.recurring_series.find_one({"id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if series["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    occs = await db.tasks.find({
        "recurring_series_id": series_id,
        "deleted": {"$ne": True}
    }, {"_id": 0, "id": 1, "title": 1, "due_date": 1, "status": 1, "priority": 1, "completed_at": 1}).sort("due_date", 1).to_list(500)
    return {"series": series, "occurrences": occs}


@api_router.post("/recurring/{series_id}/skip")
async def skip_recurring_occurrence(series_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Skip an occurrence: pass either occurrence_id or date (YYYY-MM-DD)."""
    series = await db.recurring_series.find_one({"id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if series["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    occ_id = body.get("occurrence_id")
    date_str = body.get("date")
    if occ_id:
        occ = await db.tasks.find_one({"id": occ_id}, {"_id": 0})
        if occ:
            try:
                dt = datetime.fromisoformat(occ["due_date"].replace("Z", "+00:00"))
                date_str = dt.strftime("%Y-%m-%d")
            except Exception:
                pass
            await db.tasks.update_one({"id": occ_id}, {"$set": {"deleted": True, "skipped": True}})
    if date_str:
        skipped = series.get("skipped_dates") or []
        if date_str not in skipped:
            skipped.append(date_str)
        await db.recurring_series.update_one({"id": series_id}, {"$set": {"skipped_dates": skipped}})
    return {"ok": True}


@api_router.put("/recurring/{series_id}")
async def update_recurring_series(series_id: str, upd: RecurringSeriesUpdate, current_user: dict = Depends(get_current_user)):
    series = await db.recurring_series.find_one({"id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if series["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    scope = upd.scope or "all"

    if scope == "this":
        # Update just one occurrence
        if not upd.occurrence_id:
            raise HTTPException(status_code=400, detail="occurrence_id required for scope=this")
        update_fields = {}
        for f in ["title", "description", "priority", "assigned_to", "due_date", "category"]:
            v = getattr(upd, f)
            if v is not None:
                update_fields[f] = v
        if update_fields:
            await db.tasks.update_one({"id": upd.occurrence_id}, {"$set": update_fields})
        return {"ok": True, "scope": "this"}

    # For "future" and "all" we update the series template and regenerate upcoming
    series_updates = {}
    for f in ["title", "description", "priority", "assigned_to", "category", "is_sales_task", "requires_screen_recording"]:
        v = getattr(upd, f)
        if v is not None:
            series_updates[f] = v
    if upd.recurrence is not None:
        series_updates["recurrence"] = upd.recurrence.dict()

    if series_updates:
        await db.recurring_series.update_one({"id": series_id}, {"$set": series_updates})

    now_iso = get_pst_now().isoformat()
    # Delete upcoming non-completed occurrences (from now on if "future", else all not-yet-due)
    cutoff = now_iso if scope == "future" else None
    query = {"recurring_series_id": series_id, "status": {"$nin": ["Completed"]}, "deleted": {"$ne": True}}
    if cutoff:
        query["due_date"] = {"$gte": cutoff}
    await db.tasks.update_many(query, {"$set": {"deleted": True}})

    # Regenerate
    fresh = await db.recurring_series.find_one({"id": series_id}, {"_id": 0})
    generated = await _generate_occurrences(fresh, window_days=60, max_occurrences=25)
    return {"ok": True, "scope": scope, "generated": generated}


@api_router.delete("/recurring/{series_id}")
async def delete_recurring_series(series_id: str, current_user: dict = Depends(get_current_user)):
    series = await db.recurring_series.find_one({"id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if series["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    # Mark series stopped + soft-delete any upcoming (non-completed) occurrences
    await db.recurring_series.update_one({"id": series_id}, {"$set": {"stopped": True}})
    await db.tasks.update_many({
        "recurring_series_id": series_id,
        "status": {"$nin": ["Completed"]},
        "deleted": {"$ne": True}
    }, {"$set": {"deleted": True}})
    return {"ok": True}


@api_router.post("/recurring/generate-all")
async def generate_all_recurring(current_user: dict = Depends(get_current_user)):
    """Manually trigger occurrence generation for all this user's active series."""
    total = 0
    series_list = await db.recurring_series.find({
        "created_by": current_user["id"],
        "stopped": {"$ne": True}
    }, {"_id": 0}).to_list(200)
    for s in series_list:
        total += await _generate_occurrences(s, window_days=60, max_occurrences=25)
    return {"generated": total, "series_count": len(series_list)}


async def _background_generate_all_recurring():
    """Global cron-style task to keep the rolling window of upcoming occurrences filled."""
    try:
        cursor = db.recurring_series.find({"stopped": {"$ne": True}}, {"_id": 0})
        async for s in cursor:
            try:
                await _generate_occurrences(s, window_days=60, max_occurrences=25)
            except Exception as e:
                logging.warning(f"[recurring] gen error for {s.get('id')}: {e}")
    except Exception as e:
        logging.error(f"[recurring] batch error: {e}")


# ==========================================================================
# DELETE DRAFT
# ==========================================================================

@api_router.delete("/tasks/drafts/{task_id}")
async def delete_draft_task(task_id: str, current_user: dict = Depends(get_current_user)):
    draft = await db.tasks.find_one({"id": task_id, "status": "Draft"}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


# ==========================================================================
# SMART TASK CREATION — parse a natural-language description into fields
# ==========================================================================

class SmartParseRequest(BaseModel):
    text: str
    context_hint: Optional[str] = None  # e.g. "engineering", "sales meeting" — optional
    resolve: Optional[bool] = False  # if True, resolve assignee_hints against DB users + groups


SMART_PARSE_SYSTEM = """You are Tskflow's task-creation AI. Turn one short sentence into a perfect task.

Return ONE JSON object ONLY (no markdown, no prose):
{
  "title": "<crisp 4-8 word instruction, imperative mood, no names/dates/@handles, never start with Assign>",
  "description": "<full instructions for the assignee — numbered steps when the user listed requirements; empty string ONLY for trivial one-liners>",
  "priority": "Low|Medium|High|Urgent",
  "category": "Sales|Engineering|Marketing|Design|Product|Operations|Finance|HR|Support|Legal|General",
  "due_date": "YYYY-MM-DDTHH:MM" or null,
  "due_date_expression": "<the exact word/phrase from input that produced the date, e.g. 'by 12 PST', 'tomorrow morning', 'ASAP', ''>",
  "action_items": ["<optional step 1>", "<optional step 2>"],
  "assignee_hints": ["<name>", "<@handle>", "<email>", "<'sales team'>", "<'my team'>"],
  "success_criteria": "<what done well looks like, or empty string if the manager did not state expectations>",
  "is_sales_task": true|false,
  "requires_screen_recording": true|false,
  "recurring": {
    "is_recurring": true|false,
    "frequency": "daily|weekdays|weekly|biweekly|monthly|yearly|custom|null",
    "days_of_week": [0,1,2,3,4,5,6] or null,     // 0=Mon..6=Sun
    "time_of_day": "HH:MM" or null,
    "end_time_of_day": "HH:MM" or null,           // if the user said "from X to Y"
    "end_type": "never|on_date|after_count|null",
    "end_date": "YYYY-MM-DD" or null,
    "end_count": <int or null>,
    "raw_phrase": "<original phrase e.g. 'every day from 12 to 3pm PST'>"
  },
  "intent": "task | question | none",   // If the user is asking a HOW/WHAT question about Tskflow, set intent="question"
  "clarifying_questions": ["<at most ONE short question if something critical is ambiguous>"],
  "confidence": { "title": 0-1, "priority": 0-1, "due_date": 0-1, "assignees": 0-1 }
}

DATE RULES (this is the most important part — be aggressive and accurate):
- "ASAP" / "urgently" / "immediately" → 2 HOURS from now (rounded to nearest 15 min), priority Urgent
- "today" alone → 5:00 PM today (business EOD)
- Time-only (e.g. "12 PST", "3pm", "at 2:30", "by 12") → same day at that time (PST). If that time already passed today, use tomorrow.
- "EOD" / "end of day" / "close of business" → 5:00 PM today
- "EOM" / "end of month" → last day of current month at 5:00 PM
- "tomorrow" alone → 12:00 PM tomorrow
- "tomorrow morning" → 9:00 AM tomorrow
- "tomorrow afternoon" → 2:00 PM tomorrow
- "10 tomorrow" / "tomorrow at 10" / "by 10 tomorrow" / "tomorrow 10am" → that clock time tomorrow (NOT noon). Bare hour 8–11 without am/pm → morning; 1–7 without am/pm → evening (PM).
- "before standup" → 9:00 AM the next working day
- Weekday names ("Monday", "this Friday", "next Tuesday") → next occurrence of that weekday at 5:00 PM. "next X" always means the following week's X.
- "next week" → Monday of next week at 12:00 PM
- "in N days/hours/weeks" → arithmetic from now
- If NO date/time is present at all, set due_date=null and add a clarifying question about it.
- Always output ISO YYYY-MM-DDTHH:MM (no seconds, no timezone).

RECURRING RULES:
- Detect phrases: "every day", "daily", "every weekday", "every Monday", "every M/W/F", "weekly", "every 2 weeks", "biweekly", "monthly", "yearly", "annually", "each morning", "each week", "from X to Y each day".
- When recurring, set recurring.is_recurring=true and pick frequency:
  - "every day" / "daily" / "each day" → daily
  - "every weekday" / "every working day" → weekdays
  - "every Monday" / "each Monday" → weekly with days_of_week=[0]
  - "every Monday and Wednesday" → weekly with days_of_week=[0,2]
  - "every 2 weeks" → biweekly
  - "monthly" / "each month" → monthly
  - "yearly" / "annually" → yearly
- When user says a time-range like "from 12 to 3pm PST", set time_of_day="12:00" and end_time_of_day="15:00".
- If no explicit end phrase, end_type="never".
- For recurring tasks, due_date should be the FIRST occurrence (today or the next matching weekday) at time_of_day (or end_time_of_day if that's the deadline).
- If the user says "everyday is working day" or something confirming which days are counted, respect that hint.

PRIORITY RULES:
- "urgent", "ASAP", "immediately", "critical", "fire drill", "serious task" → Urgent
- "important", "high priority", "please prioritize" → High
- "when you can", "no rush", "eventually", "low priority" → Low
- Default → Medium

ASSIGNEE HINTS:
- Extract explicit @mentions (strip @ prefix)
- Extract first names/full names that appear in a "for X", "to X", "assign to X", "have X", "tell X", "@X", "I want X to..." pattern
- Extract team/group names like "sales team", "managers", "engineering", "@Sales team"
- If speaker refers to "my team" or "the team" or "our team", include the literal string "my team"
- If they say "my direct reports" or "my reports" include the literal string "my reports"
- If they say "everyone under me" / "my whole team" include the literal string "everyone under me"
- NEVER invent assignees. If none found, return empty array.

INTENT DETECTION:
- If the text is a QUESTION about Tskflow (e.g. "How do I...", "Where is...", "What does X do?"), set intent="question" and title/priority may be nulls/defaults; the frontend will route to help.
- Otherwise intent="task".

CLARIFYING QUESTIONS:
- Ask AT MOST ONE question. Prefer asking about the assignee (who) over the due date (when).
- Only ask if something critical is missing. Don't ask questions the sentence already answered.
- Prefer yes/no or A-or-B questions.
- Never ask about title, description, priority, category, or success criteria if you can infer them.
- Never ask about success criteria / expectations — those are optional.
- Ask about due_date only if truly missing/ambiguous AND assignee is already clear.
- Ask about assignees only if no usable hint was found (do not invent names).

TITLE RULES:
- Crisp imperative 4–8 words summarizing the WORK itself (e.g. "Finalize opportunity action plans").
- NEVER start with "Assign", never include @handles, person names, last names, emails, dates, or priority words.
- Completely ignore leading @mentions like "@Mark Sibghat @Benjamin White …" — those are assignees, not title words.
- Keep compound phrases intact (e.g. "action plans", not truncated "action").
- Do NOT paste the user's raw prompt into the title. Summarize the deliverable.

DESCRIPTION RULES (critical — write for the assignee, not the manager):
- Distill the manager's request into clear, actionable steps the assignee should follow.
- ALWAYS write description in second person addressed TO the assignee ("Please…", "Send…", "Complete…").
- NEVER paste manager-centric phrasing like "Ask my team to…", "I want them to…", "send me a report" as-is.
  Rewrite those into assignee-facing instructions, e.g. "Please send your manager an end-of-day report…".
- If the user listed steps (1. 2. 3. or bullets), preserve them as a clear numbered list in description.
- Also fill action_items with those assignee-facing steps.
- Only leave description empty for a trivial one-liner where the title alone is enough.
- Never leave description empty when the input is longer than ~1 sentence or contains multiple requirements.
- For recurring asks (e.g. "every day at 2:15"), state the cadence clearly in the description for the assignee.

SUCCESS CRITERIA (expectations):
- Extract when the manager states what "done well" / "done right" / "success" looks like, or phrases like "I expect…", "make sure…", "quality bar…", "acceptance criteria…".
- Keep it as a short plain sentence the assignee can aim for. Empty string if not stated.
- Do NOT invent success criteria.

is_sales_task=true when the text mentions sales work — e.g. sales, prospect, lead, pipeline, deal, opportunity,
demo, discovery, pitch, proposal, quote, CRM, HubSpot, Salesforce, SDR/BDR/AE, cold call, outbound, renewal,
quota, ARR/MRR, closed-won, POC, RFP, negotiation, pricing for a customer/client, follow up with a prospect.
Also set category="Sales" in those cases.
requires_screen_recording=true when the request explicitly asks for a walkthrough, demo recording, tutorial, or "record" something.
"""


_SALES_TASK_RE = re.compile(
    r"(?i)\b("
    r"sales|selling|sells?|upsell(?:ing)?|cross[-\s]?sell(?:ing)?|"
    r"prospect(?:s|ing)?|pipeline|quota|forecast|"
    r"deals?|opportunit(?:y|ies)|closed[-\s]?won|closed[-\s]?lost|"
    r"demos?|discovery(?:\s+call)?|pitch(?:es)?|proposals?|quotes?|quotations?|rfps?|rfqs?|"
    r"crm|hubspot|salesforce|pipedrive|"
    r"sdrs?|bdrs?|\baes?\b|account\s+exec(?:utive)?s?|"
    r"cold[-\s]?calls?|outbound|inbound\s+leads?|"
    r"renewals?|churn|upsells?|\barr\b|\bmrr\b|\bacv\b|"
    r"poc|proof\s+of\s+concept|trial\s+for\s+(?:a\s+)?(?:customer|client|prospect)|"
    r"leads?|"
    r"(?:follow[-\s]?up|call|email|meet(?:ing)?)\s+(?:with\s+)?(?:a\s+)?(?:customer|client|prospect|buyer)s?|"
    r"(?:customer|client|prospect|buyer)s?\s+(?:call|meeting|demo|follow[-\s]?up|outreach)|"
    r"negotiat(?:e|ion|ing)|pricing\s+(?:call|discussion|proposal)|discount\s+for\s+(?:a\s+)?(?:customer|client)"
    r")\b"
)


def _text_looks_like_sales(text: str) -> bool:
    """Keyword detector — marks sales-related tasks even if the LLM misses the flag."""
    if not text:
        return False
    return bool(_SALES_TASK_RE.search(text))


def _apply_sales_detection(parsed: dict, source_text: str) -> dict:
    """Force is_sales_task + Sales category when sales language is present."""
    blob = " ".join([
        source_text or "",
        (parsed.get("title") or ""),
        (parsed.get("description") or ""),
        (parsed.get("category") or ""),
    ])
    if _text_looks_like_sales(blob) or (parsed.get("category") or "").strip().lower() == "sales":
        parsed["is_sales_task"] = True
        cat = (parsed.get("category") or "").strip()
        if not cat or cat.lower() in ("general", "other", "none"):
            parsed["category"] = "Sales"
    return parsed


# ---------------- helpers: post-LLM date + assignee resolution ----------------

def _round_to_quarter(dt: datetime) -> datetime:
    """Round a datetime to the nearest 15-minute mark."""
    minute = (dt.minute // 15) * 15
    dt = dt.replace(minute=minute, second=0, microsecond=0)
    if dt.minute % 15 == 0 and dt.minute != minute:
        dt = dt + timedelta(minutes=15 - (dt.minute % 15))
    return dt


def _fallback_parse_date_expression(expr: str, now: datetime) -> Optional[str]:
    """Regex/keyword fallback when the LLM refuses to return a date but the text has one."""
    if not expr:
        return None
    e = expr.lower().strip()
    now = now.replace(second=0, microsecond=0)

    # ASAP / urgently → +2h
    if re.search(r"\b(asap|urgent(ly)?|immediately|right now|right away)\b", e):
        target = _round_to_quarter(now + timedelta(hours=2))
        return target.strftime("%Y-%m-%dT%H:%M")

    # EOD / end of day / close of business → today 17:00
    if re.search(r"\b(eod|end of day|end of the day|close of business|cob)\b", e):
        return now.replace(hour=17, minute=0).strftime("%Y-%m-%dT%H:%M")

    # Tomorrow morning / afternoon / evening
    if "tomorrow morning" in e:
        return (now + timedelta(days=1)).replace(hour=9, minute=0).strftime("%Y-%m-%dT%H:%M")
    if "tomorrow afternoon" in e:
        return (now + timedelta(days=1)).replace(hour=14, minute=0).strftime("%Y-%m-%dT%H:%M")
    if "tomorrow evening" in e or "tomorrow night" in e:
        return (now + timedelta(days=1)).replace(hour=18, minute=0).strftime("%Y-%m-%dT%H:%M")

    # "10 tomorrow" / "by 10 tomorrow" / "tomorrow at 10" / "tomorrow 10pm"
    # Must run BEFORE bare "tomorrow" → noon default.
    m = re.search(
        r"\b(?:by\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+tomorrow\b"
        r"|\btomorrow\s+(?:at\s+|by\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b",
        e,
    )
    if m:
        hour = int(m.group(1) or m.group(4))
        minute = int((m.group(2) or m.group(5) or 0))
        ampm = m.group(3) or m.group(6)
        if ampm == "pm" and hour < 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        elif not ampm:
            # 1–7 → evening; 8–11 → morning; 12 → noon
            if 1 <= hour <= 7:
                hour += 12
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return (now + timedelta(days=1)).replace(hour=hour, minute=minute).strftime("%Y-%m-%dT%H:%M")

    if re.search(r"\btomorrow\b", e):
        return (now + timedelta(days=1)).replace(hour=12, minute=0).strftime("%Y-%m-%dT%H:%M")

    # Today at HH / HH PST / HHpm
    m = re.search(r"\b(?:by |at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(pst|pt|pdt|est|et|edt|utc|gmt)?\b", e)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        ampm = m.group(3)
        if ampm == "pm" and hour < 12:
            hour += 12
        if ampm == "am" and hour == 12:
            hour = 0
        # Heuristic: if hour ≤ 7 and no am/pm → assume PM (business hours)
        if not ampm and hour <= 7:
            hour += 12
        target = now.replace(hour=hour, minute=minute)
        # If it's already passed and no "today" keyword, roll to tomorrow
        if target < now and "today" not in e:
            target = target + timedelta(days=1)
        return target.strftime("%Y-%m-%dT%H:%M")

    # "today"
    if re.search(r"\btoday\b", e):
        return now.replace(hour=17, minute=0).strftime("%Y-%m-%dT%H:%M")

    # Weekdays
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, wd in enumerate(weekdays):
        if re.search(rf"\b(next\s+)?{wd}\b", e):
            days_ahead = (i - now.weekday()) % 7
            if days_ahead == 0 or "next" in e:
                days_ahead += 7
            target = (now + timedelta(days=days_ahead)).replace(hour=17, minute=0)
            return target.strftime("%Y-%m-%dT%H:%M")

    # in N hours/days/weeks
    m = re.search(r"in\s+(\d+)\s*(hour|hr|day|week)s?", e)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit in ("hour", "hr"):
            return _round_to_quarter(now + timedelta(hours=n)).strftime("%Y-%m-%dT%H:%M")
        if unit == "day":
            return (now + timedelta(days=n)).replace(hour=17, minute=0).strftime("%Y-%m-%dT%H:%M")
        if unit == "week":
            return (now + timedelta(weeks=n)).replace(hour=17, minute=0).strftime("%Y-%m-%dT%H:%M")

    if "next week" in e:
        # Monday of next week 12:00
        days_ahead = (7 - now.weekday()) % 7 or 7
        target = (now + timedelta(days=days_ahead)).replace(hour=12, minute=0)
        return target.strftime("%Y-%m-%dT%H:%M")

    return None


def _fuzzy_name_score(haystack: str, needle: str) -> int:
    """Lower is better; -1 means no match at all."""
    if not haystack or not needle:
        return -1
    h = haystack.lower()
    n = needle.lower().strip()
    if not n:
        return -1
    if h == n:
        return 0
    if h.startswith(n):
        return 1
    if n in h:
        return 2 + h.index(n)
    # Token overlap: first token match
    ht = h.split()
    nt = n.split()
    if ht and nt and ht[0] == nt[0]:
        return 5
    if any(t == n for t in ht):
        return 6
    return -1


async def _resolve_assignee_hints(hints: List[str], current_user: dict) -> dict:
    """
    Match each raw hint against real users (same company_domain) and groups.
    Also handles special tokens: 'my team' / 'the team' / 'our team' → the manager's direct reports.
    Returns:
      { 'resolved': [ {kind, id, name, email, members?:[user_ids], member_count} ],
        'ambiguous': [ {hint, candidates: [{id,name,email}] } ],
        'unresolved': [hint, ...] }
    """
    if not hints:
        return {"resolved": [], "ambiguous": [], "unresolved": []}

    domain = current_user.get("company_domain")
    users = []
    if domain:
        users = await db.users.find({"company_domain": domain}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    groups = []
    g_query = {"owner_id": current_user.get("id")}
    if domain:
        g_query = {"$or": [{"company_domain": domain}, {"owner_id": current_user.get("id")}]}
    groups = await db.user_groups.find(g_query, {"_id": 0}).to_list(200)

    # Preload direct reports (for 'my team') — hierarchy uses reports_to
    my_reports = []
    if current_user.get("id"):
        my_reports = await db.users.find(
            {"reports_to": current_user["id"]},
            {"_id": 0, "id": 1, "name": 1, "email": 1},
        ).to_list(200)

    # Preload FULL transitive subordinates (direct reports of direct reports, ...)
    async def _all_subordinates(root_id: str) -> List[dict]:
        seen = {root_id}
        frontier = [root_id]
        all_subs = []
        while frontier:
            next_frontier = []
            reports = await db.users.find(
                {"reports_to": {"$in": frontier}},
                {"_id": 0, "id": 1, "name": 1, "email": 1},
            ).to_list(500)
            for u in reports:
                if u["id"] in seen:
                    continue
                seen.add(u["id"])
                all_subs.append(u)
                next_frontier.append(u["id"])
            frontier = next_frontier
        return all_subs
    everyone_under_me = await _all_subordinates(current_user["id"]) if current_user.get("id") else []
    has_indirect = len(everyone_under_me) > len(my_reports)

    resolved = []
    ambiguous = []
    unresolved = []
    seen_ids = set()
    needs_team_scope = False

    for raw in hints:
        h = (raw or "").strip()
        if not h:
            continue
        low = h.lower().strip().lstrip("@")
        # Special: "me" / "myself"
        if low in ("me", "myself", "self"):
            if current_user["id"] not in seen_ids:
                resolved.append({"kind": "user", "id": current_user["id"], "name": current_user["name"], "email": current_user["email"]})
                seen_ids.add(current_user["id"])
            continue

        # Special: my team / the team / our team → direct reports (if any) else all same-domain users
        if low in ("my team", "the team", "our team", "team", "my reports", "my direct reports", "direct reports"):
            targets = my_reports or [u for u in users if u["id"] != current_user["id"]]
            member_ids = [u["id"] for u in targets]
            if member_ids:
                # Provide alternates so frontend can show a subtle scope picker
                alternates = []
                if my_reports and has_indirect:
                    needs_team_scope = True
                    alternates.append({
                        "kind": "team", "id": "everyone-under-me",
                        "name": f"Everyone under me ({len(everyone_under_me)})",
                        "members": [u["id"] for u in everyone_under_me],
                        "member_count": len(everyone_under_me),
                        "member_names": [u["name"] for u in everyone_under_me],
                    })
                elif everyone_under_me and not my_reports:
                    # No direct reports recorded but transitive graph exists
                    targets = everyone_under_me
                    member_ids = [u["id"] for u in targets]
                domain_flat = [u for u in users if u["id"] != current_user["id"]]
                if domain_flat and len(domain_flat) != len(member_ids):
                    alternates.append({
                        "kind": "team", "id": "everyone-in-domain",
                        "name": f"Everyone in {domain}" if domain else "Everyone",
                        "members": [u["id"] for u in domain_flat],
                        "member_count": len(domain_flat),
                        "member_names": [u["name"] for u in domain_flat],
                    })
                # Also surface named groups as quick alternates
                for g in groups[:5]:
                    g_emails = g.get("emails") or []
                    g_member_ids = []
                    g_names = []
                    for em in g_emails:
                        u = next((x for x in users if x["email"].lower() == em.lower()), None)
                        if u:
                            g_member_ids.append(u["id"])
                            g_names.append(u["name"])
                    if g_emails:
                        alternates.append({
                            "kind": "group",
                            "id": g["id"],
                            "name": g["name"],
                            "members": g_member_ids,
                            "emails": g_emails,
                            "member_count": len(g_emails),
                            "member_names": g_names,
                        })
                resolved.append({
                    "kind": "team",
                    "id": "my-team",
                    "name": f"Direct reports ({len(my_reports)})" if my_reports else (f"Everyone in {domain}" if domain else "Everyone"),
                    "email": None,
                    "members": member_ids,
                    "member_count": len(member_ids),
                    "member_names": [u["name"] for u in targets],
                    "alternates": alternates,
                    "needs_scope_pick": needs_team_scope,
                })
            continue

        # Special: everyone under me → transitive
        if low in ("everyone under me", "everyone reporting to me", "my whole team", "whole team", "all my reports", "indirect reports", "all reports"):
            if everyone_under_me:
                resolved.append({
                    "kind": "team",
                    "id": "everyone-under-me",
                    "name": f"Everyone under me ({len(everyone_under_me)})",
                    "email": None,
                    "members": [u["id"] for u in everyone_under_me],
                    "member_count": len(everyone_under_me),
                    "member_names": [u["name"] for u in everyone_under_me],
                })
            continue

        # Exact-ish email match
        if "@" in low:
            match = next((u for u in users if u["email"].lower() == low), None)
            if match:
                if match["id"] not in seen_ids:
                    resolved.append({"kind": "user", "id": match["id"], "name": match["name"], "email": match["email"]})
                    seen_ids.add(match["id"])
            else:
                # Unresolved email → keep as an email address for bulk-create
                resolved.append({"kind": "email", "id": None, "name": low.split("@")[0], "email": low})
            continue

        # Try group match first (managers, sales team, etc.)
        gmatch = None
        gscore = 9999
        for g in groups:
            s = _fuzzy_name_score(g["name"], low)
            if s != -1 and s < gscore:
                gscore = s
                gmatch = g
        # Also match hardcoded team words
        if gmatch and gscore <= 5:
            member_ids = []
            member_names = []
            for em in gmatch.get("emails", []):
                u = next((x for x in users if x["email"].lower() == em.lower()), None)
                if u:
                    member_ids.append(u["id"])
                    member_names.append(u["name"])
            resolved.append({
                "kind": "group",
                "id": gmatch["id"],
                "name": gmatch["name"],
                "email": None,
                "members": member_ids,
                "member_count": len(gmatch.get("emails", [])),
                "member_names": member_names,
                "emails": gmatch.get("emails", []),
            })
            continue

        # Fuzzy match on users
        user_candidates = []
        for u in users:
            s = _fuzzy_name_score(u["name"], low)
            s_email = _fuzzy_name_score(u["email"].split("@")[0], low)
            best = min([x for x in (s, s_email) if x != -1], default=-1)
            if best != -1:
                user_candidates.append((best, u))
        user_candidates.sort(key=lambda x: x[0])

        if not user_candidates:
            unresolved.append(h)
        elif len(user_candidates) == 1 or user_candidates[0][0] < user_candidates[1][0]:
            u = user_candidates[0][1]
            if u["id"] not in seen_ids:
                resolved.append({"kind": "user", "id": u["id"], "name": u["name"], "email": u["email"]})
                seen_ids.add(u["id"])
        else:
            # Ambiguous — top score tied with next
            top_score = user_candidates[0][0]
            top = [u for s, u in user_candidates if s == top_score][:5]
            ambiguous.append({"hint": h, "candidates": top})

    return {
        "resolved": resolved,
        "ambiguous": ambiguous,
        "unresolved": unresolved,
        "needs_team_scope": needs_team_scope,
    }


def _rewrite_description_for_assignee(desc: str, manager_name: Optional[str] = None) -> str:
    """Turn manager-centric wording into clear instructions for the assignee."""
    if not desc:
        return desc
    s = str(desc).strip()
    mgr = (manager_name or "your manager").strip() or "your manager"

    replacements = [
        (r"(?i)^ask\s+(?:my|the|our)\s+team\s+to\s+", "Please "),
        (r"(?i)^i\s+want\s+(?:my|the|our)\s+team\s+to\s+", "Please "),
        (r"(?i)^have\s+(?:my|the|our)\s+team\s+", "Please "),
        (r"(?i)^tell\s+(?:my|the|our)\s+team\s+to\s+", "Please "),
        (r"(?i)\bsend\s+me\b", f"send {mgr}"),
        (r"(?i)\breport\s+(?:back\s+)?to\s+me\b", f"report to {mgr}"),
        (r"(?i)\bupdate\s+me\b", f"update {mgr}"),
        (r"(?i)\blet\s+me\s+know\b", f"let {mgr} know"),
        (r"(?i)\bshare\s+(?:it|this|them)?\s*with\s+me\b", f"share with {mgr}"),
        (r"(?i)\bemail\s+me\b", f"email {mgr}"),
    ]
    for pat, repl in replacements:
        s = re.sub(pat, repl, s)

    if s and not re.match(r"(?i)^(please|kindly|complete|send|submit|prepare|create|update|review|finalize|draft|schedule|call|follow)\b", s):
        # Soft nudge into imperative assignee voice when it still reads like a note-to-self
        if re.search(r"(?i)\b(my team|them|they)\b", s):
            s = re.sub(r"(?i)\b(?:my|the|our)\s+team\b", "you", s)
            s = re.sub(r"(?i)\bthem\b", "this", s)
            s = re.sub(r"(?i)\bthey\b", "you", s)
        if not re.match(r"(?i)^please\b", s):
            s = "Please " + s[0].lower() + s[1:] if len(s) > 1 else "Please " + s

    return s.strip()


def _assignee_name_list(parsed: dict) -> List[str]:
    names = []
    for h in parsed.get("assignee_hints") or []:
        if isinstance(h, str) and h.strip():
            names.append(h.strip().lstrip("@"))
    ar = parsed.get("assignee_resolution") or {}
    for r in ar.get("resolved") or []:
        if isinstance(r, dict) and r.get("name"):
            names.append(str(r["name"]).strip())
    # unique, longest first so "Mark Sibghat" is removed before "Mark"
    uniq = []
    seen = set()
    for n in sorted(names, key=lambda x: len(x), reverse=True):
        key = n.lower()
        if key and key not in seen and key not in ("me", "self"):
            seen.add(key)
            uniq.append(n)
    return uniq


def _strip_people_noise(text: str, people_names: Optional[List[str]] = None) -> str:
    """Remove @mentions and known person names so they don't leak into title/description."""
    if not text:
        return ""
    s = str(text)
    # Multi-word @mentions: "@Mark Sibghat", "@Benjamin White"
    s = re.sub(r"@[A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,2}", " ", s)
    s = re.sub(r"@\S+", " ", s)
    for name in people_names or []:
        if not name:
            continue
        s = re.sub(rf"\b{re.escape(name)}\b", " ", s, flags=re.I)
    # Drop leading leftover first/last name tokens from known people
    name_tokens = set()
    for name in people_names or []:
        for part in re.split(r"\s+", name.strip()):
            if len(part) > 1:
                name_tokens.add(part.lower())
    tokens = s.split()
    while tokens and tokens[0].lower().strip(".,;:") in name_tokens:
        tokens.pop(0)
    s = " ".join(tokens)
    s = re.sub(r"\s+", " ", s).strip(" .,:;-")
    return s


def _title_from_work_text(work: str) -> str:
    """Build a short imperative title from cleaned work text."""
    if not work:
        return ""
    s = work
    s = re.sub(r"(?i)^(need to|needs to|have to|must|please)\s+", "", s).strip()
    # Prefer starting at a strong verb when present
    m = re.search(
        r"(?i)\b(finalize|update|review|complete|prepare|create|send|call|fix|submit|draft|schedule|align|close)\b.*$",
        s,
    )
    if m:
        s = m.group(0)
    s = re.sub(r"(?i)\b(by|before|due)\s+.+$", "", s).strip(" .,:;-")
    words = [w for w in s.split() if w][:8]
    title = " ".join(words)
    if title and title[0].islower():
        title = title[0].upper() + title[1:]
    return title


def _enrich_parse_title_description(parsed: dict, raw_text: str, manager_name: Optional[str] = None) -> None:
    """Keep title short/clean and ensure detailed prompts land as assignee-facing description."""
    people = _assignee_name_list(parsed)
    title = _strip_people_noise(str(parsed.get("title") or "").strip(), people)
    desc = _strip_people_noise(str(parsed.get("description") or "").strip(), people)
    actions = parsed.get("action_items") if isinstance(parsed.get("action_items"), list) else []
    actions = [_strip_people_noise(str(a), people) for a in actions if str(a).strip()]
    actions = [a for a in actions if a]

    work = _strip_people_noise(raw_text or "", people)
    # Drop manager-voice prefixes before building title/description
    work = re.sub(
        r"(?i)^(ask|tell|have|i want)\s+(?:my|the|our)\s+team\s+to\s+",
        "",
        work,
    ).strip()
    work = re.sub(r"(?i)\b(by|before|due)\s+.+$", "", work).strip(" .,:;-")

    # Bad / name-contaminated titles
    title_l = title.lower()
    has_person_token = any(
        re.search(rf"\b{re.escape(p.split()[-1])}\b", title_l)
        for p in people
        if p and len(p.split()[-1]) > 2
    )
    bad_title = (
        not title
        or re.match(r"(?i)^assign\b", title)
        or "@" in title
        or has_person_token
        or len(title.split()) > 14
        or (len(raw_text or "") > 80 and len(title) > 50 and title.lower()[:40] in (raw_text or "").lower())
    )
    if bad_title:
        seed = actions[0] if actions else work
        title = _title_from_work_text(seed) or _title_from_work_text(work)
        if title:
            parsed["title"] = title
    else:
        parsed["title"] = title

    if not desc and actions:
        desc = "\n".join(f"{i + 1}. {a}" for i, a in enumerate(actions))

    if not desc and len((raw_text or "").strip()) > 40:
        cleaned = work
        if len(cleaned) > 20:
            desc = cleaned

    # Always present the task the way the assignee should read it
    if desc:
        parsed["description"] = _rewrite_description_for_assignee(desc, manager_name)
    if actions:
        parsed["action_items"] = [
            _rewrite_description_for_assignee(a, manager_name) for a in actions
        ]


async def _llm_parse(text: str, current_user: dict, context_hint: Optional[str] = None) -> Optional[dict]:
    emergent_key = os.getenv("EMERGENT_LLM_KEY")
    if not emergent_key:
        return None
    now = get_pst_now()
    context = f"Current date/time: {now.strftime('%A, %B %d %Y at %H:%M')} (PST). User: {current_user.get('name')}, org: {current_user.get('company_domain', 'personal')}."
    if context_hint:
        context += f" Hint: {context_hint}"
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"parse_{current_user['id']}_{int(now.timestamp())}",
            system_message=SMART_PARSE_SYSTEM + "\n\n" + context
        ).with_model("openai", "gpt-4o-mini")
        raw = await asyncio.wait_for(chat.send_message(UserMessage(text=text)), timeout=8.0)
    except Exception as e:
        logging.warning(f"smart_parse LLM error: {e}")
        return None

    text_out = raw if isinstance(raw, str) else str(raw)
    text_out = text_out.strip()
    if text_out.startswith("```"):
        text_out = text_out.strip("`")
        if text_out.lower().startswith("json"):
            text_out = text_out[4:]
    try:
        start = text_out.index("{")
        end = text_out.rindex("}") + 1
        return _json.loads(text_out[start:end])
    except Exception:
        return None


@api_router.post("/ai/parse-task")
async def smart_parse_task(req: SmartParseRequest, current_user: dict = Depends(get_current_user)):
    text = (req.text or "").strip()
    if not text or len(text) < 3:
        raise HTTPException(status_code=400, detail="Text too short")

    now = get_pst_now()
    fallback = {
        "title": text[:60],
        "description": "",
        "priority": "Medium",
        "category": "General",
        "due_date": None,
        "due_date_expression": "",
        "action_items": [],
        "assignee_hints": [],
        "success_criteria": "",
        "is_sales_task": False,
        "requires_screen_recording": False,
        "recurring": {"is_recurring": False, "frequency": None, "days_of_week": None, "time_of_day": None, "end_time_of_day": None, "end_type": None, "end_date": None, "end_count": None, "raw_phrase": ""},
        "intent": "task",
        "clarifying_questions": [],
        "confidence": {"title": 0.3, "priority": 0.2, "due_date": 0.0, "assignees": 0.0},
    }

    parsed = await _llm_parse(text, current_user, req.context_hint) or fallback

    # Merge shape
    for k, v in fallback.items():
        if k not in parsed:
            parsed[k] = v
    if parsed.get("priority") not in ["Low", "Medium", "High", "Urgent"]:
        parsed["priority"] = "Medium"
    if not isinstance(parsed.get("assignee_hints"), list):
        parsed["assignee_hints"] = []
    if not isinstance(parsed.get("clarifying_questions"), list):
        parsed["clarifying_questions"] = []
    if parsed.get("success_criteria") is None:
        parsed["success_criteria"] = ""
    elif not isinstance(parsed.get("success_criteria"), str):
        parsed["success_criteria"] = str(parsed.get("success_criteria") or "")

    # Date: prefer deterministic parser on the FULL user text (e.g. "10 tomorrow"),
    # even when the LLM returned a weak default like noon tomorrow.
    fb = _fallback_parse_date_expression(text, now) or _fallback_parse_date_expression(
        parsed.get("due_date_expression") or "", now
    )
    if fb:
        explicit_clock = bool(re.search(
            r"\b(?:by\s+|at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\s+tomorrow\b"
            r"|\btomorrow\s+(?:at\s+|by\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b"
            r"|\b(?:by |at )?\d{1,2}(?::\d{2})?\s*(am|pm)\b"
            r"|\b(?:asap|urgent(ly)?|eod|end of day)\b",
            (text or "").lower(),
        ))
        if (not parsed.get("due_date")) or explicit_clock:
            parsed["due_date"] = fb

    # ASAP override — if the text is explicitly ASAP/urgent, force within-2h regardless of what LLM said
    low_text = (text or "").lower()
    if re.search(r"\b(asap|urgent(ly)?|immediately|right now|right away|as soon as possible)\b", low_text):
        parsed["priority"] = "Urgent"
        try:
            current_dt = datetime.fromisoformat(parsed["due_date"]) if parsed.get("due_date") else None
            need_override = current_dt is None or (current_dt - now.replace(tzinfo=None)).total_seconds() > 4 * 3600
        except Exception:
            need_override = True
        if need_override:
            parsed["due_date"] = _round_to_quarter(now + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")
            if not parsed.get("due_date_expression"):
                parsed["due_date_expression"] = "ASAP"

    # Sales language → always mark as a sales task (don't rely on the LLM alone)
    _apply_sales_detection(parsed, text)

    # Ensure multi-word @mentions / team phrases become assignee hints even if the LLM skipped them
    hints = list(parsed.get("assignee_hints") or [])
    hint_keys = {str(h).strip().lstrip("@").lower() for h in hints}
    for m in re.finditer(r"@([A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,2})", text or ""):
        hint = m.group(1).strip()
        key = hint.lower()
        if hint and key not in hint_keys:
            hints.append(hint)
            hint_keys.add(key)
    # Manager-voice team phrases
    low_text = (text or "").lower()
    team_phrase_map = [
        (r"\beveryone under me\b|\bmy whole team\b|\ball my reports\b|\bindirect reports\b", "everyone under me"),
        (r"\bmy direct reports\b|\bdirect reports\b", "my direct reports"),
        (r"\bmy team\b|\bour team\b|\bthe team\b", "my team"),
    ]
    for pat, token in team_phrase_map:
        if re.search(pat, low_text) and token not in hint_keys:
            hints.append(token)
            hint_keys.add(token)
            break
    parsed["assignee_hints"] = hints

    # Resolve assignees before title scrub so known names can be removed from title/description
    if req.resolve:
        parsed["assignee_resolution"] = await _resolve_assignee_hints(parsed.get("assignee_hints", []), current_user)

    # Title/description quality — strip @people and keep real work text (assignee-facing)
    _enrich_parse_title_description(parsed, text, manager_name=current_user.get("name"))

    # Rebuild clarifying questions: at most ONE, preferring who / team-scope over when
    needs_who = False
    needs_team_scope = False
    needs_when = not bool(parsed.get("due_date"))
    if req.resolve:
        ar = parsed.get("assignee_resolution") or {}
        needs_team_scope = bool(ar.get("needs_team_scope"))
        # Ask who only when we have no resolved assignees and no ambiguous candidates to pick from
        if not ar.get("resolved") and not ar.get("ambiguous"):
            needs_who = True

    single_q = None
    if needs_who:
        single_q = "Who should own this task?"
    elif needs_team_scope:
        single_q = "Which team scope — direct reports or everyone under you?"
    elif needs_when:
        single_q = "When should this be done by?"
    else:
        # Keep at most one LLM question if it is about who/when; drop the rest
        for q in parsed["clarifying_questions"]:
            ql = (q or "").lower()
            if any(k in ql for k in ("who", "assign", "when", "due", "deadline")):
                single_q = q
                break
    parsed["clarifying_questions"] = [single_q] if single_q else []

    return parsed


class QuickCreatePreviewRequest(BaseModel):
    text: str
    answers: Optional[Dict[str, str]] = None  # optional Q&A pass-through


@api_router.post("/ai/quick-create-preview")
async def quick_create_preview(req: QuickCreatePreviewRequest, current_user: dict = Depends(get_current_user)):
    """One-shot: parse + resolve → returns a ready-to-confirm task preview + clarifying questions."""
    # If answers were provided, append them to the text so the LLM has more context
    text = req.text or ""
    if req.answers:
        add = " ".join([f"{k}: {v}" for k, v in req.answers.items() if v])
        if add:
            text = f"{text}. Additional info: {add}"

    parse_req = SmartParseRequest(text=text, resolve=True)
    parsed = await smart_parse_task(parse_req, current_user)
    # Ready when due + assignee are known and no clarifying question remains
    ar = parsed.get("assignee_resolution", {"resolved": [], "ambiguous": [], "unresolved": []})
    parsed["ready_to_confirm"] = (
        bool(parsed.get("due_date"))
        and len(ar.get("resolved", [])) > 0
        and len(ar.get("ambiguous", [])) == 0
        and len(parsed.get("clarifying_questions", [])) == 0
    )
    return parsed


# ==========================================================================
# VOICE ASSISTANT KNOWLEDGE BASE — answer product/how-to questions
# ==========================================================================

TSKFLOW_KB = """TskFlow is an Accountability Management Platform. Use these facts when answering how-to questions:

CORE CONCEPTS
- Purpose: help teams close the loop on commitments. Every task has a clear owner, due time, acceptance step, and completion proof.
- Task lifecycle: Pending → Accepted → In Progress → Completed → Approved. Assignees can also Counter-Propose a new due date, or Decline with a reason.
- Group tasks: assign one task to several people; each assignee gets their own subtask with its own status. A Group Task Leaderboard ranks them by speed & engagement.

FEATURES
- Drafts: as soon as you start typing in Create Task, TskFlow auto-saves a draft. Resume unfinished drafts from the yellow "Unfinished Drafts" strip on your dashboard, or delete them with the trash icon.
- Recurring tasks: turn any task into a series (Daily, Weekdays, Weekly, Every 2 Weeks, Monthly, Yearly, or Custom). It stops when you set an end date, an end-after count, or never (you stop it manually). Edit a series with three scopes: This occurrence / This + future / Entire series.
- Voice Mode: tap the microphone. It listens immediately (no popup), understands "what's outstanding", "create a task to call Alex tomorrow", "open analytics", and answers "how do I…" questions about TskFlow itself. Voice Mode keeps running as you navigate.
- Smart Task Creation: type a description (or dictate one). TskFlow infers title, due date, priority, category, and assignee hints, then pre-fills the form. You can always override.
- Screen Recordings: attach a Loom-style recording to a task or share a standalone recording. The receiver plays it inline (no download).
- Analytics: Overall Analytics (completion rate, overdue count, avg completion time, response time, trends, team + date filters) and a separate Team Leaderboard (fastest completions, highest completion rate, most completed, streaks, badges).
- End-of-Day Report: daily Jarvis email summarizing today's completions and open items.
- Smart Reminders: enable in Settings → Reminders. Choose triggers (time-before-due, no progress, no response, approaching deadline, overdue) and channels (in-app, email, Slack).
- Help Center: /help — quick start, feature docs, walkthrough, FAQs, and "What's New".

NAVIGATION
- Dashboard is /dashboard; Analytics /analytics; Team Leaderboard /analytics#leaderboard; Team & Reports /team; Settings /settings; Recordings /recordings; Help Center /help; Recurring series /recurring.

BEST PRACTICES
- Only mark a task Done when it's actually done — the reviewer must approve to close it.
- Use Group tasks for "one thing, many people" (e.g. quarterly training) so accountability is visible.
- Turn important routines into Recurring series so nothing slips.
- Enable Smart Reminders for High/Urgent priorities so no important task goes cold.
"""


VOICE_ASSISTANT_SYSTEM = """You are Jarvis, TskFlow's professional AI manager (voice + chat). Sound like a sharp, calm ops lead — natural spoken English, never stiff or robotic.
When Context JSON includes daily_sheet_metrics, use those numbers to answer manager questions about what an AE/rep is doing today (calls, emails, Salesforce tasks, etc.). Prefer real metric values over guessing.
You help with anything the user asks while they work:
1) EXECUTE task commands ("create a task to X", "what's outstanding", "open analytics", etc.)
2) ANSWER questions — product how-tos, what a status means, who to assign, deadlines, best practices, and follow-ups on the recent conversation.
3) Keep continuity: if Recent conversation is provided, treat it as the same chat and answer follow-ups naturally.

Return ONE JSON object ONLY (no markdown), shape:
{
  "reply": "<short helpful reply, 1-3 sentences, conversational — contractions OK>",
  "action": {
    "type": "query_outstanding | create_task | assign_task | update_status | navigate | assistant_answer | none",
    "params": { ... }
  }
}

Rules:
- Prefer action.type="assistant_answer" for questions; put the answer in reply.
- For TskFlow product questions, ground answers in the Knowledge Base — never invent features.
- For questions about the user's own tasks/contacts, use the Context JSON.
- Task commands use query_outstanding / create_task / assign_task / update_status / navigate.
- If unclear, action.type="none" and ask one short clarifying question.
- Keep replies concise (about 40 words max unless listing tasks). Write for speaking aloud: short sentences, natural rhythm, no bullet theater unless listing tasks.

KNOWLEDGE BASE:
""" + TSKFLOW_KB


# Replace existing VOICE_SYSTEM_PROMPT usage. (We keep the old one for backward compat but the endpoint now uses this.)


# ==========================================================================
# SMART REMINDERS
# ==========================================================================

class ReminderRule(BaseModel):
    """User-controllable smart reminder preferences.

    Defaults are intentionally quiet: only High/Urgent, before-due + overdue,
    in-app only (no email until the user opts in).
    """
    enabled: bool = True
    triggers: List[str] = ["time_before_due", "overdue"]
    hours_before_due: int = 4
    frequency_hours: int = 12  # minimum hours between nudges for the same task
    channels: List[str] = ["in_app"]
    priorities: List[str] = ["High", "Urgent"]
    quiet_hours_start: Optional[int] = 21  # 9pm local/PST — suppress Low/Medium-style noise; Urgent ignores
    quiet_hours_end: Optional[int] = 8    # 8am
    max_emails_per_day: int = 5           # hard cap so email never overwhelms


@api_router.get("/reminders/rules")
async def get_reminder_rules(current_user: dict = Depends(get_current_user)):
    doc = await db.reminder_rules.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not doc:
        defaults = ReminderRule().dict()
        return {"rules": defaults}
    return {"rules": {k: v for k, v in doc.items() if k not in ("_id", "user_id")}}


@api_router.put("/reminders/rules")
async def set_reminder_rules(rule: ReminderRule, current_user: dict = Depends(get_current_user)):
    await db.reminder_rules.update_one(
        {"user_id": current_user["id"]},
        {"$set": {**rule.dict(), "user_id": current_user["id"], "updated_at": get_pst_now().isoformat()}},
        upsert=True
    )
    return {"ok": True}


async def _check_smart_reminders():
    """Smart reminder job — fully respects each assignee's ReminderRule.

    Controllable knobs:
      - enabled / priorities / triggers / channels
      - hours_before_due (when "before due" fires)
      - frequency_hours (min gap between nudges)
      - max_emails_per_day (hard email volume cap)
      - quiet hours (suppresses Low/Medium; Urgent/High still fire)
    Also auto-cleans orphan tasks (missing/deleted parent, missing user, invalid due date).
    """
    try:
        now = get_pst_now()
        day_key = now.strftime("%Y-%m-%d")
        # Load all rules keyed by user (including disabled — we skip them later)
        rules_by_user = {}
        async for r in db.reminder_rules.find({}, {"_id": 0}):
            rules_by_user[r["user_id"]] = r
        # Find candidate open tasks — MUST match the dashboard's "live task" definition
        tasks = await db.tasks.find({
            "status": {"$nin": ["Completed", "Declined", "Draft", "Cancelled", "Rejected"]},
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True}
        }, {"_id": 0}).to_list(1000)

        # Cache parent + user existence to keep the loop cheap
        parent_ids_needed = list({t["parent_id"] for t in tasks if t.get("parent_id")})
        parents_by_id = {}
        if parent_ids_needed:
            async for p in db.tasks.find({"id": {"$in": parent_ids_needed}}, {"_id": 0, "id": 1, "deleted": 1, "status": 1}):
                parents_by_id[p["id"]] = p
        user_ids_needed = list({t["assigned_to"] for t in tasks if t.get("assigned_to") and not str(t["assigned_to"]).startswith("email_")})
        users_by_id = {}
        if user_ids_needed:
            async for u in db.users.find({"id": {"$in": user_ids_needed}}, {"_id": 0, "id": 1, "deleted": 1, "email": 1, "name": 1, "company_domain": 1, "preferences": 1}):
                users_by_id[u["id"]] = u

        default_rule = ReminderRule().dict()
        orphans_marked = 0
        emails_sent_today = {}  # user_id -> count for this run day

        for t in tasks:
            aid = t.get("assigned_to")

            # ---- ORPHAN GUARDS ----
            if not aid or str(aid).startswith("email_"):
                continue

            # 1) Orphan: parent gone/deleted → auto-mark this child deleted
            if t.get("parent_id"):
                parent = parents_by_id.get(t["parent_id"])
                if not parent or parent.get("deleted"):
                    await db.tasks.update_one(
                        {"id": t["id"]},
                        {"$set": {"deleted": True, "deleted_at": now.isoformat(), "deleted_by": "system_orphan_cleanup"}}
                    )
                    orphans_marked += 1
                    continue

            # 2) Orphan: assignee no longer exists / marked deleted → auto-mark task deleted
            u = users_by_id.get(aid)
            if not u or u.get("deleted"):
                await db.tasks.update_one(
                    {"id": t["id"]},
                    {"$set": {"deleted": True, "deleted_at": now.isoformat(), "deleted_by": "system_orphan_cleanup"}}
                )
                orphans_marked += 1
                continue

            # 3) Invalid due_date → mark deleted (nothing to remind about)
            if not t.get("due_date"):
                await db.tasks.update_one(
                    {"id": t["id"]},
                    {"$set": {"deleted": True, "deleted_at": now.isoformat(), "deleted_by": "system_orphan_cleanup"}}
                )
                orphans_marked += 1
                continue

            r = rules_by_user.get(aid, default_rule)
            if not r.get("enabled", True):
                continue
            allowed_prios = r.get("priorities") or []
            if not allowed_prios or t.get("priority") not in allowed_prios:
                continue
            if t.get("status") == "Blocked":
                continue

            channels = r.get("channels") or []
            if not channels:
                continue  # nowhere to send → skip

            pcfg = priority_followup_config(t.get("priority"))
            # Quiet hours: user-configurable; Urgent always breaks through
            q_start = r.get("quiet_hours_start")
            q_end = r.get("quiet_hours_end")
            if q_start is not None and q_end is not None and t.get("priority") != "Urgent":
                try:
                    qs, qe = int(q_start), int(q_end)
                    in_quiet = (qs <= now.hour or now.hour < qe) if qs > qe else (qs <= now.hour < qe)
                    # Also keep legacy priority quiet window for Low/Medium during off-hours
                    if in_quiet and pcfg.get("quiet"):
                        continue
                except Exception:
                    pass
            elif pcfg.get("quiet") and not (9 <= now.hour < 18):
                continue

            last = t.get("last_smart_reminder_sent")
            # User frequency is the floor; priority config can only make it *more* frequent up to that floor.
            try:
                user_gap = max(1, int(r.get("frequency_hours", 12)))
            except Exception:
                user_gap = 12
            gap_hours = max(user_gap, 1)
            # Still allow High/Urgent to come a bit sooner than Low, but never below user's floor
            # unless user set a very high floor — user wins.
            _ = pcfg  # priority config still used for no_response / no_progress thresholds

            triggers = r.get("triggers") or []
            try:
                due = datetime.fromisoformat(t["due_date"].replace("Z", "+00:00"))
                if due.tzinfo is None:
                    due = due.replace(tzinfo=PST)
            except Exception:
                await db.tasks.update_one(
                    {"id": t["id"]},
                    {"$set": {"deleted": True, "deleted_at": now.isoformat(), "deleted_by": "system_orphan_cleanup"}}
                )
                orphans_marked += 1
                continue

            hours_to_due = (due - now).total_seconds() / 3600.0
            try:
                hours_before = max(1, min(72, int(r.get("hours_before_due", 4))))
            except Exception:
                hours_before = 4

            fired_buckets = t.get("reminder_buckets_fired", []) or []
            bucket = None

            # Overdue — only if trigger enabled
            if hours_to_due < 0 and "overdue" in triggers:
                bucket = "overdue"
            # Before due — only if trigger enabled; use user's hours_before_due window
            elif "time_before_due" in triggers and 0 <= hours_to_due <= hours_before:
                # Sub-buckets inside the user window so Urgent still gets a late nudge,
                # but never outside hours_before_due.
                if hours_to_due <= 0.5 and hours_before >= 0.5:
                    bucket = "30min"
                elif hours_to_due <= min(2, hours_before) and hours_to_due > 0.5:
                    bucket = "2h"
                elif hours_to_due <= hours_before:
                    bucket = "before_due"

            # If bucket already fired, skip UNLESS overdue (overdue rotates every gap_hours)
            if bucket and bucket != "overdue" and bucket in fired_buckets:
                bucket = None
            if bucket == "overdue" and last:
                try:
                    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=PST)
                    if (now - last_dt).total_seconds() < gap_hours * 3600:
                        bucket = None
                except Exception:
                    pass

            fired_kind = None
            if bucket:
                fired_kind = bucket
            elif "no_response" in triggers and t.get("status") == "Pending":
                created = t.get("created_at")
                if created:
                    try:
                        cdt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                        if cdt.tzinfo is None:
                            cdt = cdt.replace(tzinfo=PST)
                        if (now - cdt).total_seconds() >= float(pcfg["no_response_hours"]) * 3600:
                            if last:
                                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                                if last_dt.tzinfo is None:
                                    last_dt = last_dt.replace(tzinfo=PST)
                                if (now - last_dt).total_seconds() < gap_hours * 3600:
                                    continue
                            fired_kind = "no_response"
                    except Exception:
                        pass
            elif "no_progress" in triggers and t.get("status") == "Accepted":
                acc = t.get("accepted_at")
                if acc:
                    try:
                        adt = datetime.fromisoformat(acc.replace("Z", "+00:00"))
                        if adt.tzinfo is None:
                            adt = adt.replace(tzinfo=PST)
                        if (now - adt).total_seconds() >= float(pcfg["no_progress_hours"]) * 3600 and hours_to_due < 48:
                            if last:
                                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                                if last_dt.tzinfo is None:
                                    last_dt = last_dt.replace(tzinfo=PST)
                                if (now - last_dt).total_seconds() < gap_hours * 3600:
                                    continue
                            fired_kind = "no_progress"
                    except Exception:
                        pass

            if not fired_kind:
                continue

            # Global gap check for non-overdue kinds that skipped the earlier last check
            if fired_kind not in ("overdue",) and last and fired_kind not in ("no_response", "no_progress"):
                try:
                    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=PST)
                    if (now - last_dt).total_seconds() < gap_hours * 3600:
                        continue
                except Exception:
                    pass

            wording = _reminder_wording(fired_kind, t)
            user = users_by_id.get(aid) or await db.users.find_one({"id": aid}, {"_id": 0})
            if not user:
                continue

            channels_sent = []
            # Channel delivery — each channel is opt-in
            if "in_app" in channels:
                # Don't pile unread reminder rows for the same task (login spam source)
                existing_unread = await db.notifications.find_one({
                    "user_id": aid,
                    "task_id": t["id"],
                    "type": "reminder",
                    "read": {"$ne": True},
                }, {"_id": 0, "id": 1})
                if existing_unread:
                    await db.notifications.update_one(
                        {"id": existing_unread["id"]},
                        {"$set": {
                            "title": _notify_text(wording["title"]),
                            "body": _notify_text(f"{t.get('title')} - priority {t.get('priority')}"),
                            "created_at": now.isoformat(),
                            "delivered": True,  # catch-up UI, not OS toast
                        }},
                    )
                else:
                    nid = str(uuid.uuid4())
                    await db.notifications.insert_one({
                        "id": nid,
                        "user_id": aid,
                        "type": "reminder",
                        "title": _notify_text(wording["title"]),
                        "body": _notify_text(f"{t.get('title')} - priority {t.get('priority')}"),
                        "task_id": t["id"],
                        "read": False,
                        "delivered": True,  # bell/catch-up only; never OS-spam on login
                        "created_at": now.isoformat(),
                    })
                channels_sent.append("in_app")

            if "email" in channels:
                try:
                    max_emails = max(0, int(r.get("max_emails_per_day", 5)))
                except Exception:
                    max_emails = 5
                sent = emails_sent_today.get(aid, 0)
                # Persist a daily counter on the rule doc so caps survive across job runs
                rule_day = r.get("emails_sent_day")
                rule_count = int(r.get("emails_sent_count") or 0) if rule_day == day_key else 0
                if sent == 0:
                    sent = rule_count
                if max_emails > 0 and sent < max_emails:
                    await send_email_notification(
                        user["email"],
                        f"[TskFlow] {wording['title']}: {t['title']}",
                        render_reminder_email(user["name"], t, wording, APP_BASE_URL)
                    )
                    sent += 1
                    emails_sent_today[aid] = sent
                    await db.reminder_rules.update_one(
                        {"user_id": aid},
                        {"$set": {"emails_sent_day": day_key, "emails_sent_count": sent}},
                        upsert=False,
                    )
                    channels_sent.append("email")

            if "slack" in channels:
                try:
                    webhook = await _resolve_slack_webhook(user)
                    if webhook:
                        await _post_to_slack(
                            webhook,
                            f"⏰ *{wording['title']}*: {t['title']} ({t.get('priority')})",
                        )
                        channels_sent.append("slack")
                except Exception as slack_err:
                    logging.warning(f"[smart_reminders] slack post failed: {slack_err}")

            for ch in channels_sent:
                try:
                    await log_task_activity(
                        db,
                        task_id=t["id"],
                        event_type="reminder",
                        channel=ch,
                        actor_id=None,
                        actor_name="Smart Reminders",
                        recipient_id=aid,
                        recipient_name=user.get("name"),
                        recipient_email=user.get("email"),
                        company_domain=user.get("company_domain") or t.get("company_domain"),
                        title=wording.get("title") or "Reminder",
                        body=f"{t.get('title')} — {fired_kind}",
                        meta={"fired_kind": fired_kind, "priority": t.get("priority"), "bucket": bucket},
                        created_at=now.isoformat(),
                    )
                except Exception as log_err:
                    logging.warning(f"[smart_reminders] activity log failed: {log_err}")

            update_doc = {
                "last_smart_reminder_sent": now.isoformat(),
                "last_reminder_wording_idx": (t.get("last_reminder_wording_idx", -1) + 1) % 100,
            }
            if bucket and bucket != "overdue":
                update_doc["reminder_buckets_fired"] = list(set(fired_buckets + [bucket]))
            await db.tasks.update_one({"id": t["id"]}, {"$set": update_doc})
        if orphans_marked:
            logging.info(f"[smart_reminders] auto-cleaned {orphans_marked} orphan task(s)")
    except Exception as e:
        logging.error(f"[smart_reminders] {e}")


# ==========================================================================
# TASK CLEANUP — remove orphaned / garbage tasks from the database
# ==========================================================================

@api_router.post("/tasks/cleanup-orphaned")
async def cleanup_orphaned_tasks(current_user: dict = Depends(get_current_user)):
    """Soft-delete tasks that are effectively dead — orphaned children, tasks with missing
    assignees or invalid due_date. Scoped to what the current user can see:
      • For Teams tier: all tasks in their company_domain.
      • Otherwise: their own created_by tasks.
    Returns a per-reason breakdown so managers can see exactly what got cleaned.
    """
    now = get_pst_now().isoformat()
    reasons = {"parent_deleted": 0, "no_assignee_or_user": 0, "invalid_due_date": 0, "status_stuck_no_parent_or_user": 0}

    # Domain scope
    if current_user.get("subscription_tier") == "teams" and current_user.get("company_domain"):
        domain_users = await db.users.find({"company_domain": current_user["company_domain"]}, {"_id": 0, "id": 1}).to_list(1000)
        domain_ids = [u["id"] for u in domain_users]
        scope = {"$or": [{"assigned_to": {"$in": domain_ids}}, {"created_by": {"$in": domain_ids}}]}
    else:
        scope = {"created_by": current_user["id"]}

    live_scope = {**scope, "deleted": {"$ne": True}, "is_parent": {"$ne": True}}
    tasks = await db.tasks.find(live_scope, {"_id": 0}).to_list(5000)

    # Bulk-fetch parents & users
    parent_ids = list({t["parent_id"] for t in tasks if t.get("parent_id")})
    parents_by_id = {}
    if parent_ids:
        async for p in db.tasks.find({"id": {"$in": parent_ids}}, {"_id": 0, "id": 1, "deleted": 1}):
            parents_by_id[p["id"]] = p
    user_ids = list({t["assigned_to"] for t in tasks if t.get("assigned_to") and not str(t["assigned_to"]).startswith("email_")})
    users_by_id = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "deleted": 1}):
            users_by_id[u["id"]] = u

    to_delete_ids = []
    for t in tasks:
        aid = t.get("assigned_to")
        reason = None
        # Orphaned parent
        if t.get("parent_id"):
            p = parents_by_id.get(t["parent_id"])
            if not p or p.get("deleted"):
                reason = "parent_deleted"
        # No assignee OR assignee is gone
        if not reason:
            if not aid:
                reason = "no_assignee_or_user"
            elif not str(aid).startswith("email_"):
                u = users_by_id.get(aid)
                if not u or u.get("deleted"):
                    reason = "no_assignee_or_user"
        # Invalid due date
        if not reason:
            due = t.get("due_date")
            if not due:
                reason = "invalid_due_date"
            else:
                try:
                    datetime.fromisoformat(str(due).replace("Z", "+00:00"))
                except Exception:
                    reason = "invalid_due_date"

        if reason:
            reasons[reason] += 1
            to_delete_ids.append(t["id"])

    if to_delete_ids:
        await db.tasks.update_many(
            {"id": {"$in": to_delete_ids}},
            {"$set": {"deleted": True, "deleted_at": now, "deleted_by": current_user["id"], "cleanup_reason": "orphan"}}
        )

    # Also cascade delete: any parent that has no live children left → mark it deleted
    parents_still_alive = await db.tasks.find({**scope, "is_parent": True, "deleted": {"$ne": True}}, {"_id": 0, "id": 1}).to_list(500)
    orphan_parents = []
    for p in parents_still_alive:
        live_children = await db.tasks.count_documents({"parent_id": p["id"], "deleted": {"$ne": True}})
        if live_children == 0:
            orphan_parents.append(p["id"])
    if orphan_parents:
        await db.tasks.update_many(
            {"id": {"$in": orphan_parents}},
            {"$set": {"deleted": True, "deleted_at": now, "deleted_by": current_user["id"], "cleanup_reason": "empty_parent"}}
        )

    return {
        "ok": True,
        "cleaned": len(to_delete_ids) + len(orphan_parents),
        "reasons": reasons,
        "empty_parents_removed": len(orphan_parents),
    }


# ---------- Rotating reminder wording ----------

# Use ASCII hyphens only — unicode em-dashes show as "Ã¢ÂÂ" in some Chrome OS toasts.
_REMINDER_LINES = {
    "before_due": [
        {"title": "Due soon - heads up", "line": "This is coming due soon. A quick win closes it out."},
        {"title": "Deadline approaching", "line": "Keeping this on your radar before it becomes overdue."},
        {"title": "Coming due", "line": "You've still got time - wrap it up or propose a new deadline if needed."},
    ],
    "3h": [
        {"title": "Reminder - due in ~3 hours", "line": "Heads up: this is due in about 3 hours. A quick win closes it out."},
        {"title": "3 hours to go", "line": "Just a nudge - you've got about 3 hours before this is due."},
        {"title": "Roughly 3 hours left", "line": "Keeping this on your radar: about 3 hours until the deadline."},
    ],
    "2h": [
        {"title": "2 hours left", "line": "Two hours to the deadline. If you're close, keep going - you've got this."},
        {"title": "Heads up - 2 hours to go", "line": "The deadline is in about 2 hours. Anything blocking you?"},
        {"title": "T-2 hours", "line": "About 2 hours left. If you need more time, tap Counter-Propose on the task."},
    ],
    "30min": [
        {"title": "You're almost out of time", "line": "Only 30 minutes left. Wrap it up if you can - or propose a new time."},
        {"title": "Final 30 minutes", "line": "Deadline is 30 minutes away. Now's the moment to close this out."},
        {"title": "Half an hour to go", "line": "30 minutes remaining. If it's done, mark complete; if not, let the requester know."},
    ],
    "overdue": [
        {"title": "This task is now overdue", "line": "The deadline has passed. Please close it out or update the requester with a new plan."},
        {"title": "Still open - please close it out", "line": "This one's overdue. Even a quick status update helps."},
        {"title": "Overdue - quick check-in", "line": "It's past due. If it's done, mark it complete. If not, propose a new deadline."},
        {"title": "This is overdue", "line": "The task blew past its due time. Please prioritize it or renegotiate."},
    ],
    "no_response": [
        {"title": "Awaiting your response", "line": "This task is still waiting for you to accept or decline. Even a quick reply keeps things moving."},
        {"title": "Have you seen this task?", "line": "It's been assigned to you but not yet acted on. Please accept, decline, or counter-propose."},
    ],
    "no_progress": [
        {"title": "No progress yet - need help?", "line": "You accepted this task but haven't updated it. Everything OK? Reply on the task or complete it."},
        {"title": "Quick check-in", "line": "The deadline's approaching and there's been no update. Is anything blocking you?"},
    ],
}


def _reminder_wording(kind: str, task: dict) -> dict:
    lines = _REMINDER_LINES.get(kind) or _REMINDER_LINES["overdue"]
    idx = (task.get("last_reminder_wording_idx", -1) + 1) % len(lines)
    return lines[idx]


def render_reminder_email(user_name: str, task: dict, wording: dict, app_url: str) -> str:
    """Consistent, professional reminder email."""
    due_display = ""
    try:
        due_display = task["due_date"].replace("T", " at ").split(".")[0]
    except Exception:
        pass
    priority = task.get("priority", "")
    task_id = task.get("id", "")
    title = task.get("title", "")
    color = "#EF4444" if kind_is_overdue(wording["title"]) else "#4F46E5"

    return f"""<html><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
            <div style="background:linear-gradient(135deg,{color},{color}dd);padding:24px 28px;">
                <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1px;font-weight:600;">TSKFLOW REMINDER</p>
                <h1 style="margin:6px 0 0 0;color:white;font-size:22px;font-weight:700;">{wording['title']}</h1>
            </div>
            <div style="padding:28px;">
                <p style="margin:0 0 16px 0;color:#374151;font-size:15px;">Hi {user_name},</p>
                <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.6;">{wording['line']}</p>
                <div style="background:#F9FAFB;border-radius:12px;padding:20px;margin:18px 0;border-left:4px solid {color};">
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Task</p>
                    <p style="margin:0 0 12px 0;font-size:17px;color:#111827;font-weight:600;">{title}</p>
                    <div style="display:inline-block;background:#FEF3C7;color:#92400E;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;margin-right:8px;">{priority}</div>
                    <span style="color:#6B7280;font-size:13px;">Due: {due_display}</span>
                </div>
                <div style="text-align:center;margin:28px 0 8px 0;">
                    <a href="{app_url}/task/{task_id}" style="display:inline-block;background:{color};color:white;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600;font-size:15px;">Open task →</a>
                </div>
                <p style="margin:16px 0 0 0;color:#6B7280;font-size:13px;text-align:center;">
                    Not the right time? <a href="{app_url}/task/{task_id}" style="color:{color};">Counter-propose a new deadline</a>.
                </p>
            </div>
            <div style="padding:16px;text-align:center;background:#F9FAFB;color:#9CA3AF;font-size:11px;">
                © 2025 Tskflow — accountability, simplified. <a href="{app_url}/settings" style="color:#9CA3AF;">Manage reminders</a>
            </div>
        </div>
    </div></body></html>"""


def kind_is_overdue(title: str) -> bool:
    return "overdue" in (title or "").lower()


# ==========================================================================
# NUDGE — send preset/custom urgency emails to specific assignees (used by
# managers on the group task leaderboard).
# ==========================================================================

class NudgeRequest(BaseModel):
    assignee_ids: List[str] = []
    preset: Optional[str] = "gentle_nudge"  # gentle_nudge | urgent_reminder | final_notice | custom
    custom_subject: Optional[str] = None
    custom_message: Optional[str] = None


NUDGE_PRESETS = {
    "gentle_nudge": {
        "subject": "Quick check-in: {task_title}",
        "headline": "Just a gentle nudge",
        "body": "We're still waiting on <strong>{task_title}</strong>. When you get a moment, please jump in and close it out — even a status update helps the whole team.",
        "color": "#4F46E5",
    },
    "urgent_reminder": {
        "subject": "URGENT: {task_title} needs your attention",
        "headline": "This is urgent",
        "body": "<strong>{task_title}</strong> is well past due and blocking others. Please prioritize this today. If something's in the way, reply on the task with details.",
        "color": "#F59E0B",
    },
    "final_notice": {
        "subject": "Final notice: {task_title}",
        "headline": "Final notice",
        "body": "This is a final follow-up on <strong>{task_title}</strong>. If we don't hear from you by end of day, the task will be escalated to leadership. Please act on it now.",
        "color": "#EF4444",
    },
}


def render_nudge_email(recipient_name: str, sender_name: str, task_title: str, task_id: str, headline: str, body_html: str, color: str, app_url: str, custom_message: Optional[str] = None) -> str:
    extra = ""
    if custom_message:
        extra = f'<div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:14px 18px;border-radius:8px;margin:14px 0;color:#78350F;font-size:14px;font-style:italic;">"{custom_message}"</div>'
    return f"""<html><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
            <div style="background:linear-gradient(135deg,{color},{color}dd);padding:24px 28px;">
                <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1px;font-weight:600;">A MESSAGE FROM {sender_name.upper()}</p>
                <h1 style="margin:6px 0 0 0;color:white;font-size:22px;font-weight:700;">{headline}</h1>
            </div>
            <div style="padding:28px;">
                <p style="margin:0 0 16px 0;color:#374151;font-size:15px;">Hi {recipient_name},</p>
                <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.6;">{body_html}</p>
                {extra}
                <div style="text-align:center;margin:28px 0 8px 0;">
                    <a href="{app_url}/task/{task_id}" style="display:inline-block;background:{color};color:white;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600;font-size:15px;">Open task →</a>
                </div>
                <p style="margin:16px 0 0 0;color:#6B7280;font-size:13px;text-align:center;">
                    Stuck? Reply on the task with what's blocking you and we'll help.
                </p>
            </div>
            <div style="padding:16px;text-align:center;background:#F9FAFB;color:#9CA3AF;font-size:11px;">
                Sent via TskFlow · <a href="{app_url}/task/{task_id}" style="color:#9CA3AF;">Task link</a>
            </div>
        </div>
    </div></body></html>"""


@api_router.post("/tasks/{task_id}/nudge")
async def nudge_task_assignees(task_id: str, req: NudgeRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Send a nudge (preset or custom urgency email) to one or more assignees of a task/group.
    - If task_id is a parent (group task), nudges go to the specific child assignees.
    - If task_id is a single task, nudges go to that task's assignee (assignee_ids ignored).
    Only the creator or a same-domain user with manager privileges can nudge.
    """
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Permission: creator OR same-domain user who is a manager
    if task.get("created_by") != current_user["id"]:
        creator = await db.users.find_one({"id": task.get("created_by")}, {"_id": 0}) or {}
        if creator.get("company_domain") != current_user.get("company_domain"):
            raise HTTPException(status_code=403, detail="Not allowed to nudge on this task")

    # Determine actual assignees to nudge
    is_parent = task.get("is_parent") or task.get("parent_id") is None and False
    # Better parent check: look for children
    children = await db.tasks.find({"parent_id": task_id, "deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
    if children:
        # Filter children by requested assignee_ids
        wanted = set(req.assignee_ids or [])
        targets_children = [c for c in children if not wanted or c.get("assigned_to") in wanted]
        assignee_ids = [c["assigned_to"] for c in targets_children if c.get("assigned_to")]
        # Use the first child for task title context, but link to parent
    else:
        assignee_ids = [task.get("assigned_to")] if task.get("assigned_to") else []

    if not assignee_ids:
        raise HTTPException(status_code=400, detail="No assignees to nudge")

    # Fetch user info
    users = await db.users.find({"id": {"$in": assignee_ids}}, {"_id": 0}).to_list(500)
    users_by_id = {u["id"]: u for u in users}

    # Resolve template
    preset_key = (req.preset or "gentle_nudge").lower()
    if preset_key == "custom":
        subject = req.custom_subject or f"Message about: {task['title']}"
        headline = "A message from your team"
        body_html = req.custom_message or "Please give this task your attention."
        color = "#4F46E5"
    else:
        p = NUDGE_PRESETS.get(preset_key) or NUDGE_PRESETS["gentle_nudge"]
        subject = p["subject"].format(task_title=task["title"])
        headline = p["headline"]
        body_html = p["body"].format(task_title=task["title"])
        color = p["color"]

    now = get_pst_now()
    sent = 0
    for uid in assignee_ids:
        u = users_by_id.get(uid)
        if not u or not u.get("email"):
            continue
        # Send in-app notification
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "type": "nudge",
            "title": headline,
            "body": f"{current_user['name']}: {task['title']}",
            "task_id": task_id,
            "read": False,
            "delivered": False,
            "created_at": now.isoformat(),
        })
        email_html = render_nudge_email(
            recipient_name=u.get("name") or u["email"].split("@")[0],
            sender_name=current_user.get("name", "TskFlow"),
            task_title=task["title"],
            task_id=task_id,
            headline=headline,
            body_html=body_html,
            color=color,
            app_url=APP_BASE_URL,
            custom_message=req.custom_message if preset_key != "custom" else None,
        )
        background_tasks.add_task(send_email_notification, u["email"], subject, email_html)
        # Log on the assignee's task (child if group, else the task itself)
        log_task_id = task_id
        if children:
            child = next((c for c in children if c.get("assigned_to") == uid), None)
            if child:
                log_task_id = child["id"]
        for ch in ("in_app", "email"):
            try:
                await log_task_activity(
                    db,
                    task_id=log_task_id,
                    event_type="nudge",
                    channel=ch,
                    actor_id=current_user["id"],
                    actor_name=current_user.get("name"),
                    recipient_id=uid,
                    recipient_name=u.get("name"),
                    recipient_email=u.get("email"),
                    company_domain=current_user.get("company_domain"),
                    title=headline,
                    body=f"{current_user.get('name')}: {task.get('title')}",
                    meta={"preset": preset_key, "parent_task_id": task_id if log_task_id != task_id else None},
                    created_at=now.isoformat(),
                )
            except Exception as e:
                logging.warning(f"Failed to log nudge activity: {e}")
        sent += 1

    return {"ok": True, "sent": sent, "preset": preset_key}


async def _check_smart_reminders_deprecated():
    """Deprecated old reminder job kept for reference."""
    pass


# ==========================================================================
# BACKGROUND SCHEDULER — recurring occurrences + reminders (every 5 min)
# ==========================================================================

_scheduler_task = None

async def _scheduler_loop():
    """Runs periodic maintenance jobs while the app is up."""
    await asyncio.sleep(20)  # let the app settle
    while True:
        try:
            await _background_generate_all_recurring()
            await _check_smart_reminders()
            await _sync_all_sheet_configs()
        except Exception as e:
            logging.error(f"[scheduler] {e}")
        await asyncio.sleep(300)  # every 5 min


# --- Ensure notifications collection has an index (best-effort) ---
async def _ensure_indexes():
    try:
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
        await db.transcript_drafts.create_index("created_by")
        await db.recurring_series.create_index("created_by")
        await db.tasks.create_index("recurring_series_id")
        await db.reminder_rules.create_index("user_id")
        await db.task_activity.create_index("task_id")
        await db.task_activity.create_index([("company_domain", 1), ("created_at", -1)])
        await db.task_activity.create_index([("event_type", 1), ("created_at", -1)])
        await db.daily_metrics.create_index([("date", 1), ("person_name", 1)])
        await db.daily_metrics.create_index([("company_domain", 1), ("date", 1)])
        await db.sheet_sync_configs.create_index("owner_user_id")
    except Exception:
        pass

@app.on_event("startup")
async def _startup_indexes():
    global _scheduler_task
    await _ensure_indexes()
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(_scheduler_loop())


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    sms_consent: bool = False

    @validator('name')
    def validate_name(cls, v):
        v = (v or '').strip()
        if not v:
            raise ValueError('Name is required')
        if len(v) > 200:
            raise ValueError('Name is too long')
        return v

    @validator('phone')
    def validate_phone(cls, v):
        v = (v or '').strip()
        if not v:
            return ''
        digits = ''.join(c for c in v if c.isdigit())
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError('Please enter a valid phone number')
        return v

    @validator('message')
    def validate_message(cls, v):
        v = (v or '').strip()
        if not v:
            raise ValueError('Message is required')
        if len(v) > 5000:
            raise ValueError('Message is too long')
        return v

    @validator('sms_consent', pre=True)
    def validate_sms_consent(cls, v):
        return bool(v)


def _get_client_ip(request: HTTPRequest) -> str:
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()
    real_ip = request.headers.get('x-real-ip')
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return 'unknown'


@api_router.post("/contact")
async def submit_contact(contact: ContactRequest, http_request: HTTPRequest, background_tasks: BackgroundTasks):
    """Public contact form — stores inquiry + SMS consent proof (phone, consent, timestamp, IP)."""
    now = get_pst_now().isoformat()
    ip_address = _get_client_ip(http_request)
    sms_consent = bool(contact.sms_consent)
    sms_consent_text = (
        "By checking, you agree to receive transactional/informational SMS communications regarding your inquiry from TskFlow. "
        "Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt-out."
        if sms_consent else None
    )

    contact_doc = {
        "id": str(uuid.uuid4()),
        "name": contact.name,
        "email": contact.email.lower(),
        "phone": contact.phone or '',
        "message": contact.message,
        "sms_consent": sms_consent,
        "sms_consent_text": sms_consent_text,
        "timestamp": now,
        "ip_address": ip_address,
        "created_at": now,
    }
    await db.contact_messages.insert_one(contact_doc)

    email_content = f"""
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> {contact.name}</p>
        <p><strong>Email:</strong> {contact.email}</p>
        <p><strong>Phone:</strong> {contact.phone or '-'}</p>
        <p><strong>SMS Consent:</strong> {'Yes' if sms_consent else 'No'}</p>
        <p><strong>IP:</strong> {ip_address}</p>
        <p><strong>Timestamp:</strong> {now}</p>
        <p><strong>Message:</strong></p>
        <p>{contact.message}</p>
    """
    background_tasks.add_task(
        send_email_notification,
        "hashim@tskflow.com",
        f"Contact form: {contact.name}",
        email_content,
    )

    return {"message": "Thank you for contacting us. We'll get back to you soon."}


app.include_router(api_router)

# Health check endpoint for Kubernetes
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()