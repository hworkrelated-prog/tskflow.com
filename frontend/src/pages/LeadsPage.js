import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, Phone, Mail, Building2, Trash2, Pencil, Upload, Target, Linkedin, ChevronDown, ChevronUp } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_STYLES = {
    'To Call': 'bg-slate-100 text-slate-700 border-slate-200',
    'Called': 'bg-blue-100 text-blue-700 border-blue-200',
    'Interested': 'bg-amber-100 text-amber-800 border-amber-200',
    'Won': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Lost': 'bg-red-100 text-red-700 border-red-200'
};

const EMPTY_LEAD = { name: '', title: '', company: '', email: '', phone: '', region: '', industry: '', persona: '', linkedin: '', status: 'To Call', notes: '' };

// Minimal CSV parser supporting quoted fields
const parseCSV = (text) => {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (field !== '' || row.length > 0) { row.push(field); rows.push(row); row = []; field = ''; }
            if (c === '\r' && text[i + 1] === '\n') i++;
        } else field += c;
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
};

const LeadsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const fileRef = useRef(null);

    const [data, setData] = useState({ leads: [], counts: {}, total: 0, statuses: [] });
    const [loading, setLoading] = useState(true);
    const [icp, setIcp] = useState(null);
    const [showIcp, setShowIcp] = useState(true);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const [showLeadModal, setShowLeadModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [leadForm, setLeadForm] = useState(EMPTY_LEAD);
    const [saving, setSaving] = useState(false);

    const fetchLeads = async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.append('q', search);
            if (statusFilter !== 'all') params.append('status', statusFilter);
            const res = await axios.get(`${API}/leads?${params.toString()}`);
            setData(res.data);
        } catch (error) {
            toast.error('Failed to load leads');
        } finally {
            setLoading(false);
        }
    };

    const fetchIcp = async () => {
        try {
            const res = await axios.get(`${API}/leads/icp`);
            setIcp(res.data);
        } catch (error) { /* ignore */ }
    };

    useEffect(() => { fetchIcp(); }, []);
    useEffect(() => {
        const t = setTimeout(fetchLeads, 250);
        return () => clearTimeout(t);
    }, [search, statusFilter]);

    const openCreate = () => { setEditingId(null); setLeadForm(EMPTY_LEAD); setShowLeadModal(true); };
    const openEdit = (lead) => { setEditingId(lead.id); setLeadForm({ ...EMPTY_LEAD, ...lead }); setShowLeadModal(true); };

    const handleSave = async () => {
        if (!leadForm.name.trim()) { toast.error('Lead name is required'); return; }
        setSaving(true);
        try {
            if (editingId) {
                await axios.put(`${API}/leads/${editingId}`, leadForm);
                toast.success('Lead updated');
            } else {
                await axios.post(`${API}/leads`, leadForm);
                toast.success('Lead added');
            }
            setShowLeadModal(false);
            fetchLeads();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save lead'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API}/leads/${id}`);
            toast.success('Lead removed');
            fetchLeads();
        } catch (error) {
            toast.error('Failed to delete lead');
        }
    };

    const updateStatus = async (lead, status) => {
        try {
            await axios.put(`${API}/leads/${lead.id}`, { status });
            fetchLeads();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const rows = parseCSV(text);
            if (rows.length < 2) { toast.error('CSV needs a header row and at least one lead'); return; }
            const header = rows[0].map(h => h.trim().toLowerCase());
            const idx = (name) => header.indexOf(name);
            const leads = rows.slice(1).map(r => ({
                name: r[idx('name')] || '',
                title: r[idx('title')] || '',
                company: r[idx('company')] || '',
                email: r[idx('email')] || '',
                phone: r[idx('phone')] || '',
                region: r[idx('region')] || '',
                industry: r[idx('industry')] || '',
                persona: r[idx('persona')] || '',
                linkedin: r[idx('linkedin')] || '',
                status: r[idx('status')] || 'To Call',
                notes: r[idx('notes')] || ''
            })).filter(l => l.name.trim());
            if (leads.length === 0) { toast.error('No valid rows found. Ensure a "name" column exists.'); return; }
            const res = await axios.post(`${API}/leads/import`, { leads });
            toast.success(`Imported ${res.data.imported} lead(s)`);
            fetchLeads();
        } catch (error) {
            toast.error('Failed to import CSV');
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const statuses = data.statuses?.length ? data.statuses : ['To Call', 'Called', 'Interested', 'Won', 'Lost'];

    return (
        <div data-testid="leads-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <header className="sticky top-0 z-40 glass-header border-b">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button data-testid="leads-back-button" variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                <Target className="w-6 h-6 text-indigo-600" /> Prospecting
                            </h1>
                            <p className="text-sm text-muted-foreground">Your live repository of people to sell Tskflow to</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" data-testid="csv-import-input" />
                        <Button data-testid="import-csv-button" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full gap-2">
                            <Upload className="w-4 h-4" /> Import CSV
                        </Button>
                        <Button data-testid="add-lead-button" onClick={openCreate} className="rounded-full gap-2">
                            <Plus className="w-4 h-4" /> Add Lead
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                {/* ICP Guide */}
                {icp && (
                    <Card className="mb-6 border-2 border-indigo-100 rounded-2xl overflow-hidden">
                        <button data-testid="toggle-icp" onClick={() => setShowIcp(!showIcp)} className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 transition-colors">
                            <div className="flex items-center gap-2 text-left">
                                <Target className="w-5 h-5 text-indigo-600" />
                                <div>
                                    <p className="font-semibold">Who to target (Ideal Customer Profile)</p>
                                    <p className="text-xs text-muted-foreground">Personas, industries & where to find them in the US & Canada</p>
                                </div>
                            </div>
                            {showIcp ? <ChevronUp className="w-5 h-5 text-indigo-600" /> : <ChevronDown className="w-5 h-5 text-indigo-600" />}
                        </button>
                        <AnimatePresence>
                            {showIcp && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <CardContent className="grid md:grid-cols-2 gap-6 pt-5">
                                        <div>
                                            <p className="text-sm font-semibold mb-2 text-indigo-700">Best-fit personas</p>
                                            <ul className="space-y-2">
                                                {icp.personas.map((p) => (
                                                    <li key={p.title} className="text-sm">
                                                        <span className="font-medium">{p.title}</span>
                                                        <span className="text-muted-foreground"> — {p.why}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm font-semibold mb-2 text-indigo-700">Industries</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {icp.industries.map((i) => <Badge key={i} variant="outline" className="rounded-full font-normal">{i}</Badge>)}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold mb-2 text-indigo-700">Regions (US & Canada)</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {icp.regions.map((r) => <Badge key={r} variant="outline" className="rounded-full font-normal">{r}</Badge>)}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold mb-2 text-indigo-700">Search strings to copy</p>
                                                <div className="space-y-1">
                                                    {icp.search_queries.map((q) => (
                                                        <code key={q} className="block text-xs bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-700">{q}</code>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold mb-2 text-indigo-700">Where to find them</p>
                                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                                                    {icp.where_to_find.map((w) => <li key={w}>{w}</li>)}
                                                </ul>
                                            </div>
                                        </div>
                                    </CardContent>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>
                )}

                {/* Pipeline counts */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                    <button onClick={() => setStatusFilter('all')} data-testid="filter-all" className={`p-3 rounded-xl border text-left transition-all ${statusFilter === 'all' ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                        <p className="text-2xl font-bold">{data.total || 0}</p>
                        <p className="text-xs text-muted-foreground">All leads</p>
                    </button>
                    {statuses.map((s) => (
                        <button key={s} onClick={() => setStatusFilter(s)} data-testid={`filter-${s.replace(/\s+/g, '-').toLowerCase()}`} className={`p-3 rounded-xl border text-left transition-all ${statusFilter === s ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                            <p className="text-2xl font-bold">{data.counts?.[s] || 0}</p>
                            <p className="text-xs text-muted-foreground">{s}</p>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative mb-5 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input data-testid="leads-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, company, title, industry..." className="rounded-full pl-9" />
                </div>

                {/* Leads list */}
                {loading ? (
                    <p className="text-muted-foreground py-12 text-center">Loading leads...</p>
                ) : data.leads.length === 0 ? (
                    <Card className="rounded-2xl border-dashed border-2">
                        <CardContent className="py-16 text-center">
                            <Target className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
                            <p className="font-semibold mb-1">No leads yet</p>
                            <p className="text-sm text-muted-foreground mb-4">Add your first prospect or import a CSV from LinkedIn / Apollo to start your repository.</p>
                            <div className="flex items-center justify-center gap-2">
                                <Button onClick={openCreate} className="rounded-full gap-2"><Plus className="w-4 h-4" /> Add Lead</Button>
                                <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full gap-2"><Upload className="w-4 h-4" /> Import CSV</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {data.leads.map((lead) => (
                            <motion.div key={lead.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} data-testid={`lead-row-${lead.id}`}>
                                <Card className="rounded-2xl hover:shadow-md transition-shadow">
                                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-semibold truncate">{lead.name}</p>
                                                {lead.title && <span className="text-sm text-muted-foreground">· {lead.title}</span>}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 flex-wrap text-sm text-muted-foreground">
                                                {lead.company && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{lead.company}</span>}
                                                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{lead.phone}</span>}
                                                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{lead.email}</span>}
                                                {lead.linkedin && <a href={lead.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:underline"><Linkedin className="w-3.5 h-3.5" />Profile</a>}
                                            </div>
                                            {(lead.region || lead.industry || lead.persona) && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {lead.region && <Badge variant="outline" className="rounded-full font-normal text-xs">{lead.region}</Badge>}
                                                    {lead.industry && <Badge variant="outline" className="rounded-full font-normal text-xs">{lead.industry}</Badge>}
                                                    {lead.persona && <Badge variant="outline" className="rounded-full font-normal text-xs">{lead.persona}</Badge>}
                                                </div>
                                            )}
                                            {lead.notes && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{lead.notes}</p>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Select value={lead.status} onValueChange={(v) => updateStatus(lead, v)}>
                                                <SelectTrigger data-testid={`lead-status-${lead.id}`} className={`rounded-full h-8 w-[130px] border ${STATUS_STYLES[lead.status] || ''}`}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Button data-testid={`edit-lead-${lead.id}`} variant="ghost" size="icon" onClick={() => openEdit(lead)} className="rounded-full"><Pencil className="w-4 h-4" /></Button>
                                            <Button data-testid={`delete-lead-${lead.id}`} variant="ghost" size="icon" onClick={() => handleDelete(lead.id)} className="rounded-full text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>

            {/* Add / Edit Lead modal */}
            <Dialog open={showLeadModal} onOpenChange={setShowLeadModal}>
                <DialogContent className="rounded-2xl max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>{editingId ? 'Edit Lead' : 'Add Lead'}</DialogTitle>
                        <DialogDescription>Track a prospect and their progress through your pipeline.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Name *</Label>
                                <Input data-testid="lead-name-input" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} placeholder="Jane Smith" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Title</Label>
                                <Input data-testid="lead-title-input" value={leadForm.title} onChange={(e) => setLeadForm({ ...leadForm, title: e.target.value })} placeholder="Operations Manager" className="rounded-xl" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Company</Label>
                                <Input data-testid="lead-company-input" value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Phone</Label>
                                <Input data-testid="lead-phone-input" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="+1 ..." className="rounded-xl" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Email</Label>
                                <Input data-testid="lead-email-input" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>LinkedIn URL</Label>
                                <Input data-testid="lead-linkedin-input" value={leadForm.linkedin} onChange={(e) => setLeadForm({ ...leadForm, linkedin: e.target.value })} className="rounded-xl" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Region</Label>
                                <Input data-testid="lead-region-input" value={leadForm.region} onChange={(e) => setLeadForm({ ...leadForm, region: e.target.value })} placeholder="Toronto, CA" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Industry</Label>
                                <Input data-testid="lead-industry-input" value={leadForm.industry} onChange={(e) => setLeadForm({ ...leadForm, industry: e.target.value })} placeholder="SaaS" className="rounded-xl" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Persona</Label>
                                <Input data-testid="lead-persona-input" value={leadForm.persona} onChange={(e) => setLeadForm({ ...leadForm, persona: e.target.value })} placeholder="Team Lead" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={leadForm.status} onValueChange={(v) => setLeadForm({ ...leadForm, status: v })}>
                                    <SelectTrigger data-testid="lead-status-select" className="rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {['To Call', 'Called', 'Interested', 'Won', 'Lost'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Notes</Label>
                            <Textarea data-testid="lead-notes-input" value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} rows={3} placeholder="Pitch angle, pain points, next step..." className="rounded-xl" />
                        </div>
                        <Button data-testid="save-lead-button" onClick={handleSave} disabled={saving} className="w-full rounded-full">
                            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Lead'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default LeadsPage;
