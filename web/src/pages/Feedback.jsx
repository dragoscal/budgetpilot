import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { feedbackApi } from '../lib/api';
import {
  Bug, Lightbulb, MessageSquare, Send, ChevronDown, ChevronUp,
  CheckCircle, Clock, AlertCircle, Loader2, Camera, X, Image as ImageIcon,
} from 'lucide-react';

const TYPES = [
  { id: 'bug', label: 'Bug Report', icon: Bug, color: 'text-danger', bg: 'bg-danger/10', desc: 'Something broken or not working' },
  { id: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10', desc: 'Feature request or improvement' },
  { id: 'other', label: 'Other', icon: MessageSquare, color: 'text-info', bg: 'bg-info/10', desc: 'General feedback or question' },
];

const STATUS_BADGE = {
  open: { label: 'Open', icon: AlertCircle, className: 'bg-warning/10 text-warning' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-info/10 text-info' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-success/10 text-success' },
  closed: { label: 'Closed', icon: CheckCircle, className: 'bg-cream-200 dark:bg-dark-border text-cream-500' },
};

export default function Feedback() {
  const { toast } = useToast();
  const location = useLocation();
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [screenshot, setScreenshot] = useState(null); // base64 data URL
  const [screenshotName, setScreenshotName] = useState('');
  const fileRef = useRef(null);
  const [myFeedback, setMyFeedback] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => { loadMyFeedback(); }, []);

  const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleScreenshot = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large. Maximum 10MB.');
      return;
    }
    const compressed = await compressImage(file);
    setScreenshot(compressed);
    setScreenshotName(file.name);
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const loadMyFeedback = async () => {
    setLoadingHistory(true);
    try {
      const data = await feedbackApi.list();
      setMyFeedback(Array.isArray(data) ? data : []);
    } catch { /* silently fail — backend may not be configured */ }
    finally { setLoadingHistory(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setSubmitting(true);
    try {
      await feedbackApi.submit({
        type,
        title: title.trim(),
        description: description.trim() || null,
        screenshot: screenshot || null,
        page: location.pathname,
      });
      toast.success('Thank you! Your feedback has been submitted.');
      setTitle('');
      setDescription('');
      setType('bug');
      removeScreenshot();
      await loadMyFeedback();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="page-title">Feedback</h1>
      <p className="text-sm text-cream-500 dark:text-cream-400 -mt-4">
        Found a bug or have an idea? Let us know!
      </p>

      {/* Submit Form */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Type selector */}
        <div>
          <label className="text-xs font-medium text-cream-500 mb-2 block">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  type === t.id
                    ? `${t.bg} border-current ${t.color}`
                    : 'border-cream-200 dark:border-dark-border text-cream-500 hover:border-cream-300'
                }`}
              >
                <t.icon size={20} />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-cream-400 mt-1.5">
            {TYPES.find(t => t.id === type)?.desc}
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-cream-500 mb-1.5 block">
            Title <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'bug' ? 'e.g. Receipt scanner shows wrong total' : type === 'suggestion' ? 'e.g. Add dark mode for charts' : 'What\'s on your mind?'}
            className="w-full px-3 py-2.5 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm focus:outline-none focus:ring-2 focus:ring-cream-900/20 dark:focus:ring-cream-100/20"
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-cream-500 mb-1.5 block">
            Details <span className="text-cream-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'bug' ? 'Steps to reproduce, what you expected, what happened instead...' : 'Describe your idea in detail...'}
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm focus:outline-none focus:ring-2 focus:ring-cream-900/20 dark:focus:ring-cream-100/20 resize-none"
            maxLength={2000}
          />
          {description.length > 0 && (
            <p className="text-[10px] text-cream-400 text-right mt-0.5">{description.length}/2000</p>
          )}
        </div>

        {/* Screenshot */}
        <div>
          <label className="text-xs font-medium text-cream-500 mb-1.5 block">
            Screenshot <span className="text-cream-400">(optional)</span>
          </label>
          {screenshot ? (
            <div className="relative rounded-xl overflow-hidden border border-cream-200 dark:border-dark-border">
              <img src={screenshot} alt="Screenshot" className="w-full max-h-48 object-contain bg-cream-50 dark:bg-dark-bg" />
              <button
                type="button"
                onClick={removeScreenshot}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <X size={14} />
              </button>
              <div className="px-3 py-1.5 bg-cream-50 dark:bg-dark-card text-[10px] text-cream-500 flex items-center gap-1.5">
                <ImageIcon size={10} />
                {screenshotName}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-cream-200 dark:border-dark-border text-cream-400 hover:border-cream-300 hover:text-cream-500 transition-colors text-xs"
            >
              <Camera size={16} />
              Add screenshot
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScreenshot(file);
            }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> Submitting...</>
          ) : (
            <><Send size={16} /> Submit Feedback</>
          )}
        </button>
      </form>

      {/* My Feedback History */}
      {myFeedback.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full"
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              My Submissions
              <span className="text-[10px] bg-cream-200 dark:bg-dark-border text-cream-600 px-1.5 py-0.5 rounded-full">
                {myFeedback.length}
              </span>
            </span>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {myFeedback.map((fb) => {
                const typeInfo = TYPES.find(t => t.id === fb.type) || TYPES[2];
                const statusInfo = STATUS_BADGE[fb.status] || STATUS_BADGE.open;

                return (
                  <div key={fb.id} className="p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <typeInfo.icon size={14} className={typeInfo.color} />
                        <span className="text-sm font-medium truncate">{fb.title}</span>
                      </div>
                      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${statusInfo.className}`}>
                        <statusInfo.icon size={10} />
                        {statusInfo.label}
                      </span>
                    </div>
                    {fb.description && (
                      <p className="text-xs text-cream-500 mt-1 line-clamp-2">{fb.description}</p>
                    )}
                    {fb.adminNote && (
                      <div className="mt-2 p-2 rounded-lg bg-info/5 border border-info/20">
                        <p className="text-[10px] font-medium text-info mb-0.5">Admin response:</p>
                        <p className="text-xs text-cream-600 dark:text-cream-400">{fb.adminNote}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-cream-400 mt-1.5">{formatDate(fb.createdAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
