import { useEffect, useRef, useState } from "react";
import { fetchProfileFileBlob } from "../api";

/**
 * Shows an inline preview for images; a compact label for PDFs.
 */
export default function ProfileDocumentThumb({ profileId, docType, docId, mimeType, title }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef(null);

  const isImage = typeof mimeType === "string" && mimeType.startsWith("image/");

  useEffect(() => {
    if (!isImage || !profileId || !docId) {
      setSrc(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blob = await fetchProfileFileBlob(profileId, { type: docType, docId });
        if (cancelled) return;
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
        const u = URL.createObjectURL(blob);
        urlRef.current = u;
        setSrc(u);
        setFailed(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setSrc(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [profileId, docType, docId, mimeType, isImage]);

  if (isImage && src && !failed) {
    return (
      <div className="profile-doc-thumb-wrap">
        <img src={src} alt="" className="profile-doc-thumb-img" />
        {title ? <span className="profile-doc-thumb-caption">{title}</span> : null}
      </div>
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <div className="profile-doc-thumb-wrap profile-doc-thumb-pdf">
        <span className="profile-doc-thumb-fallback">PDF</span>
        {title ? <span className="profile-doc-thumb-caption">{title}</span> : null}
      </div>
    );
  }

  return (
    <div className="profile-doc-thumb-wrap profile-doc-thumb-generic">
      <span className="profile-doc-thumb-fallback">File</span>
      {title ? <span className="profile-doc-thumb-caption">{title}</span> : null}
    </div>
  );
}
