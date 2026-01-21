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

class TaskAction(BaseModel):
    reason: Optional[str] = None
    message: Optional[str] = None
    proposed_due_date: Optional[str] = None

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

class AnalyticsResponse(BaseModel):
    assigned_to_others_count: int
    assigned_to_self_count: int
    received_from_others_count: int
    completed_count: int
    task_breakdown: dict

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
    
    # Send verification email
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    sender_email = os.getenv('SENDER_EMAIL')
    
    if sendgrid_key and sender_email:
        email_content = f"""
        <html>
            <body>
                <h2>Welcome to Task Hub!</h2>
                <p>Your verification code is: <strong>{verification_code}</strong></p>
                <p>Please enter this code to verify your email and start using Task Hub.</p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, user.email, "Verify your Task Hub account", email_content)
        return {"message": "Registration successful. Verification code sent to email.", "verification_code": None, "user_id": user_id}
    else:
        # Development mode - return code
        return {"message": "Registration successful. Use this verification code.", "verification_code": verification_code, "user_id": user_id}

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
    
    # Send email
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    sender_email = os.getenv('SENDER_EMAIL')
    
    if sendgrid_key and sender_email:
        email_content = f"""
        <html>
            <body>
                <h2>Email Verification</h2>
                <p>Your new verification code is: <strong>{verification_code}</strong></p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, email, "Task Hub Verification Code", email_content)
        return {"message": "Verification code sent", "verification_code": None}
    else:
        return {"message": "Verification code generated", "verification_code": verification_code}

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
        "created_at": get_pst_now().isoformat(),
        "accepted_at": accepted_at,
        "completed_at": None,
        "reason_for_decline": None,
        "counter_proposal_message": None,
        "proposed_due_date": None
    }
    
    await db.tasks.insert_one(task_doc)
    
    # Send email notification if assigning to others and they're registered
    if not is_self_assigned and assigned_to_id and not assigned_to_id.startswith("email_"):
        email_content = f"""
        <html>
            <body>
                <h2>New Task Assigned</h2>
                <p><strong>Task:</strong> {task.title}</p>
                <p><strong>Priority:</strong> {task.priority}</p>
                <p><strong>Due Date:</strong> {task.due_date}</p>
                <p><strong>From:</strong> {current_user['name']}</p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, assigned_user["email"], "New Task Assigned", email_content)
    
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
        accepted_at=accepted_at
    )

@api_router.get("/dashboard", response_model=TaskHubDashboard)
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    # For Teams tier, only show tasks within company domain
    if current_user["subscription_tier"] == "teams":
        # Get all users from same domain
        domain_users = await db.users.find(
            {"company_domain": current_user["company_domain"]}, 
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        domain_user_ids = [u["id"] for u in domain_users]
        user_map = {u["id"]: u["name"] for u in domain_users}
        
        # Filter tasks to only those involving domain users
        all_tasks = await db.tasks.find({
            "$or": [
                {"assigned_to": {"$in": domain_user_ids}},
                {"created_by": {"$in": domain_user_ids}}
            ]
        }, {"_id": 0}).to_list(1000)
    else:
        # Fetch only tasks relevant to current user
        all_tasks = await db.tasks.find({
            "$or": [
                {"assigned_to": current_user["id"]},
                {"created_by": current_user["id"]}
            ]
        }, {"_id": 0}).to_list(1000)
        
        # Get unique user IDs from tasks
        user_ids = set()
        for task in all_tasks:
            user_ids.add(task["assigned_to"])
            user_ids.add(task["created_by"])
        
        # Batch fetch all users
        users = await db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(len(user_ids))
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
    
    # Check task limit
    active_tasks = len([t for t in all_tasks if t["created_by"] == current_user["id"] and t["status"] != "Completed"])
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
        proposed_due_date=task.get("proposed_due_date")
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
async def complete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "Completed", "completed_at": get_pst_now().isoformat()}}
    )
    
    return {"message": "Task completed"}

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None

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
    if task["assigned_to"] != current_user["id"]:
        assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        if assignee:
            # Build change summary
            changes = []
            if task_update.title and task_update.title != task.get("title"):
                changes.append(f"Title: {task_update.title}")
            if task_update.description and task_update.description != task.get("description"):
                changes.append("Description updated")
            if task_update.due_date and task_update.due_date != task.get("due_date"):
                changes.append(f"Due date: {task_update.due_date}")
            if task_update.priority and task_update.priority != task.get("priority"):
                changes.append(f"Priority: {task_update.priority}")
            
            changes_html = "<br>".join(changes) if changes else "Task details updated"
            
            email_content = f"""
            <html>
                <body>
                    <h2>Task Updated</h2>
                    <p><strong>{current_user['name']}</strong> has updated a task assigned to you:</p>
                    <p><strong>Task:</strong> {task_update.title or task['title']}</p>
                    <p><strong>Changes:</strong><br>{changes_html}</p>
                    <p><strong>Priority:</strong> {task_update.priority or task['priority']}</p>
                    <p><strong>Due:</strong> {task_update.due_date or task['due_date']}</p>
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
    tasks = await db.tasks.find({
        "$or": [
            {"assigned_to": current_user["id"]},
            {"created_by": current_user["id"]}
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
    unique_assignee_ids = list(set([t["assigned_to"] for t in assigned_to_others]))
    
    assignee_breakdown = {}
    if unique_assignee_ids:
        assignees = await db.users.find(
            {"id": {"$in": unique_assignee_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(len(unique_assignee_ids))
        
        for assignee in assignees:
            assignee_breakdown[assignee["id"]] = {"name": assignee["name"], "count": 0}
        
        for task in assigned_to_others:
            assignee_id = task["assigned_to"]
            if assignee_id in assignee_breakdown:
                assignee_breakdown[assignee_id]["count"] += 1
    
    return AnalyticsResponse(
        assigned_to_others_count=len(assigned_to_others),
        assigned_to_self_count=len(assigned_to_self),
        received_from_others_count=len(received_from_others),
        completed_count=len(completed),
        task_breakdown=assignee_breakdown
    )

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
    stripe_key = os.getenv("STRIPE_API_KEY")
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
    stripe_key = os.getenv("STRIPE_API_KEY")
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

@api_router.post("/webhook/stripe")
async def stripe_webhook(http_request: HTTPRequest):
    stripe_key = os.getenv("STRIPE_API_KEY")
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