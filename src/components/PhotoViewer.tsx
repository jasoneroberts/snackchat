import { useEffect } from "react";

/** A photo shown full screen over the page. Tap anywhere or press Escape to close. */
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Stop the feed scrolling behind the photo.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <img src={src} alt={alt} />
      <button type="button" className="photo-viewer-close" aria-label="Close" autoFocus>
        ×
      </button>
    </div>
  );
}
