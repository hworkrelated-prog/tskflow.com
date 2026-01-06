import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const PerformancePage = () => {
    const { user } = useAuth();
    const [performance, setPerformance] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchPerformance();
    }, []);

    const fetchPerformance = async () => {
        try {
            const response = await axios.get(`${API}/dashboard/admin/performance`);
            setPerformance(response.data);
        } catch (error) {
            console.error('Failed to fetch performance', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <div data-testid="performance-page" className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="ghost"
                        onClick={() => navigate('/')}
                        className="mb-2 rounded-md"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Performance Overview</h1>
                    <p className="text-sm text-muted-foreground">Individual manager performance metrics</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8">
                <Card className="border-2 shadow-sm rounded-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Manager Performance</CardTitle>
                        <CardDescription>Task execution metrics by manager</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {performance.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No managers yet</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-3 px-4 font-semibold text-sm">Manager</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Assigned</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Accepted</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Completed</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Avg Time (hrs)</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Decline Rate</th>
                                            <th className="text-center py-3 px-4 font-semibold text-sm">Counter-Proposals</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {performance.map((perf, index) => (
                                            <motion.tr
                                                key={perf.user_id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, delay: index * 0.05 }}
                                                className="border-b hover:bg-secondary/50 transition-colors"
                                                data-testid={`performance-row-${perf.user_id}`}
                                            >
                                                <td className="py-4 px-4">
                                                    <div>
                                                        <p className="font-medium">{perf.user_name}</p>
                                                        <p className="text-xs text-muted-foreground">{perf.user_email}</p>
                                                    </div>
                                                </td>
                                                <td className="text-center py-4 px-4">{perf.tasks_assigned}</td>
                                                <td className="text-center py-4 px-4">{perf.tasks_accepted}</td>
                                                <td className="text-center py-4 px-4">{perf.tasks_completed}</td>
                                                <td className="text-center py-4 px-4">
                                                    {perf.avg_completion_time_hours ? perf.avg_completion_time_hours.toFixed(1) : '-'}
                                                </td>
                                                <td className="text-center py-4 px-4">
                                                    <span className={perf.decline_rate > 20 ? 'text-red-600 font-semibold' : ''}>
                                                        {perf.decline_rate}%
                                                    </span>
                                                </td>
                                                <td className="text-center py-4 px-4">{perf.counter_proposal_count}</td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default PerformancePage;