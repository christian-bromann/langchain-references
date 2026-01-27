"use client";

/**
 * DevTools Component
 *
 * Development-only indicator that shows useful debug information,
 * similar to Next.js's dev mode indicator. Shows data source and
 * other runtime configuration at a glance.
 */

import { useState, useEffect, useRef } from "react";

interface DevToolsInfo {
  blobUrl: string;
  isLocal: boolean;
  nodeEnv: string;
}

export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [info, setInfo] = useState<DevToolsInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch dev info from an API route
    fetch("/api/dev-info")
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => {
        // Fallback if API doesn't exist
        setInfo({
          blobUrl: "unknown",
          isLocal: false,
          nodeEnv: "development",
        });
      });
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Don't render in production
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const isLocal = info?.isLocal ?? false;

  return (
    <div ref={containerRef} className="fixed bottom-[24px] left-[150px] z-9999 font-mono text-xs">
      {/* Collapsed indicator */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm transition-all hover:scale-105 ${
          isLocal ? "bg-green-500/90 text-white" : "bg-amber-500/90 text-white"
        }`}
        title={isLocal ? "Using local IR server" : "Using remote blob storage"}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            isLocal ? "bg-green-200 animate-pulse" : "bg-amber-200"
          }`}
        />
        <span className="font-semibold">{isLocal ? "LOCAL" : "REMOTE"}</span>
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Expanded panel */}
      {isOpen && info && (
        <div className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Dev Tools</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isLocal
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              }`}
            >
              {info.nodeEnv}
            </span>
          </div>

          <div className="space-y-3">
            {/* Data Source */}
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                IR Data Source
              </div>
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    isLocal ? "bg-green-500" : "bg-amber-500"
                  }`}
                />
                <code className="break-all text-gray-700 dark:text-gray-300">{info.blobUrl}</code>
              </div>
            </div>

            {/* Status explanation */}
            <div className="rounded-md bg-gray-50 p-2 dark:bg-gray-800">
              {isLocal ? (
                <p className="text-gray-600 dark:text-gray-400">
                  ✓ Loading from local IR server. Changes to{" "}
                  <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">ir-output/</code> will
                  be reflected immediately.
                </p>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  ⚠ Loading from remote storage. Local changes won't be visible. Set{" "}
                  <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
                    BLOB_URL=http://localhost:3001
                  </code>{" "}
                  in <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">.env.local</code>{" "}
                  to use local data.
                </p>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(info.blobUrl);
                }}
                className="rounded bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Copy URL
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
