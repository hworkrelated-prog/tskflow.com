# tskbox Configuration Guide

## Stripe Configuration

### Location
- **File**: `/app/backend/.env`
- **Variable**: `STRIPE_SECRET_KEY`

### Current Setup
The app uses emergentintegrations Stripe module which reads the key from environment.

### Switching Between Test and Live Keys

**Test Key** (prefix: `sk_test_`)
```
STRIPE_SECRET_KEY=sk_test_...
```

**Live Key** (prefix: `sk_live_`)
```
STRIPE_SECRET_KEY=sk_live_...
```

### Safe Switching Process
1. Stop backend service
2. Update `STRIPE_SECRET_KEY` in `/app/backend/.env`
3. Restart backend: `sudo supervisorctl restart backend`
4. Verify checkout flow works

### Webhook Configuration
- Webhook secret not currently configured
- For production, add `STRIPE_WEBHOOK_SECRET` to `.env`
- Update webhook endpoint in Stripe Dashboard

---

## Landing Page Navigation

### File Location
- **File**: `/app/frontend/src/pages/LandingPage.js`

### Navigation Links (Header)
Located around line 151-154:
```jsx
<div className="hidden md:flex items-center gap-8">
    <a href="#features" className="...">Features</a>
    <a href="#pricing" className="...">Pricing</a>
    <a href="#how-it-works" className="...">How It Works</a>
</div>
```

**To add new navigation items:**
1. Add anchor link: `<a href="#section-id" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Label</a>`
2. Or external link: `<a href="https://example.com" target="_blank" rel="noopener noreferrer" className="...">Label</a>`

### Footer Links
Located at the bottom of `LandingPage.js` (search for "footer"):

**To add footer links:**
```jsx
<a href="/terms" className="text-gray-400 hover:text-white transition-colors">Terms of Service</a>
<a href="/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
<a href="https://blog.tskbox.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Blog</a>
```

### Adding New Sections
1. Create section with id: `<section id="integrations" className="py-20">...</section>`
2. Add nav link: `<a href="#integrations">Integrations</a>`
3. Follow existing section patterns for styling consistency

### External Link Patterns
```jsx
// Opens in new tab
<a href="https://external.com" target="_blank" rel="noopener noreferrer">

// Internal route (uses React Router)
<Button onClick={() => navigate('/careers')}>Careers</Button>

// Anchor scroll (same page)
<a href="#section-name">Section Name</a>
```

---

## Environment Variables Reference

### Backend (`/app/backend/.env`)
```
MONGO_URL=           # MongoDB connection string
DB_NAME=             # Database name
SECRET_KEY=          # JWT signing key
RESEND_API_KEY=      # Email service API key
SENDER_EMAIL=        # From address for emails
STRIPE_SECRET_KEY=   # Stripe API key
APP_URL=             # Public app URL for email links
```

### Frontend (`/app/frontend/.env`)
```
REACT_APP_BACKEND_URL=  # API base URL (include /api prefix handled by proxy)
```

---

## Notes on Safe Updates

1. **Never commit** `.env` files to version control
2. **Always test** payment flows in Stripe test mode first
3. **Verify email delivery** after changing RESEND_API_KEY
4. **Clear browser cache** after frontend environment changes
5. **Restart services** after any `.env` modification
