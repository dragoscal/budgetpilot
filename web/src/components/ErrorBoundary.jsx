import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { LanguageContext } from '../contexts/LanguageContext';

export default class ErrorBoundary extends Component {
  static contextType = LanguageContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    // Detect chunk loading errors specifically
    const isChunkError =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Loading CSS chunk') ||
      error?.message?.includes('Failed to load page') ||
      error?.name === 'ChunkLoadError';
    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    if (this.state.isChunkError) {
      // For chunk errors, force a full reload to get fresh assets
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null, isChunkError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      const { isChunkError } = this.state;
      const t = this.context?.t || ((k) => k);
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="w-16 h-16 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-cream-900 dark:text-cream-100">
              {isChunkError ? t('error.pageFailedLoad') : t('error.somethingWrong')}
            </h2>
            <p className="text-sm text-cream-500">
              {isChunkError
                ? t('error.newVersionDeployed')
                : (this.state.error?.message || t('error.unexpected'))}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleRetry}
                className="btn-primary flex items-center gap-2"
              >
                <RefreshCw size={16} /> {isChunkError ? t('error.refreshPage') : t('error.tryAgain')}
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="btn-secondary flex items-center gap-2"
              >
                <Home size={16} /> {t('error.goHome')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
