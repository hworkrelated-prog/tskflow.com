from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Request as HTTPRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import pytz
import random
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    subscription_tier: str
    email_verified: bool

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
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    sender_email = os.getenv('SENDER_EMAIL')
    
    if not sendgrid_key or not sender_email:
        logging.warning("SendGrid not configured, skipping email")
        return
    
    try:
        message = Mail(
            from_email=sender_email,
            to_emails=to_email,
            subject=subject,
            html_content=content
        )
        sg = SendGridAPIClient(sendgrid_key)
        sg.send(message)
        logging.info(f"Email sent to {to_email}")
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")

# Auth Routes
@api_router.post("/auth/register", response_model=dict)
async def register(user: UserCreate, background_tasks: BackgroundTasks):
    # Check if email already exists
    existing = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Generate verification code
    verification_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Extract company domain
    company_domain = user.email.split('@')[1]
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "password_hash": get_password_hash(user.password),
        "subscription_tier": "free",
        "company_domain": company_domain,
        "email_verified": False,
        "verification_code": verification_code,
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
        email_verified=current_user["email_verified"]
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
    
    # Get assigned user
    if task.assigned_to == "self":
        assigned_user = current_user
        assigned_to_id = current_user["id"]
    else:
        assigned_user = await db.users.find_one({"id": task.assigned_to}, {"_id": 0})
        if not assigned_user:
            raise HTTPException(status_code=404, detail="Assigned user not found")
        
        # For Teams tier, enforce domain restriction
        if current_user["subscription_tier"] == "teams":
            if assigned_user["company_domain"] != current_user["company_domain"]:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Teams plan: Can only assign tasks to users from your company domain ({current_user['company_domain']})"
                )
        
        assigned_to_id = task.assigned_to
    
    task_id = str(uuid.uuid4())
    task_doc = {
        "id": task_id,
        "title": task.title,
        "description": task.description,
        "assigned_to": assigned_to_id,
        "created_by": current_user["id"],
        "due_date": task.due_date,
        "status": "Pending",
        "priority": task.priority,
        "category": task.category,
        "created_at": get_pst_now().isoformat(),
        "accepted_at": None,
        "completed_at": None,
        "reason_for_decline": None,
        "counter_proposal_message": None,
        "proposed_due_date": None
    }
    
    await db.tasks.insert_one(task_doc)
    
    # Send email notification if assigning to others
    if assigned_to_id != current_user["id"]:
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
        assigned_to_name=assigned_user["name"],
        created_by=current_user["id"],
        created_by_name=current_user["name"],
        due_date=task.due_date,
        status="Pending",
        priority=task.priority,
        category=task.category,
        created_at=task_doc["created_at"]
    )

@api_router.get("/dashboard", response_model=TaskHubDashboard)
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    # For Teams tier, only show tasks within company domain
    if current_user["subscription_tier"] == "teams":
        # Get all users from same domain
        domain_users = await db.users.find(
            {"company_domain": current_user["company_domain"]}, 
            {"_id": 0}
        ).to_list(1000)
        domain_user_ids = [u["id"] for u in domain_users]
        
        # Filter tasks to only those involving domain users
        all_tasks = await db.tasks.find({
            "$or": [
                {"assigned_to": {"$in": domain_user_ids}},
                {"created_by": {"$in": domain_user_ids}}
            ]
        }, {"_id": 0}).to_list(1000)
    else:
        all_tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    
    assigned_to_me = []
    self_assigned = []
    assigned_by_me = []
    
    for task in all_tasks:
        # Enrich with user names
        assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        created_user = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
        
        task_resp = TaskResponse(
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

@api_router.post("/analytics", response_model=AnalyticsResponse)
async def get_analytics(query: AnalyticsQuery, current_user: dict = Depends(get_current_user)):
    start = datetime.fromisoformat(query.start_date)
    end = datetime.fromisoformat(query.end_date)
    
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    
    # Filter by date range
    filtered_tasks = []
    for task in tasks:
        created_date = datetime.fromisoformat(task["created_at"])
        if start <= created_date <= end:
            filtered_tasks.append(task)
    
    # Calculate metrics
    assigned_to_others = [t for t in filtered_tasks if t["created_by"] == current_user["id"] and t["assigned_to"] != current_user["id"]]
    assigned_to_self = [t for t in filtered_tasks if t["created_by"] == current_user["id"] and t["assigned_to"] == current_user["id"]]
    received_from_others = [t for t in filtered_tasks if t["assigned_to"] == current_user["id"] and t["created_by"] != current_user["id"]]
    completed = [t for t in filtered_tasks if t["status"] == "Completed" and (t["assigned_to"] == current_user["id"] or t["created_by"] == current_user["id"])]
    
    # Breakdown by assignee
    assignee_breakdown = {}
    for task in assigned_to_others:
        assignee_id = task["assigned_to"]
        if assignee_id not in assignee_breakdown:
            user = await db.users.find_one({"id": assignee_id}, {"_id": 0})
            assignee_breakdown[assignee_id] = {"name": user["name"] if user else "Unknown", "count": 0}
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
    # For Teams tier, only show users from same company domain
    if current_user["subscription_tier"] == "teams":
        users = await db.users.find(
            {"company_domain": current_user["company_domain"]}, 
            {"_id": 0, "password_hash": 0, "verification_code": 0}
        ).to_list(1000)
    else:
        # Free and Pro can see all users
        users = await db.users.find({}, {"_id": 0, "password_hash": 0, "verification_code": 0}).to_list(1000)
    return users

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
        await db.users.update_one(
            {"id": transaction["user_id"]},
            {"$set": {"subscription_tier": package}}
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
                await db.users.update_one(
                    {"id": metadata["user_id"]},
                    {"$set": {"subscription_tier": metadata["package"]}}
                )
                
                logging.info(f"Webhook processed: {metadata['user_email']} -> {metadata['package']}")
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

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