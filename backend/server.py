from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Request as HTTPRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
            "from": "Task Hub <notifications@notifications.unbiassly.com>",
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
    
    # Determine subscription tier
    if team_owner:
        # Auto-enroll in team if team owner exists
        subscription_tier = "teams"
        is_team_owner = False
        team_owner_email = team_owner["email"]
    else:
        # New user, starts on free
        subscription_tier = "free"
        is_team_owner = False
        team_owner_email = None
    
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
        "last_active": get_pst_now().isoformat(),
        "created_at": get_pst_now().isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Always send verification email via Resend
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
    email_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Welcome to tskbox</h1>
                <p style="color: rgba(255,255,255,0.9); margin-top: 10px;">Your task management journey begins here</p>
            </div>
            <div style="padding: 40px 30px; background: white;">
                <p style="font-size: 16px; color: #374151;">Hi {user.name},</p>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Thank you for registering with tskbox. To complete your account setup, please use the verification code below:
                </p>
                <div style="background: #F3F4F6; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                    <p style="font-size: 14px; color: #6B7280; margin: 0 0 10px 0;">Your Verification Code</p>
                    <p style="font-size: 36px; font-weight: 700; color: #4F46E5; margin: 0; letter-spacing: 4px;">{verification_code}</p>
                </div>
                <p style="font-size: 14px; color: #6B7280; line-height: 1.6;">
                    This code will expire in 24 hours. If you didn't create an account with tskbox, please disregard this email.
                </p>
                <div style="margin-top: 30px; text-align: center;">
                    <a href="{app_url}/verify-email" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                        Verify Your Account
                    </a>
                </div>
            </div>
            <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
                    © 2025 tskbox. All rights reserved.
                </p>
            </div>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, user.email, "Verify your tskbox account", email_content)
    
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
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
    email_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">tskbox</h1>
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
                <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 tskbox. All rights reserved.</p>
            </div>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, email, "Your tskbox Verification Code", email_content)
    return {"message": "Verification code sent to your email"}

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email}, {"_id": 0})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
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
            email_verified=db_user["email_verified"]
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
        team_owner_email=current_user.get("team_owner_email")
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
    
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    sender_email = os.getenv('SENDER_EMAIL')
    
    if sendgrid_key and sender_email:
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
    # Check task limits for free tier
    if current_user["subscription_tier"] == "free":
        active_tasks = await db.tasks.count_documents({
            "created_by": current_user["id"],
            "status": {"$ne": "Completed"}
        })
        if active_tasks >= 5:
            raise HTTPException(status_code=403, detail="Free tier limit reached. Upgrade to Pro or Teams for unlimited tasks.")
    
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
            assigned_user = {"name": f"Invited: {assigned_to_email}", "email": assigned_to_email}
            assigned_to_id = f"email_{assigned_to_email}"
            is_self_assigned = False
            
            # Send invitation email
            email_content = f"""
            <html>
                <body>
                    <h2>You've been assigned a task on Task Hub!</h2>
                    <p><strong>{current_user['name']}</strong> has assigned you a task:</p>
                    <p><strong>Task:</strong> {task.title}</p>
                    <p><strong>Priority:</strong> {task.priority}</p>
                    <p><strong>Due:</strong> {task.due_date}</p>
                    <p>Create your account to view details and respond:</p>
                    <p><a href="{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/register">Create Account</a></p>
                </body>
            </html>
            """
            background_tasks.add_task(send_email_notification, assigned_to_email, f"New Task from {current_user['name']}", email_content)
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
    
    task_id = str(uuid.uuid4())
    invite_token = str(uuid.uuid4())[:8]
    
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
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
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
                        <a href="{app_url}/dashboard" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            View Task in tskbox
                        </a>
                    </div>
                    <p style="font-size: 13px; color: #9CA3AF; margin-top: 25px; text-align: center;">
                        You can accept, decline, or propose a new deadline directly from tskbox.
                    </p>
                </div>
                <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                    <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
                        © 2025 tskbox. All rights reserved.
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
    # Check task limit for free users
    if current_user["subscription_tier"] == "free":
        existing_tasks = await db.tasks.count_documents({
            "created_by": current_user["id"],
            "status": {"$nin": ["Completed", "Declined"]}
        })
        if existing_tasks + len(task.assigned_to) > 5:
            raise HTTPException(
                status_code=403, 
                detail=f"Free tier limited to 5 active tasks. You have {existing_tasks} active tasks and are trying to create {len(task.assigned_to)} more. Upgrade to Pro for unlimited tasks."
            )
    
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
            "accepted_at": accepted_at
        }
        
        await db.tasks.insert_one(task_doc)
        
        # Send professional email notification if assigning to others
        app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
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
                                <a href="{app_url}/dashboard" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                    View Task in tskbox
                                </a>
                            </div>
                        </div>
                        <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 tskbox. All rights reserved.</p>
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
    task_limit_reached = current_user["subscription_tier"] == "free" and active_tasks >= 5
    
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
async def accept_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "Accepted", "accepted_at": get_pst_now().isoformat()}}
    )
    
    return {"message": "Task accepted"}

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
    
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
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

# Deleted tasks endpoints
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
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
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
                            <a href="{app_url}/dashboard" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                                View Updated Task
                            </a>
                        </div>
                    </div>
                    <div style="padding: 20px 30px; text-align: center; background: #F9FAFB;">
                        <p style="font-size: 12px; color: #9CA3AF; margin: 0;">© 2025 tskbox. All rights reserved.</p>
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
    "pro": {"price": 9.00, "name": "Pro Plan"},
    "teams": {"price": 12.00, "name": "Teams Plan"}
}

@api_router.post("/payments/create-checkout")
async def create_checkout(checkout_req: CheckoutRequest, http_request: HTTPRequest, current_user: dict = Depends(get_current_user)):
    # Validate package
    if checkout_req.package not in SUBSCRIPTION_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid subscription package")
    
    package = SUBSCRIPTION_PACKAGES[checkout_req.package]
    
    # Initialize Stripe
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Payment system not configured")
    
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    
    # Create checkout session
    success_url = f"{checkout_req.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout_req.origin_url}/settings"
    
    checkout_request = CheckoutSessionRequest(
        amount=package["price"],
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "package": checkout_req.package
        }
    )
    
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Store transaction in database
    transaction_doc = {
        "session_id": session.session_id,
        "user_id": current_user["id"],
        "user_email": current_user["email"],
        "package": checkout_req.package,
        "amount": package["price"],
        "currency": "usd",
        "payment_status": "pending",
        "created_at": get_pst_now().isoformat()
    }
    await db.payment_transactions.insert_one(transaction_doc)
    
    return {"url": session.url, "session_id": session.session_id}

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
    app_url = os.getenv('APP_URL', 'https://tskbox-manager.preview.emergentagent.com')
    
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
            <h2>You've been invited to join {current_user['company_domain']} on Task Hub!</h2>
            <p>{current_user['name']} ({current_user['email']}) has invited you to join their team workspace.</p>
            <p><strong>What's included:</strong></p>
            <ul>
                <li>Teams subscription (Unlimited tasks)</li>
                <li>Collaborate with your company</li>
                <li>No payment required</li>
            </ul>
            <p>Click the link below to create your account and start working:</p>
            <p><a href="{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/register">Join Team</a></p>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, invite.email, f"Join {current_user['company_domain']} on Task Hub", email_content)
    
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

# Include router
app.include_router(api_router)

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