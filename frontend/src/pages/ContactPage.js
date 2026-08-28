import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';

const ContactPage = () => {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        message: '',
        smsConsent: false,
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`${API}/contact`, {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                message: formData.message,
                sms_consent: formData.smsConsent,
            });
            toast.success('Message sent! We\'ll get back to you soon.');
            setSubmitted(true);
            setFormData({
                name: '',
                email: '',
                phone: '',
                message: '',
                smsConsent: false,
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to send message'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="contact-page" className="min-h-screen bg-white">
            <header className="border-b">
                <div className="container mx-auto px-6 py-4">
                    <Link to="/" className="flex items-center gap-2 w-fit">
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" style={{ fontFamily: 'Outfit' }}>Tskflow</span>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-6 py-12 max-w-xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Contact Us</h1>
                    <p className="text-muted-foreground mb-8">
                        Have a question or feedback? Send us a message and we&apos;ll reply soon.
                    </p>

                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                                Send a message
                            </CardTitle>
                            <CardDescription className="text-base">
                                We typically respond within 1-2 business days.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {submitted ? (
                                <div className="space-y-4 text-center py-4" data-testid="contact-success">
                                    <p className="text-slate-700">Thanks for reaching out. Your message has been received.</p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-md"
                                        onClick={() => setSubmitted(false)}
                                    >
                                        Send another message
                                    </Button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input
                                            id="name"
                                            data-testid="contact-name-input"
                                            type="text"
                                            placeholder="Your name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            data-testid="contact-email-input"
                                            type="email"
                                            placeholder="name@company.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                        <Input
                                            id="phone"
                                            data-testid="contact-phone-input"
                                            type="tel"
                                            placeholder="+1 (555) 123-4567"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="rounded-md"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="message">Message</Label>
                                        <Textarea
                                            id="message"
                                            data-testid="contact-message-input"
                                            placeholder="How can we help?"
                                            value={formData.message}
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            required
                                            rows={5}
                                            className="rounded-md"
                                        />
                                    </div>
                                    <div className="flex items-start gap-3 pt-1">
                                        <Checkbox
                                            id="smsConsent"
                                            data-testid="contact-sms-consent"
                                            checked={formData.smsConsent}
                                            onCheckedChange={(checked) => setFormData({ ...formData, smsConsent: checked === true })}
                                            className="mt-0.5"
                                        />
                                        <Label htmlFor="smsConsent" className="text-sm font-normal leading-snug cursor-pointer text-slate-700">
                                            By checking, you agree to receive <strong>transactional/informational SMS communications</strong> regarding your inquiry from <strong>Unbiassly, Inc.</strong> doing business as <strong>TskFlow</strong>. Message frequency varies. <strong>Message and data rates may apply</strong>. Reply <strong>HELP</strong> for help or <strong>STOP</strong> to opt-out.
                                        </Label>
                                    </div>
                                    <Button
                                        data-testid="contact-submit-button"
                                        type="submit"
                                        className="w-full rounded-md font-medium"
                                        disabled={loading}
                                    >
                                        {loading ? 'Sending...' : 'Send Message'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    <div className="mt-12 pt-6 border-t">
                        <Link to="/legal" className="text-indigo-600 hover:underline mr-6">Legal</Link>
                        <Link to="/privacy" className="text-indigo-600 hover:underline mr-6">Privacy Policy</Link>
                        <Link to="/terms" className="text-indigo-600 hover:underline mr-6">Terms of Service</Link>
                        <Link to="/" className="text-indigo-600 hover:underline">Back to Home</Link>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default ContactPage;
