import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Shield, Users, Crown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminPage = () => {
    const navigate = useNavigate();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [grants, setGrants] = useState([]);
    const [newGrant, setNewGrant] = useState({ type: 'email', value: '', plan: 'pro' });

    useEffect(() => {
        const token = localStorage.getItem('admin_token');
        if (token) {
            setIsLoggedIn(true);
            fetchGrants(token);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post(`${API}/admin/login`, { password });
            localStorage.setItem('admin_token', response.data.access_token);
            setIsLoggedIn(true);
            fetchGrants(response.data.access_token);
            toast.success('Admin login successful');
        } catch (error) {
            toast.error('Invalid admin password');
        } finally {
            setLoading(false);
        }
    };

    const fetchGrants = async (token) => {
        try {
            const response = await axios.get(`${API}/admin/access-grants`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setGrants(response.data.grants || []);
        } catch (error) {
            if (error.response?.status === 401) {
                localStorage.removeItem('admin_token');
                setIsLoggedIn(false);
            }
        }
    };

    const handleAddGrant = async (e) => {
        e.preventDefault();
        if (!newGrant.value.trim()) {
            toast.error('Please enter an email or domain');
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem('admin_token');
            await axios.post(`${API}/admin/access-grants`, newGrant, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(`Access granted for ${newGrant.value}`);
            setNewGrant({ type: 'email', value: '', plan: 'pro' });
            fetchGrants(token);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to add grant');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveGrant = async (grant) => {
        if (!confirm(`Remove access for ${grant.value}? Users will be downgraded to free.`)) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('admin_token');
            await axios.delete(`${API}/admin/access-grants`, {
                headers: { Authorization: `Bearer ${token}` },
                data: { type: grant.type, value: grant.value, plan: grant.plan }
            });
            toast.success(`Access removed for ${grant.value}`);
            fetchGrants(token);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to remove grant');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_token');
        setIsLoggedIn(false);
        setGrants([]);
    };

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-0 shadow-2xl">
                    <CardHeader className="text-center pb-2">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-2xl">Admin Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <Label htmlFor="password">Admin Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter admin password"
                                    className="mt-1"
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? 'Logging in...' : 'Login'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="bg-white border-b sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <div className="flex items-center gap-2">
                            <Shield className="w-6 h-6 text-indigo-600" />
                            <h1 className="text-xl font-bold">Admin Panel</h1>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        Logout
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Add New Grant */}
                <Card className="mb-8 border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Grant Free Access
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAddGrant} className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[150px]">
                                <Label>Type</Label>
                                <Select value={newGrant.type} onValueChange={(v) => setNewGrant({...newGrant, type: v})}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="email">Email</SelectItem>
                                        <SelectItem value="domain">Domain</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex-[2] min-w-[200px]">
                                <Label>{newGrant.type === 'email' ? 'Email Address' : 'Domain'}</Label>
                                <Input
                                    value={newGrant.value}
                                    onChange={(e) => setNewGrant({...newGrant, value: e.target.value})}
                                    placeholder={newGrant.type === 'email' ? 'user@example.com' : '@company.com'}
                                    className="mt-1"
                                />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <Label>Plan</Label>
                                <Select value={newGrant.plan} onValueChange={(v) => setNewGrant({...newGrant, plan: v})}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pro">Pro</SelectItem>
                                        <SelectItem value="teams">Teams</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={loading}>
                                <Plus className="w-4 h-4 mr-1" /> Add
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Current Grants */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle>Active Access Grants ({grants.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {grants.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">No access grants yet</p>
                        ) : (
                            <div className="space-y-3">
                                {grants.map((grant, index) => (
                                    <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            {grant.type === 'domain' ? (
                                                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                                    <Users className="w-5 h-5 text-purple-600" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                    <Crown className="w-5 h-5 text-blue-600" />
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-medium">{grant.value}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {grant.type === 'domain' ? 'All users in domain' : 'Individual user'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant={grant.plan === 'teams' ? 'default' : 'secondary'}>
                                                {grant.plan.toUpperCase()}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveGrant(grant)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default AdminPage;
