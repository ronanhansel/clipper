import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  componentDidMount() {
    if (!import.meta.hot) return;
    import.meta.hot.on("vite:beforeUpdate", this.reset);
  }

  componentWillUnmount() {
    if (!import.meta.hot) return;
    import.meta.hot.off("vite:beforeUpdate", this.reset);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="grid h-screen place-items-center bg-[#12141a] p-8 text-[#ffb4b4]"><div className="grid max-w-[900px] gap-3"><pre className="whitespace-pre-wrap rounded-xl border border-[#3b2a2a] bg-[#1a0f10] p-5 text-xs">{this.state.error.stack ?? this.state.error.message}</pre><button className="justify-self-start rounded-lg border border-[#5a3434] bg-[#251416] px-3 py-2 text-xs font-bold text-[#ffd6d6]" onClick={this.reset}>Retry render</button></div></main>;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
