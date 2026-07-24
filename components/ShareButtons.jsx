'use client';

// Share links for the landing page, for visitors (or you) to advertise
// the site. Reads the URL from the browser at render time rather than a
// hardcoded/env-configured domain, so this keeps working correctly
// whether it's on the current onrender.com URL or a future custom
// domain -- no config to update either way.
import { useState, useEffect } from 'react';

export default function ShareButtons() {
  const [pageUrl, setPageUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const shareText = 'Lead intelligence for field service — call tracking, conversion scoring, and automated prospect outreach.';

  useEffect(() => {
    setPageUrl(window.location.href);
    // Only iOS/Android browsers implement navigator.share -- this is
    // what actually gets Instagram/TikTok/WhatsApp/Messages etc. as
    // share options, since neither has a public web share URL the way
    // Facebook/X/LinkedIn do. Desktop browsers mostly don't have it, so
    // this button only renders where it'll actually do something.
    if (typeof navigator !== 'undefined' && navigator.share) {
      setCanNativeShare(true);
    }
  }, []);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: 'Apex Junk Solutions', text: shareText, url: pageUrl });
    } catch {
      // User cancelled the share sheet, or the browser rejected it --
      // either way, nothing to show an error for.
    }
  };

  const links = [
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS, old browser) --
      // fail quietly rather than throwing in front of the user.
    }
  };

  if (!pageUrl) return null; // avoids a flash of dead links before the URL is known

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
      <span className="text-sm text-slate-500">Share:</span>
      {canNativeShare && (
        <button
          onClick={handleNativeShare}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Share... (Instagram, TikTok, etc.)
        </button>
      )}
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors"
        >
          {link.label}
        </a>
      ))}
      <button
        onClick={handleCopy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}
