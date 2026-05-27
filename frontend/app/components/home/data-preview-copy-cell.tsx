"use client";

import { memo, useCallback, useState, type ReactNode } from "react";

type DataPreviewCopyCellProps = {
  className: string;
  copyValue: string;
  title?: string;
  children: ReactNode;
};

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export const DataPreviewCopyCell = memo(function DataPreviewCopyCell({
  className,
  copyValue,
  title,
  children,
}: DataPreviewCopyCellProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }, [copyValue]);

  const tip = copied ? "Copied" : "Copy value";

  return (
    <td className={`${className} data-preview-cell--copyable`} title={title}>
      <span className="data-preview-cell__value">{children}</span>
      <button
        type="button"
        className={`data-preview-cell__copy${copied ? " data-preview-cell__copy--done" : ""}`}
        onClick={handleCopy}
        aria-label={tip}
        title={tip}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </td>
  );
});
