'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Activity, CalendarDays, Eye, EyeOff, Headset, LockKeyhole, Mail, ShieldCheck, UsersRound, UserRound, Phone, ArrowRight, Stethoscope } from 'lucide-react';

type AuthPageProps = { mode: 'login' | 'signup' };

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === 'signup';
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agree, setAgree] = useState(false);
  const [role, setRole] = useState('Doctor');
  const [notice, setNotice] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(isSignup ? 'Account form validated. Connect your authentication API to create the account.' : 'Login form validated. Connect your authentication API to continue.');
  }

  return (
    <main className="auth-page">
      <section className="auth-hero" aria-label="Medrella healthcare platform introduction">
        <div className="auth-hero-img-wrap">
          <Image
            src="/images/hospital-auth-hero.jpg"
            alt="SP Delta Hospital Clinical Hallway"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="auth-hero-bg-img"
          />
        </div>
        <div className="auth-hero-shade" />
        <div className="hero-content">
          <Link href="/" className="auth-brand" aria-label="Medrella home">
            <span className="brand-mark">
              <Image
                src="/images/medrella-logo.png"
                alt="Medrella"
                width={40}
                height={40}
                priority
              />
            </span>
            <span>medrella<span className="brand-dot">.</span></span>
          </Link>
          <div className="hospital-label"><span className="hospital-dot" /> SP DELTA HOSPITAL, T. NAGAR</div>
          <div className="hero-copy">
            <p className="eyebrow">CARE · CLARITY · CONFIDENCE</p>
            <h1>More time<br />for <span>care.</span></h1>
            <p className="hero-description">A modern hospital management system designed to simplify clinical workflows and improve patient care.</p>
          </div>
          <div className="feature-list">
            <Feature icon={<UsersRound />} title="Efficient Patient Management" detail="Unified records and faster access" />
            <Feature icon={<CalendarDays />} title="Seamless Appointments" detail="Smarter scheduling for everyone" />
            <Feature icon={<ShieldCheck />} title="Secure & Reliable" detail="Built for modern healthcare" />
            <Feature icon={<Activity />} title="Actionable Insights" detail="Better decisions, healthier outcomes" />
          </div>
          <blockquote>“Better care today.<br />A healthier tomorrow.”</blockquote>
          <div className="hero-footnote"><Stethoscope size={14} /> Thoughtfully designed for healthcare teams</div>
        </div>
      </section>

      <section className="auth-panel">
        <Link href="/" className="mobile-brand">
          <span className="brand-mark">
            <Image
              src="/images/medrella-logo.png"
              alt="Medrella"
              width={34}
              height={34}
              priority
            />
          </span>
          <span>medrella<span className="brand-dot">.</span></span>
        </Link>
        <a className="help-link" href="mailto:support@medrella.com"><Headset size={16} /> Need help?</a>
        <div className={`auth-card ${isSignup ? 'signup-card' : ''}`}>
          <div className="form-heading">
            <div className="form-kicker">{isSignup ? 'GET STARTED' : 'WELCOME BACK'}</div>
            <h2>{isSignup ? 'Create Account' : 'Login'}</h2>
            <p>{isSignup ? 'Join Medrella and be part of a smarter healthcare experience.' : 'Welcome back! Please sign in to continue to Medrella.'}</p>
          </div>
          <form onSubmit={handleSubmit}>
            {isSignup && <div className="name-row">
              <label className="input-wrap"><UserRound size={17} /><input required autoComplete="given-name" placeholder="First name" aria-label="First name" /></label>
              <label className="input-wrap"><UserRound size={17} /><input required autoComplete="family-name" placeholder="Last name" aria-label="Last name" /></label>
            </div>}
            <label className="input-wrap"><Mail size={17} /><input type="email" required autoComplete="email" placeholder="Enter your email" aria-label="Email address" /></label>
            {isSignup && <label className="input-wrap"><Phone size={17} /><input type="tel" required autoComplete="tel" placeholder="Enter your phone number" aria-label="Phone number" /></label>}
            {isSignup && <label className="input-wrap"><UserRound size={17} /><select value={role} onChange={e => setRole(e.target.value)} aria-label="Select your role"><option value="Doctor">Doctor</option><option value="Receptionist">Receptionist</option><option value="Nurse">Nurse</option><option value="Hospital Admin">Hospital Admin</option><option value="Billing Staff">Billing Staff</option></select><span className="select-spacer" /></label>}
            <label className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'Create a password (8+ characters)' : 'Enter your password'} aria-label="Password" /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></label>
            {!isSignup && <div className="form-options"><label className="check-label"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> <span>Remember me</span></label><button type="button" className="text-button" onClick={() => setNotice('Password reset flow: connect your email recovery endpoint to enable this action.')}>Forgot password?</button></div>}
            {isSignup && <label className="check-label terms-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required /> <span>I agree to the <a href="#terms" onClick={e => {e.preventDefault(); setNotice('Add your Terms of Service and Privacy Policy links here.')}}>Terms of Service</a> and <a href="#privacy" onClick={e => {e.preventDefault(); setNotice('Add your Privacy Policy link here.')}}>Privacy Policy</a></span></label>}
            <button type="submit" className="primary-button">{isSignup ? 'Create Account' : 'Login'} <ArrowRight size={17} /></button>
          </form>
          {notice && <div className="form-notice" role="status">{notice}</div>}
          <div className="divider"><span /> <em>or continue with</em> <span /></div>
          <div className="social-row"><button type="button" onClick={() => setNotice('Google sign-in requires OAuth configuration.')}><span className="google-g">G</span> Google</button><button type="button" onClick={() => setNotice('Microsoft sign-in requires OAuth configuration.')}><span className="microsoft-mark"><i /><i /><i /><i /></span> Microsoft</button></div>
          <p className="switch-auth">{isSignup ? 'Already have an account?' : "Don't have an account?"} <Link href={isSignup ? '/login' : '/signup'}>{isSignup ? 'Login' : 'Sign up'}</Link></p>
        </div>
        <footer className="auth-footer"><span>© 2026 Medrella. All rights reserved.</span><div><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="mailto:support@medrella.com">Support</a></div></footer>
      </section>
    </main>
  );
}

function Feature({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="auth-feature"><span className="feature-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
