import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';

const TermsOfService = () => {
    return (
        <div data-testid="terms-page" className="min-h-screen bg-white">
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
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Terms of Service</h1>
                <p className="text-muted-foreground mb-8">Last updated: July 2, 2026</p>

                <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">
                    <section>
                        <p>These Terms of Service (&quot;Terms&quot;) govern your access to and use of Tskflow (the &quot;Service&quot;) at tskflow.com. By creating an account or using the Service, you agree to these Terms.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">1. Accounts</h2>
                        <p>You must provide accurate information when creating an account and are responsible for keeping your login credentials secure and for all activity under your account. You must be at least 16 years old to use the Service.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">2. Use of the Service</h2>
                        <p>You agree to use Tskflow only for lawful purposes. You may not misuse the Service, attempt to access it in an unauthorized manner, interfere with its operation, or use it to send spam or harmful content.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">3. Subscriptions & Payments</h2>
                        <p>Paid plans (Pro and Teams) are billed on a recurring basis through our payment processor. You can manage or cancel your subscription at any time from your account settings. Fees are non-refundable except where required by law. Some organizations may receive plan access provided by their company or administrator.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">4. Google Calendar Integration</h2>
                        <p>If you connect Google Calendar, you authorize Tskflow to create and manage calendar events on your behalf for tasks you accept. Your use of Google services is also subject to Google&apos;s terms. You can revoke this access at any time from Settings. Our handling of Google user data is described in our <Link to="/privacy" className="text-indigo-600 underline">Privacy Policy</Link>.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">5. Your Content</h2>
                        <p>You retain ownership of the tasks and content you create. You grant us a limited license to store and process this content solely to provide the Service.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">6. Termination</h2>
                        <p>You may stop using the Service and delete your account at any time. We may suspend or terminate access if you violate these Terms or use the Service in a way that could cause harm to us or other users.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">7. Disclaimer & Limitation of Liability</h2>
                        <p>The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by law, Tskflow is not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">8. Changes to These Terms</h2>
                        <p>We may update these Terms from time to time. Material changes will be communicated through the Service or by email. Continued use after changes take effect constitutes acceptance.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">9. Contact Us</h2>
                        <p>Questions about these Terms? Contact us at <a href="mailto:support@tskflow.com" className="text-indigo-600 underline">support@tskflow.com</a>.</p>
                    </section>
                </div>

                <div className="mt-12 pt-6 border-t">
                    <Link to="/privacy" className="text-indigo-600 hover:underline mr-6">Privacy Policy</Link>
                    <Link to="/" className="text-indigo-600 hover:underline">Back to Home</Link>
                </div>
            </main>
        </div>
    );
};

export default TermsOfService;
