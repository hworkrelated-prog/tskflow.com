from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import pytz

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
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours
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
    admin_code: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    company_domain: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TaskCreate(BaseModel):
    title: str
    description: str
    assigned_to: str  # user id
    due_date: str  # ISO datetime string
    priority: str  # Low, Medium, High
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

class ManagerDashboard(BaseModel):
    today_tasks: List[TaskResponse]
    overdue_tasks: List[TaskResponse]
    upcoming_tasks: List[TaskResponse]
    counts: dict

class AdminOverview(BaseModel):
    total_tasks: int
    completed_today: int
    overdue_tasks: int
    acceptance_rate: float
    recent_tasks: List[TaskResponse]

class PerformanceData(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    tasks_assigned: int
    tasks_accepted: int
    tasks_completed: int
    avg_completion_time_hours: Optional[float]
    decline_rate: float
    counter_proposal_count: int

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
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user: UserCreate):
    # Check if email already exists
    existing = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Extract domain from email
    domain = user.email.split('@')[1]
    
    # Check if admin code is provided
    if user.admin_code and user.admin_code == "ADMIN2025":
        # Valid admin code - create as admin
        role = "admin"
        
        # Check if there's already an admin to get company domain
        existing_admin = await db.users.find_one({"role": "admin"}, {"_id": 0})
        if existing_admin:
            # Must match existing company domain
            if domain != existing_admin["company_domain"]:
                raise HTTPException(status_code=400, detail=f"Email must be from {existing_admin['company_domain']} domain")
            company_domain = existing_admin["company_domain"]
        else:
            # First admin - set company domain
            company_domain = domain
    else:
        # No admin code - create as manager
        # Must have an existing admin to get company domain
        existing_admin = await db.users.find_one({"role": "admin"}, {"_id": 0})
        if not existing_admin:
            raise HTTPException(status_code=400, detail="Please register first admin with admin code ADMIN2025")
        
        if domain != existing_admin["company_domain"]:
            raise HTTPException(status_code=400, detail=f"Email must be from {existing_admin['company_domain']} domain")
        
        role = "manager"
        company_domain = existing_admin["company_domain"]
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "password_hash": get_password_hash(user.password),
        "role": role,
        "company_domain": company_domain,
        "created_at": get_pst_now().isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user_id,
            name=user.name,
            email=user.email,
            role=role,
            company_domain=company_domain
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email}, {"_id": 0})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token(data={"sub": db_user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=db_user["id"],
            name=db_user["name"],
            email=db_user["email"],
            role=db_user["role"],
            company_domain=db_user["company_domain"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        company_domain=current_user["company_domain"]
    )

# Task Routes
@api_router.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create tasks")
    
    # Get assigned user
    assigned_user = await db.users.find_one({"id": task.assigned_to}, {"_id": 0})
    if not assigned_user:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    
    task_id = str(uuid.uuid4())
    task_doc = {
        "id": task_id,
        "title": task.title,
        "description": task.description,
        "assigned_to": task.assigned_to,
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
    
    # Send email notification
    email_content = f"""
    <html>
        <body>
            <h2>New Task Assigned</h2>
            <p><strong>Task:</strong> {task.title}</p>
            <p><strong>Priority:</strong> {task.priority}</p>
            <p><strong>Due Date:</strong> {task.due_date}</p>
            <p><strong>Description:</strong> {task.description}</p>
            <p>Please log in to accept or respond to this task.</p>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_notification, assigned_user["email"], "New Task Assigned", email_content)
    
    return TaskResponse(
        id=task_id,
        title=task.title,
        description=task.description,
        assigned_to=task.assigned_to,
        assigned_to_name=assigned_user["name"],
        created_by=current_user["id"],
        created_by_name=current_user["name"],
        due_date=task.due_date,
        status="Pending",
        priority=task.priority,
        category=task.category,
        created_at=task_doc["created_at"],
        accepted_at=None,
        completed_at=None
    )

@api_router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    else:
        tasks = await db.tasks.find({"assigned_to": current_user["id"]}, {"_id": 0}).to_list(1000)
    
    # Enrich with user names
    result = []
    for task in tasks:
        assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        created_user = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
        
        result.append(TaskResponse(
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
        ))
    
    return result

@api_router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check permissions
    if current_user["role"] != "admin" and task["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
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
        raise HTTPException(status_code=400, detail="Reason required for declining")
    
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
    
    # Send email to admin
    admin = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    if admin:
        email_content = f"""
        <html>
            <body>
                <h2>Task Counter-Proposal</h2>
                <p><strong>Task:</strong> {task['title']}</p>
                <p><strong>Manager:</strong> {current_user['name']}</p>
                <p><strong>Proposed Due Date:</strong> {action.proposed_due_date}</p>
                <p><strong>Message:</strong> {action.message or 'No message provided'}</p>
                <p>Please log in to approve or reject this proposal.</p>
            </body>
        </html>
        """
        background_tasks.add_task(send_email_notification, admin["email"], "Task Counter-Proposal", email_content)
    
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

# Dashboard Routes
@api_router.get("/dashboard/manager", response_model=ManagerDashboard)
async def manager_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Manager access only")
    
    tasks = await db.tasks.find({"assigned_to": current_user["id"]}, {"_id": 0}).to_list(1000)
    
    now = get_pst_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    today_tasks = []
    overdue_tasks = []
    upcoming_tasks = []
    
    for task in tasks:
        due = to_pst(task["due_date"])
        
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
        
        if task["status"] != "Completed":
            if due < now:
                overdue_tasks.append(task_resp)
            elif today_start <= due <= today_end:
                today_tasks.append(task_resp)
            elif due > today_end:
                upcoming_tasks.append(task_resp)
    
    counts = {
        "due_today": len(today_tasks),
        "completed_today": len([t for t in tasks if t.get("completed_at") and to_pst(t["completed_at"]).date() == now.date()]),
        "pending_acceptance": len([t for t in tasks if t["status"] == "Pending"])
    }
    
    return ManagerDashboard(
        today_tasks=today_tasks,
        overdue_tasks=overdue_tasks,
        upcoming_tasks=upcoming_tasks,
        counts=counts
    )

@api_router.get("/dashboard/admin", response_model=AdminOverview)
async def admin_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    now = get_pst_now()
    
    total_tasks = len(tasks)
    completed_today = len([t for t in tasks if t.get("completed_at") and to_pst(t["completed_at"]).date() == now.date()])
    overdue_tasks = len([t for t in tasks if t["status"] != "Completed" and to_pst(t["due_date"]) < now])
    
    accepted_tasks = len([t for t in tasks if t["status"] in ["Accepted", "Completed"]])
    acceptance_rate = (accepted_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    # Recent tasks
    recent = sorted(tasks, key=lambda x: x["created_at"], reverse=True)[:10]
    recent_tasks = []
    for task in recent:
        assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
        created_user = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
        
        recent_tasks.append(TaskResponse(
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
            completed_at=task.get("completed_at")
        ))
    
    return AdminOverview(
        total_tasks=total_tasks,
        completed_today=completed_today,
        overdue_tasks=overdue_tasks,
        acceptance_rate=round(acceptance_rate, 1),
        recent_tasks=recent_tasks
    )

@api_router.get("/dashboard/admin/performance", response_model=List[PerformanceData])
async def admin_performance(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    
    managers = await db.users.find({"role": "manager"}, {"_id": 0}).to_list(1000)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    
    performance = []
    for manager in managers:
        manager_tasks = [t for t in tasks if t["assigned_to"] == manager["id"]]
        tasks_assigned = len(manager_tasks)
        tasks_accepted = len([t for t in manager_tasks if t["status"] in ["Accepted", "Completed"]])
        tasks_completed = len([t for t in manager_tasks if t["status"] == "Completed"])
        declined = len([t for t in manager_tasks if t["status"] == "Declined"])
        counter_proposals = len([t for t in manager_tasks if t["status"] == "Counter-Proposed"])
        
        # Calculate avg completion time
        completion_times = []
        for task in manager_tasks:
            if task["status"] == "Completed" and task.get("accepted_at") and task.get("completed_at"):
                accepted = to_pst(task["accepted_at"])
                completed = to_pst(task["completed_at"])
                hours = (completed - accepted).total_seconds() / 3600
                completion_times.append(hours)
        
        avg_time = sum(completion_times) / len(completion_times) if completion_times else None
        decline_rate = (declined / tasks_assigned * 100) if tasks_assigned > 0 else 0
        
        performance.append(PerformanceData(
            user_id=manager["id"],
            user_name=manager["name"],
            user_email=manager["email"],
            tasks_assigned=tasks_assigned,
            tasks_accepted=tasks_accepted,
            tasks_completed=tasks_completed,
            avg_completion_time_hours=round(avg_time, 1) if avg_time else None,
            decline_rate=round(decline_rate, 1),
            counter_proposal_count=counter_proposals
        ))
    
    return performance

@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    
    users = await db.users.find({"role": "manager"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

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