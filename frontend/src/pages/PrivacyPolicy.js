import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';

const PrivacyPolicy = () => {
    return (
        <div data-testid="privacy-policy-page" className="min-h-screen bg-white">
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

            <main className="container mx-auto px-6 py-12 max-w-3xl">
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Privacy Policy</h1>
                <p className="text-muted-foreground mb-8">Last updated: July 2, 2026</p>

                <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">
                    <section>
                        <p>This Privacy Policy explains how Tskflow (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your information when you use our task management application at tskflow.com (the &quot;Service&quot;).</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">1. Information We Collect</h2>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>Account information:</strong> your name, email address, and password (stored encrypted).</li>
                            <li><strong>Task data:</strong> tasks you create, assign, accept, or complete, including titles, descriptions, due dates, and status.</li>
                            <li><strong>Usage data:</strong> basic activity needed to operate the Service (e.g., last active time).</li>
                            <li><strong>Google account data</strong> (only if you choose to connect Google Calendar) — see Section 4.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">2. How We Use Your Information</h2>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>To provide and operate the task management Service.</li>
                            <li>To send task assignment, verification, and account-related emails.</li>
                            <li>To create calendar events for high-priority tasks when you connect Google Calendar.</li>
                            <li>To maintain the security and integrity of the Service.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">3. How We Share Information</h2>
                        <p>We do not sell your personal information. We share data only with service providers that help us operate the Service (e.g., email delivery, payment processing, cloud hosting), and only as needed to provide the Service or comply with the law.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">4. Google User Data</h2>
                        <p>If you connect your Google account, Tskflow requests access to your Google Calendar (the <code>calendar.events</code> scope) solely to create and manage calendar events for tasks you accept in Tskflow.</p>
                        <p>Tskflow&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically:</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>We only use Google Calendar data to provide the calendar-blocking feature you enabled.</li>
                            <li>We do not use Google user data for advertising.</li>
                            <li>We do not sell Google user data or transfer it to third parties except as necessary to provide the feature, for security, or to comply with the law.</li>
                            <li>Humans do not read your Google data unless you give explicit consent, it is required for security, or required by law.</li>
                        </ul>
                        <p>You can disconnect Google Calendar at any time from Settings, which revokes our stored access tokens.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">5. Data Retention & Security</h2>
                        <p>We retain your data for as long as your account is active. Deleted tasks are recoverable for a limited window and then permanently removed. You can delete your account at any time from Settings, which removes your personal data and cancels any active subscription. We use industry-standard measures to protect your data, including encryption of passwords and secure transmission over HTTPS.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">6. Your Rights</h2>
                        <p>You may access, update, or delete your personal information at any time through your account settings, or by contacting us. Depending on your location, you may have additional rights under laws such as GDPR or CCPA.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">7. Contact Us</h2>
                        <p>If you have any questions about this Privacy Policy, contact us at <a href="mailto:hashim@tskflow.com" className="text-indigo-600 underline">hashim@tskflow.com</a>.</p>
                    </section>
                </div>

                <div className="mt-12 pt-6 border-t">
                    <Link to="/terms" className="text-indigo-600 hover:underline mr-6">Terms of Service</Link>
                    <Link to="/" className="text-indigo-600 hover:underline">Back to Home</Link>
                </div>
            </main>
        </div>
    );
};

export default PrivacyPolicy;
