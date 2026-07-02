from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Request as HTTPRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, validator
from typing import List, Optional, Dict
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

# App Base URL for emails (production-safe)
APP_BASE_URL = os.environ.get('FRONTEND_URL') or os.getenv('FRONTEND_URL') or 'https://tskflow.com'

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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class EmailVerifyRequest(BaseModel):
    email: EmailStr
    verification_code: str

class TaskCreate(BaseModel):
    title: str
    description: str
    assigned_to: str
    due_date: str
    priority: str
    category: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None  # Base64 or URLs

class BulkTaskCreate(BaseModel):
    title: str
    description: str
    assigned_to: List[str]  # List of user IDs or email addresses
    due_date: str
    priority: str
    category: Optional[str] = None
    note: Optional[str] = None
    note_images: Optional[List[str]] = None

class TaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: str
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

class TaskAction(BaseModel):
    reason: Optional[str] = None
    message: Optional[str] = None
    proposed_due_date: Optional[str] = None

class TaskComplete(BaseModel):
    completion_note: Optional[str] = None
    completion_note_images: Optional[List[str]] = None

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
    
    try:
        params = {
            "from": "Tskflow <notifications@notifications.unbiassly.com>",
            "to": [to_email],
            "subject": subject,
            "html": content
        }
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent to {to_email}, id: {email.get('id') if isinstance(email, dict) else email}")
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")

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
            email_verified=True
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
            google_calendar_connected=db_user.get("google_calendar_connected", False)
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
        google_calendar_connected=current_user.get("google_calendar_connected", False)
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
        "description": task.description,
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
        "invite_token": invite_token
    }
    
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
                        <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{task.description[:300]}{'...' if len(task.description) > 300 else ''}</p>
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
        invite_token=invite_token
    )

@api_router.post("/tasks/bulk", response_model=List[TaskResponse])
async def create_bulk_tasks(task: BulkTaskCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create the same task for multiple assignees at once"""
    # Free tier: no hard limit, only soft nudges handled in frontend
    
    created_tasks = []
    
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
            "invite_token": invite_token
        }
        
        await db.tasks.insert_one(task_doc)
        
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
                                <p style="color: #6B7280; margin: 0 0 15px 0; line-height: 1.6;">{task.description[:300]}{'...' if len(task.description) > 300 else ''}</p>
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
            accepted_at=accepted_at
        ))
    
    return created_tasks

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
            assigned_to_name=user_map.get(task["assigned_to"], "Unknown"),
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
            proposed_due_date=task.get("proposed_due_date")
        )
        
        # Categorize tasks
        if task["assigned_to"] == current_user["id"] and task["created_by"] == current_user["id"]:
            self_assigned.append(task_resp)
        elif task["assigned_to"] == current_user["id"]:
            assigned_to_me.append(task_resp)
        elif task["created_by"] == current_user["id"]:
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
        assigned_to_name=assigned_user["name"] if assigned_user else "Unknown",
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
        previous_completion_images=task.get("previous_completion_images")
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
    }
    
    if is_self_assigned:
        update_data["status"] = "Completed"
        update_data["completed_at"] = get_pst_now().isoformat()
    else:
        # Set to Review Pending for non-self-assigned tasks
        update_data["status"] = "Review Pending"
        update_data["review_pending_at"] = get_pst_now().isoformat()
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    return {"message": "Task submitted for review" if not is_self_assigned else "Task completed"}

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
    
    return {"message": "Task deleted"}

@api_router.post("/tasks/bulk-delete")
async def bulk_delete_tasks(task_ids: List[str], current_user: dict = Depends(get_current_user)):
    deleted_count = 0
    for task_id in task_ids:
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if task and (task["created_by"] == current_user["id"] or task["assigned_to"] == current_user["id"]):
            await db.tasks.update_one(
                {"id": task_id},
                {"$set": {"deleted": True, "deleted_at": get_pst_now().isoformat(), "deleted_by": current_user["id"]}}
            )
            deleted_count += 1
    
    return {"message": f"{deleted_count} tasks deleted", "deleted_count": deleted_count}

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only the creator can edit the task
    if task["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can edit this task")
    
    # Build update dict with only provided fields
    update_data = {}
    if task_update.title is not None:
        update_data["title"] = task_update.title
    if task_update.description is not None:
        update_data["description"] = task_update.description
    if task_update.due_date is not None:
        update_data["due_date"] = task_update.due_date
    if task_update.priority is not None:
        update_data["priority"] = task_update.priority
    if task_update.category is not None:
        update_data["category"] = task_update.category
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_data["updated_at"] = get_pst_now().isoformat()
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # Send notification to assignee if task is assigned to someone else
    app_url = APP_BASE_URL
    if task["assigned_to"] != current_user["id"]:
        assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        if assignee:
            # Build change summary
            changes = []
            if task_update.title and task_update.title != task.get("title"):
                changes.append(f"Title changed to: {task_update.title}")
            if task_update.description and task_update.description != task.get("description"):
                changes.append("Description has been updated")
            if task_update.due_date and task_update.due_date != task.get("due_date"):
                changes.append(f"Due date changed to: {task_update.due_date.replace('T', ' at ')}")
            if task_update.priority and task_update.priority != task.get("priority"):
                changes.append(f"Priority changed to: {task_update.priority}")
            
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
        "$or": [
            {"assigned_to": current_user["id"]},
            {"created_by": current_user["id"]}
        ],
        "created_at": {
            "$gte": start.isoformat(),
            "$lte": end.isoformat()
        },
        "$or": [
            {"deleted": {"$ne": True}},  # Not deleted
            {"$and": [{"deleted": True}, {"completed_at": {"$ne": None}}]}  # Deleted but was completed first
        ]
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
            
            assignee_details.append(AssigneeBreakdown(
                name=assignee_data["name"],
                email=assignee_data["email"],
                tasks_assigned=len(assignee_tasks),
                tasks_completed=len(completed_tasks),
                tasks_pending=len(pending_tasks),
                completion_rate=completion_rate,
                avg_completion_days=avg_days
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
    theme: str  # 'light', 'dark', 'minimal'

@api_router.put("/auth/preferences")
async def update_preferences(prefs: UserPreferences, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"preferences": prefs.dict()}}
    )
    return {"message": "Preferences updated"}

@api_router.get("/auth/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    prefs = current_user.get("preferences", {"theme": "light"})
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
    """Get team members who could be added as direct reports"""
    if current_user["subscription_tier"] != "teams":
        raise HTTPException(status_code=403, detail="Teams subscription required")
    
    # Get all team members from same domain who don't already report to current user
    # and are not the current user
    potential = await db.users.find({
        "company_domain": current_user["company_domain"],
        "subscription_tier": "teams",
        "id": {"$ne": current_user["id"]},
        "$or": [
            {"reports_to": {"$ne": current_user["id"]}},
            {"reports_to": {"$exists": False}}
        ]
    }, {"_id": 0, "id": 1, "name": 1, "email": 1, "reports_to": 1}).to_list(1000)
    
    # Get current user's manager to exclude (can't add your manager as direct report)
    my_manager_id = current_user.get("reports_to")
    
    # Fetch manager names for context
    result = []
    for p in potential:
        # Skip if this is your manager (circular prevention)
        if my_manager_id and p["id"] == my_manager_id:
            continue
            
        current_manager = None
        if p.get("reports_to"):
            mgr = await db.users.find_one({"id": p["reports_to"]}, {"_id": 0, "name": 1})
            current_manager = mgr["name"] if mgr else None
        
        result.append({
            "id": p["id"],
            "name": p["name"],
            "email": p["email"],
            "current_manager": current_manager
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
            "from": "Tskflow <notifications@notifications.unbiassly.com>",
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
            "from": "Tskflow Analytics <notifications@notifications.unbiassly.com>",
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
                    "from": "Tskflow <notifications@notifications.unbiassly.com>",
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
                "from": "Tskflow <notifications@notifications.unbiassly.com>",
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
    groups = await db.user_groups.find({"owner_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return groups

@api_router.post("/groups")
async def create_group(group: GroupCreate, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    name = (group.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    # Prevent duplicate group names (case-insensitive) for this owner
    existing = await db.user_groups.find_one({
        "owner_id": current_user["id"],
        "name": {"$regex": f"^{name}$", "$options": "i"}
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A group with this name already exists")

    group_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": current_user["id"],
        "name": name,
        "emails": _clean_emails(group.emails),
        "created_at": get_pst_now().isoformat()
    }
    await db.user_groups.insert_one(group_doc)
    group_doc.pop("_id", None)
    return group_doc

@api_router.put("/groups/{group_id}")
async def update_group(group_id: str, update: GroupUpdate, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    group = await db.user_groups.find_one({"id": group_id, "owner_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    set_data = {}
    if update.name is not None:
        new_name = update.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Group name cannot be empty")
        dup = await db.user_groups.find_one({
            "owner_id": current_user["id"],
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": group_id}
        }, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail="A group with this name already exists")
        set_data["name"] = new_name
    if update.emails is not None:
        set_data["emails"] = _clean_emails(update.emails)

    if set_data:
        await db.user_groups.update_one({"id": group_id}, {"$set": set_data})

    updated = await db.user_groups.find_one({"id": group_id}, {"_id": 0})
    return updated

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    _require_paid(current_user)
    result = await db.user_groups.delete_one({"id": group_id, "owner_id": current_user["id"]})
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





# Include router
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