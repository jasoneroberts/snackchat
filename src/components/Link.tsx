import type { AnchorHTMLAttributes } from "react";
import { newVersionReady } from "../lib/appUpdate";
import { navigate } from "../router";

export function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        // A new version is downloaded: load the page for real so it's used.
        if (newVersionReady()) window.location.assign(href);
        else navigate(href);
      }}
      {...rest}
    />
  );
}
