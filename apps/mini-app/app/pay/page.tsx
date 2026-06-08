'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Telegram?: { WebApp: any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PaystackPop?: any;
  }
}

type Status = 'idle' | 'loading' | 'paying' | 'success' | 'error';

export default function PayPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const scriptRef = useRef(false);

  // Parse URL params
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const reference = params.get('reference') ?? '';
  const formId    = params.get('formId') ?? '';
  const amount    = parseInt(params.get('amount') ?? '0', 10);
  const sig       = params.get('sig') ?? '';

  const tgApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

  useEffect(() => {
    if (tgApp) {
      tgApp.ready();
      tgApp.expand();
      tgApp.enableClosingConfirmation();
    }
  }, [tgApp]);

  // Load Paystack script
  useEffect(() => {
    if (scriptRef.current) return;
    scriptRef.current = true;

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => setStatus('idle');
    document.body.appendChild(script);
  }, []);

  const handlePay = async () => {
    if (!reference || !formId || !amount || !sig) {
      setError('Invalid payment link. Please go back and try again.');
      return;
    }

    setStatus('loading');

    // Verify signed params with API before charging
    try {
      const verifyRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payment/verify-params?reference=${reference}&formId=${formId}&amount=${amount}&sig=${sig}`,
      );
      if (!verifyRes.ok) {
        setError('This payment link is invalid or has expired.');
        setStatus('error');
        return;
      }
    } catch {
      setError('Could not verify payment link. Check your connection.');
      setStatus('error');
      return;
    }

    setStatus('paying');

    if (!window.PaystackPop) {
      setError('Payment provider failed to load. Please try again.');
      setStatus('error');
      return;
    }

    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: 'creator@fluxforms.app',
      amount,
      currency: 'NGN',
      ref: reference,
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      metadata: { formId },
      onSuccess: () => {
        setStatus('success');
        setTimeout(() => {
          if (tgApp) tgApp.close();
        }, 2000);
      },
      onCancel: () => {
        setStatus('idle');
      },
    });

    handler.openIframe();
  };

  const naira = (kobo: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);

  if (status === 'success') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-green-50 px-4">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">Payment Successful!</h1>
        <p className="text-gray-600 text-center">Your form is now live. Closing…</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-red-50 px-4">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">Payment Failed</h1>
        <p className="text-gray-600 text-center mb-6">{error}</p>
        <button
          onClick={() => { setStatus('idle'); setError(''); }}
          className="bg-red-600 text-white py-2 px-6 rounded-lg"
        >
          Try Again
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📄</div>
          <h1 className="text-2xl font-bold text-gray-900">Activate Form</h1>
          <p className="text-gray-500 mt-1 text-sm">One-time payment to publish your form</p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-5 mb-6 border border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Amount</span>
            <span className="text-2xl font-bold text-gray-900">{naira(amount)}</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-600 text-sm">Reference</span>
            <span className="text-gray-400 text-xs font-mono">{reference.slice(-12)}</span>
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={status === 'loading' || status === 'paying'}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60
                     text-white font-semibold py-4 rounded-2xl text-lg transition-colors"
        >
          {status === 'loading' ? 'Verifying…' :
           status === 'paying'  ? 'Processing…' :
           `Pay ${naira(amount)}`}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Secured by Paystack · Your card details are never stored
        </p>
      </div>
    </main>
  );
}
