import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error UI is rendered cleanly; keep runtime console noise minimal.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty" role="alert">
          <h2>تعذر تشغيل العارض ثلاثي الأبعاد</h2>
          <p>يمكنك مواصلة قراءة البيانات التشريحية أدناه أو إعادة المحاولة.</p>
          <button type="button" onClick={() => this.setState({ hasError: false })}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
