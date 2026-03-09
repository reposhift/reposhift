"use client";

import { useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

export function ApiKeyInput() {
  const { hasServerKey, userApiKey, setUserApiKey, configLoaded } = useApiKey();
  const [inputValue, setInputValue] = useState(userApiKey);
  const [showKey, setShowKey] = useState(false);

  // Don't render if server has its own key (self-hosted mode)
  if (!configLoaded || hasServerKey) return null;

  const isSet = userApiKey.length > 0;
  const maskedKey = userApiKey
    ? `${userApiKey.slice(0, 7)}...${userApiKey.slice(-4)}`
    : "";

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      setUserApiKey(trimmed);
    }
  };

  const handleClear = () => {
    setUserApiKey("");
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <div className="mt-8 mb-4 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        {/* Key icon */}
        <div className="w-8 h-8 rounded-lg bg-accent-glow border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {isSet ? (
            // Key is set — show status
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  API Key Connected
                </span>
                <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code
                  className="text-xs text-text-muted font-mono"
                  title={showKey ? userApiKey : undefined}
                >
                  {showKey ? userApiKey : maskedKey}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <span className="text-text-muted">·</span>
                <button
                  onClick={handleClear}
                  className="text-[10px] text-text-muted hover:text-critical transition-colors"
                >
                  Remove
                </button>
              </div>
              <p className="text-[10px] text-text-muted mt-1.5">
                Stored in your browser session only — never sent to our server.
              </p>
            </div>
          ) : (
            // Key not set — show input
            <div>
              <p className="text-sm font-medium text-text-primary">
                Anthropic API Key Required
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Your key is stored in your browser session only and sent directly
                to the Anthropic API. We never store it.
              </p>
              <div className="flex gap-2 mt-3">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="sk-ant-api03-..."
                  className="flex-1 h-9 px-3 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors text-sm"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
                />
                <button
                  onClick={handleSave}
                  disabled={!inputValue.trim()}
                  className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-text-muted mt-2">
                Get your key at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
